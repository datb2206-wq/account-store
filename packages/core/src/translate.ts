// Dịch tên / mô tả sản phẩm sang ngôn ngữ khác: Microsoft Azure Translator (mặc định, có gói miễn phí), Google Gemini (gói free) hoặc Claude (Anthropic API).
// Admin tạo 1 "lượt dịch" (danh sách sản phẩm + ngôn ngữ) -> lưu ở SystemConfig 'translate.job'.
// Worker mỗi phút chạy processTranslations(): dịch tiếp từng nhóm ~40 giây rồi dừng, lần sau làm tiếp (tắt máy không mất tiến độ).
// Tên gốc từ web nguồn thường là tiếng Việt -> tự nhận ngôn ngữ gốc. Dịch sang 'en' thì bản gốc được cất ở khóa 'src'
// (name.src / description.src) để lần đồng bộ sau vẫn so được với tên của web nguồn và không mất bản gốc.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z as z4 } from 'zod/v4';
import { prisma, type Prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, type ConfigValue } from './config';
import { domainError } from './errors';

export type TranslateSettings = ConfigValue<'translate'>;
export type TranslateLocale = TranslateSettings['targets'][number];

export const TRANSLATE_DEFAULTS: TranslateSettings = {
  provider: 'azure',
  azureKey: '',
  azureRegion: '',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  apiKey: '',
  model: 'claude-opus-5-5',
  targets: ['id'],
  description: false,
  autoNew: false,
};

// Đã có key cho nhà cung cấp đang chọn chưa
export const translateReady = (s: TranslateSettings) => (s.provider === 'azure' ? !!s.azureKey : s.provider === 'gemini' ? !!s.geminiKey : !!s.apiKey);

// Mã ngôn ngữ của Azure Translator
const AZURE_LANG: Record<TranslateLocale, string> = { en: 'en', id: 'id', ru: 'ru', zh: 'zh-Hans', pt: 'pt' };
// AZURE_TRANSLATOR_ENDPOINT chỉ dùng khi thử nghiệm với máy chủ giả lập
const AZURE_URL = `${process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'}/translate?api-version=3.0`; // không đặt from: Azure tự nhận ngôn ngữ gốc (thường là tiếng Việt)
// Giới hạn 1 request Azure: 1.000 đoạn, 50.000 ký tự -> chừa biên an toàn
const AZURE_MAX_CHARS = 45_000;
const AZURE_MAX_TEXTS = 500;

// Lỗi không nên thử lại (sai key, hết hạn mức miễn phí, sai region): dừng lượt dịch, hiện lỗi cho admin
class FatalTranslateError extends Error {}

