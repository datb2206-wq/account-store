// Dịch tên / mô tả sản phẩm sang ngôn ngữ khác bằng Claude (Anthropic API).
// Admin tạo 1 "lượt dịch" (danh sách sản phẩm + ngôn ngữ) -> lưu ở SystemConfig 'translate.job'.
// Worker mỗi phút chạy processTranslations(): dịch tiếp từng nhóm ~40 giây rồi dừng, lần sau làm tiếp (tắt máy không mất tiến độ).
// Chỉ ghi vào ngôn ngữ đích ({ en, id, ru, zh }), không bao giờ sửa bản tiếng Anh gốc.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z as z4 } from 'zod/v4';
import { prisma, type Prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, type ConfigValue } from './config';
import { domainError } from './errors';

export type TranslateSettings = ConfigValue<'translate'>;
export type TranslateLocale = TranslateSettings['targets'][number];

export const TRANSLATE_DEFAULTS: TranslateSettings = { apiKey: '', model: 'claude-opus-5-5', targets: ['id'], description: false, autoNew: false };

export const TRANSLATE_LANG: Record<TranslateLocale, string> = {
  id: 'Indonesian (Bahasa Indonesia)',
  ru: 'Russian',
  zh: 'Simplified Chinese',
};

// Model hỗ trợ server-side fallback khi bị từ chối (Haiku không có)
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|fable-5|sonnet-5-5)/;
const BATCH = 25;
const TICK_BUDGET_MS = 40_000;
const JOB_KEY = 'translate.job';
// Tự dịch: "productId:locale" đã lỗi trong phiên worker này -> bỏ qua đến khi khởi động lại (tránh tốn tiền gọi lặp)
const autoSkip = new Set<string>();

export async function getTranslateSettings(): Promise<TranslateSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'translate' } });
  const parsed = CONFIG_SCHEMAS.translate.safeParse(row?.value);
  return parsed.success ? parsed.data : TRANSLATE_DEFAULTS;
}

export interface TranslateJob {
  id: string;
  status: 'RUNNING' | 'DONE' | 'STOPPED' | 'FAILED';
  locales: TranslateLocale[];
  description: boolean;
  overwrite: boolean; // false = chỉ dịch sản phẩm chưa có bản dịch (giữ tên admin tự sửa)
  productIds: string[];
  cursor: number; // số sản phẩm đã xử lý
  translated: number;
  skipped: number;
  failed: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getTranslateJob(): Promise<TranslateJob | null> {
  const row = await prisma.systemConfig.findUnique({ where: { key: JOB_KEY } });
  return (row?.value as unknown as TranslateJob) ?? null;
}

async function saveJob(job: TranslateJob) {
  const value = { ...job, updatedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue;
  await prisma.systemConfig.upsert({ where: { key: JOB_KEY }, update: { value }, create: { key: JOB_KEY, value, description: 'Tiến độ dịch sản phẩm' } });
}

export async function startTranslateJob(input: { productIds: string[]; locales: TranslateLocale[]; description: boolean; overwrite: boolean }) {
  const s = await getTranslateSettings();
  if (!s.apiKey) throw domainError(400, 'Chưa nhập API key Anthropic (Admin > Dịch sản phẩm)');
  if (!input.locales.length) throw domainError(400, 'Chọn ít nhất 1 ngôn ngữ');
  if (!input.productIds.length) throw domainError(400, 'Không có sản phẩm nào để dịch');
  const current = await getTranslateJob();
  if (current?.status === 'RUNNING') throw domainError(409, 'Đang có lượt dịch chạy. Đợi xong hoặc bấm Dừng trước.');
  const now = new Date().toISOString();
  const job: TranslateJob = {
    id: `tr_${Date.now()}`,
    status: 'RUNNING',
    locales: input.locales,
    description: input.description,
    overwrite: input.overwrite,
    productIds: input.productIds.slice(0, 20_000),
    cursor: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveJob(job);
  return job;
}

export async function stopTranslateJob() {
  const job = await getTranslateJob();
  if (job?.status === 'RUNNING') await saveJob({ ...job, status: 'STOPPED' });
}

const asMap = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});

const ResultSchema = z4.object({
  items: z4.array(z4.object({ id: z4.string(), name: z4.string(), description: z4.string() })),
});

const SYSTEM = `You translate product listings for an online store that sells digital accounts and online services.
Translate each item's name and description from English into the target language so shoppers who speak it understand them naturally.
Rules:
- Keep brand, platform and product names unchanged (Gmail, Facebook, TikTok, Instagram, Outlook, Telegram, ChatGPT, etc.).
- Keep numbers, years, quantities, country codes, units and technical abbreviations unchanged (2FA, PVA, IP, API, VPN, SMS, OTP, USA, EU).
- Keep separators and formatting characters such as | - : / [ ] ( ) and line breaks.
- Keep the meaning exact; do not add marketing claims or remove details.
- Return every item with its original id. If a description is empty, return an empty string for it.`;

type Item = { id: string; name: string; description: string };

async function translateBatch(client: Anthropic, model: string, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: betaZodOutputFormat(ResultSchema) },
    ...(FALLBACK_MODELS.test(model) && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    messages: [
      {
        role: 'user',
        content: `Target language: ${TRANSLATE_LANG[locale]}\n\nItems (JSON):\n${JSON.stringify(items)}`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude từ chối dịch nhóm này');
  if (response.stop_reason === 'max_tokens') throw new Error('Kết quả quá dài (max_tokens)');
  const out = response.parsed_output;
  if (!out) throw new Error('Không đọc được kết quả JSON');
  return new Map(out.items.map((i) => [i.id, i]));
}

type Log = { info: (m: string) => void; warn: (m: string) => void };

// Dịch 1 nhóm sản phẩm sang 1 ngôn ngữ. Trả về số sản phẩm đã ghi.
async function translateProducts(client: Anthropic, s: TranslateSettings, ids: string[], locale: TranslateLocale, opts: { description: boolean; overwrite: boolean }) {
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, description: true } });
  const todo = products.filter((p) => opts.overwrite || !asMap(p.name)[locale]?.trim());
  const items: Item[] = todo
    .map((p) => {
      const name = asMap(p.name).en ?? Object.values(asMap(p.name))[0] ?? '';
      const description = opts.description ? (asMap(p.description).en ?? '') : '';
      return { id: p.id, name: name.slice(0, 300), description: description.slice(0, 3000) };
    })
    .filter((i) => i.name.trim());
  if (!items.length) return { written: 0, skipped: products.length };
  const result = await translateBatch(client, s.model, items, locale);
  let written = 0;
  for (const p of todo) {
    const t = result.get(p.id);
    if (!t?.name.trim()) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: { ...asMap(p.name), [locale]: t.name.trim().slice(0, 300) },
        ...(opts.description && t.description.trim() && { description: { ...asMap(p.description), [locale]: t.description.trim().slice(0, 5000) } }),
      },
    });
    written++;
  }
  return { written, skipped: products.length - todo.length };
}

const isFatal = (err: unknown) => err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError;

const errText = (err: unknown) => (err instanceof Anthropic.APIError ? `Anthropic ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err)).slice(0, 500);

// Worker gọi mỗi phút: chạy tiếp lượt dịch đang dở, hết lượt thì dịch sản phẩm mới (nếu bật)
let busy = false;
export async function processTranslations(log: Log) {
  // Lượt trước chưa xong (gọi API lâu) -> bỏ qua, tránh 2 lượt dịch trùng nhau
  if (busy) return { busy: true };
  busy = true;
  try {
    return await runTranslations(log);
  } finally {
    busy = false;
  }
}

async function runTranslations(log: Log) {
  const s = await getTranslateSettings();
  if (!s.apiKey) return { skipped: 'no api key' };
  const client = new Anthropic({ apiKey: s.apiKey, maxRetries: 3 });
  const started = Date.now();
  let job = await getTranslateJob();

  if (job?.status === 'RUNNING') {
    while (job.cursor < job.productIds.length && Date.now() - started < TICK_BUDGET_MS) {
      const ids = job.productIds.slice(job.cursor, job.cursor + BATCH);
      for (const locale of job.locales) {
        try {
          const r = await translateProducts(client, s, ids, locale, { description: job.description, overwrite: job.overwrite });
          job.translated += r.written;
          job.skipped += r.skipped;
        } catch (err) {
          if (isFatal(err)) {
            await saveJob({ ...job, status: 'FAILED', error: errText(err) });
            log.warn(`translate stopped: ${errText(err)}`);
            return { failed: true };
          }
          job.failed += ids.length;
          job.error = errText(err);
          log.warn(`translate batch failed: ${job.error}`);
        }
      }
      job.cursor += ids.length;
      // Admin bấm Dừng giữa chừng -> tôn trọng
      const latest = await getTranslateJob();
      if (latest?.id !== job.id || latest.status !== 'RUNNING') return { stopped: true };
      await saveJob(job);
    }
    if (job.cursor >= job.productIds.length) {
      await saveJob({ ...job, status: 'DONE' });
      log.info(`translate done: ${job.translated} written, ${job.failed} failed`);
    }
    return { cursor: job.cursor, total: job.productIds.length };
  }

  // Tự dịch sản phẩm mới (chưa có bản dịch) cho từng ngôn ngữ đích
  if (!s.autoNew || !s.targets.length) return { idle: true };
  let written = 0;
  for (const locale of s.targets) {
    const skip = [...autoSkip].filter((k) => k.endsWith(`:${locale}`)).map((k) => k.slice(0, -locale.length - 1));
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products WHERE "isActive" = true AND coalesce(name->>${locale}, '') = '' AND id <> ALL(${skip})
      ORDER BY "createdAt" DESC LIMIT ${BATCH}`;
    if (!rows.length) continue;
    const ids = rows.map((r) => r.id);
    try {
      written += (await translateProducts(client, s, ids, locale, { description: s.description, overwrite: false })).written;
      // Sản phẩm vẫn chưa có bản dịch sau khi gọi (tên rỗng, Claude bỏ sót) -> không thử lại liên tục
      const still = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      for (const p of still) if (!asMap(p.name)[locale]?.trim()) autoSkip.add(`${p.id}:${locale}`);
    } catch (err) {
      log.warn(`auto translate (${locale}) failed: ${errText(err)}`);
      if (isFatal(err)) break;
      for (const id of ids) autoSkip.add(`${id}:${locale}`);
    }
  }
  if (written) log.info(`auto translated ${written} products`);
  return { auto: written };
}