export const TRANSLATE_LANG: Record<TranslateLocale, string> = {
  en: 'English',
  id: 'Indonesian (Bahasa Indonesia)',
  ru: 'Russian',
  zh: 'Simplified Chinese',
  pt: 'Brazilian Portuguese (pt-BR)',
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
  if (!translateReady(s)) throw domainError(400, 'Chưa nhập key dịch (Admin > Dịch sản phẩm > Cấu hình)');
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
Translate each item's name and description from its source language (usually Vietnamese, sometimes English) into the target language so shoppers who speak it understand them naturally.
Rules:
- Keep brand, platform and product names unchanged (Gmail, Facebook, TikTok, Instagram, Outlook, Telegram, ChatGPT, etc.).
- Keep numbers, years, quantities, country codes, units and technical abbreviations unchanged (2FA, PVA, IP, API, VPN, SMS, OTP, USA, EU).
- Keep separators and formatting characters such as | - : / [ ] ( ) and line breaks.
- Keep the meaning exact; do not add marketing claims or remove details.
- If the text is already in the target language, return it unchanged.
- Return every item with its original id. If a description is empty, return an empty string for it.`;

type Item = { id: string; name: string; description: string };

async function azureTranslate(s: TranslateSettings, texts: string[], locale: TranslateLocale): Promise<string[]> {
  const out: string[] = [];
  let i = 0;
  while (i < texts.length) {
    // Gom đoạn đến giới hạn ký tự / số đoạn của 1 request
    const chunk: string[] = [];
    let chars = 0;
    while (i < texts.length && chunk.length < AZURE_MAX_TEXTS && (chunk.length === 0 || chars + texts[i]!.length <= AZURE_MAX_CHARS)) {
      chunk.push(texts[i]!);
      chars += texts[i]!.length;
      i++;
    }
    const res = await fetch(`${AZURE_URL}&to=${AZURE_LANG[locale]}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': s.azureKey,
        ...(s.azureRegion && s.azureRegion !== 'global' && { 'Ocp-Apim-Subscription-Region': s.azureRegion }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk.map((Text) => ({ Text }))),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      // 401 sai key / sai region, 403 hết hạn mức miễn phí tháng này -> dừng hẳn
      if (res.status === 401 || res.status === 403) throw new FatalTranslateError(`Azure ${res.status}: ${detail}`);
      throw new Error(`Azure ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { translations?: { text: string }[] }[];
    if (!Array.isArray(data) || data.length !== chunk.length) throw new Error('Azure trả về kết quả không khớp');
    out.push(...data.map((d) => d.translations?.[0]?.text ?? ''));
  }
  return out;
}

async function translateBatchAzure(s: TranslateSettings, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  // Gửi 1 lượt: tên trước, mô tả (nếu có) sau
  const descIdx = items.map((it, k) => (it.description.trim() ? k : -1)).filter((k) => k >= 0);
  const texts = [...items.map((it) => it.name), ...descIdx.map((k) => items[k]!.description)];
  const result = await azureTranslate(s, texts, locale);
  const map = new Map<string, Item>(items.map((it, k) => [it.id, { id: it.id, name: result[k] ?? '', description: '' }]));
  descIdx.forEach((k, j) => {
    map.get(items[k]!.id)!.description = result[items.length + j] ?? '';
  });
  return map;
}

// Google Gemini (AI Studio): trả JSON theo schema. Gói free giới hạn số request / phút và / ngày.
const GEMINI_BASE = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parseJson = (t: string): unknown => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

async function translateBatchGemini(s: TranslateSettings, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: `Target language: ${TRANSLATE_LANG[locale]}\n\nItems (JSON):\n${JSON.stringify(items)}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, name: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['id', 'name', 'description'] } } },
        required: ['items'],
      },
      maxOutputTokens: 32000,
      temperature: 0.2,
    },
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': s.geminiKey, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } };
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini chặn nhóm này: ${data.promptFeedback.blockReason}`);
      const c = data.candidates?.[0];
      if (c?.finishReason === 'MAX_TOKENS') throw new Error('Kết quả quá dài (MAX_TOKENS)');
      const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
      const parsed = ResultSchema.safeParse(parseJson(text));
      if (!parsed.success) throw new Error(`Gemini trả về JSON không đúng (${c?.finishReason ?? 'không có kết quả'})`);
      return new Map(parsed.data.items.map((i) => [i.id, i]));
    }
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    // Hết lượt trong phút -> chờ rồi thử lại; hết lượt trong ngày -> dừng (hôm sau bấm dịch tiếp, phần đã dịch được giữ)
    if (res.status === 429 || res.status === 503) {
      if (/PerDay|per day/i.test(detail)) throw new FatalTranslateError(`Gemini hết lượt miễn phí hôm nay, mai bấm dịch tiếp: ${detail}`);
      if (attempt < 2) {
        await sleep(20_000);
        continue;
      }
    }
    // 400 sai key / 403 không có quyền / 404 sai tên model -> dừng hẳn
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw new FatalTranslateError(`Gemini ${res.status}: ${detail}`);
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }
}

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

// Văn bản gốc để dịch: bản của web nguồn đã cất ở 'src' (khi đã dịch sang en), không thì bản 'en'
export const sourceText = (v: unknown) => {
  const m = asMap(v);
  return m.src ?? m.en ?? Object.values(m)[0] ?? '';
};
// Đã có bản dịch cho locale chưa. Riêng 'en': chỉ coi là đã dịch khi có 'src' (bản en ban đầu là tên gốc chưa dịch)
export const hasTranslation = (v: unknown, locale: TranslateLocale) => {
  const m = asMap(v);
  return locale === 'en' ? m.src !== undefined : !!m[locale]?.trim();
};
// Ghi bản dịch, giữ nguyên các ngôn ngữ khác; dịch sang en thì cất bản gốc vào src
export function withTranslation(v: unknown, locale: TranslateLocale, text: string): Record<string, string> {
  const m = asMap(v);
  if (locale === 'en') return { ...m, src: m.src ?? m.en ?? '', en: text };
  return { ...m, [locale]: text };
}

// Dịch 1 nhóm (sản phẩm hoặc chuyên mục) sang 1 ngôn ngữ, trả về bản dịch theo id
function translateItems(client: Anthropic | null, s: TranslateSettings, items: Item[], locale: TranslateLocale) {
  if (s.provider === 'gemini') return translateBatchGemini(s, items, locale);
  return s.provider === 'azure' || !client ? translateBatchAzure(s, items, locale) : translateBatch(client, s.model, items, locale);
}

// Dịch 1 nhóm sản phẩm sang 1 ngôn ngữ. Trả về số sản phẩm đã ghi.
async function translateProducts(client: Anthropic | null, s: TranslateSettings, ids: string[], locale: TranslateLocale, opts: { description: boolean; overwrite: boolean }) {
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, description: true } });
  const todo = products.filter((p) => opts.overwrite || !hasTranslation(p.name, locale));
  const items: Item[] = todo
    .map((p) => ({
      id: p.id,
      name: sourceText(p.name).slice(0, 300),
      description: opts.description ? sourceText(p.description).slice(0, 3000) : '',
    }))
    .filter((i) => i.name.trim());
  if (!items.length) return { written: 0, skipped: products.length };
  const result = await translateItems(client, s, items, locale);
  let written = 0;
  for (const p of todo) {
    const t = result.get(p.id);
    if (!t?.name.trim()) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: withTranslation(p.name, locale, t.name.trim().slice(0, 300)),
        ...(opts.description && t.description.trim() && { description: withTranslation(p.description, locale, t.description.trim().slice(0, 5000)) }),
      },
    });
    written++;
  }
  return { written, skipped: products.length - todo.length };
}

// Tên chuyên mục (chuyên mục đồng bộ từ nguồn API thường là tiếng Việt). Trả về số chuyên mục đã ghi.
async function translateCategories(client: Anthropic | null, s: TranslateSettings, locale: TranslateLocale) {
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  const todo = cats.filter((c) => !hasTranslation(c.name, locale) && !autoSkip.has(`cat:${c.id}:${locale}`) && sourceText(c.name).trim()).slice(0, 200);
  if (!todo.length) return 0;
  const result = await translateItems(client, s, todo.map((c) => ({ id: c.id, name: sourceText(c.name).slice(0, 200), description: '' })), locale);
  let written = 0;
  for (const c of todo) {
    const t = result.get(c.id)?.name.trim();
    if (!t) {
      autoSkip.add(`cat:${c.id}:${locale}`);
      continue;
    }
    await prisma.category.update({ where: { id: c.id }, data: { name: withTranslation(c.name, locale, t.slice(0, 200)) } });
    written++;
  }
  return written;
}

const isFatal = (err: unknown) => err instanceof FatalTranslateError || err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError;

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
  if (!translateReady(s)) return { skipped: 'no api key' };
  const client = s.provider === 'claude' ? new Anthropic({ apiKey: s.apiKey, maxRetries: 3 }) : null;
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
    try {
      written += await translateCategories(client, s, locale);
    } catch (err) {
      log.warn(`auto translate categories (${locale}) failed: ${errText(err)}`);
      if (isFatal(err)) break;
    }
    const skip = [...autoSkip].filter((k) => !k.startsWith('cat:') && k.endsWith(`:${locale}`)).map((k) => k.slice(0, -locale.length - 1));
    const rows =
      locale === 'en'
        ? await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM products WHERE "isActive" = true AND name->>'src' IS NULL AND id <> ALL(${skip})
            ORDER BY "createdAt" DESC LIMIT ${BATCH}`
        : await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM products WHERE "isActive" = true AND coalesce(name->>${locale}, '') = '' AND id <> ALL(${skip})
            ORDER BY "createdAt" DESC LIMIT ${BATCH}`;
    if (!rows.length) continue;
    const ids = rows.map((r) => r.id);
    try {
      written += (await translateProducts(client, s, ids, locale, { description: s.description, overwrite: false })).written;
      // Sản phẩm vẫn chưa có bản dịch sau khi gọi (tên rỗng, Claude bỏ sót) -> không thử lại liên tục
      const still = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      for (const p of still) if (!hasTranslation(p.name, locale)) autoSkip.add(`${p.id}:${locale}`);
    } catch (err) {
      log.warn(`auto translate (${locale}) failed: ${errText(err)}`);
      if (isFatal(err)) break;
      for (const id of ids) autoSkip.add(`${id}:${locale}`);
    }
  }
  if (written) log.info(`auto translated ${written} products/categories`);
  return { auto: written };
}
