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
import { parseProxy, proxyFetch } from './suppliers/context';

export type TranslateSettings = ConfigValue<'translate'>;
export type TranslateLocale = TranslateSettings['targets'][number];

export const TRANSLATE_DEFAULTS: TranslateSettings = {
  provider: 'azure',
  azureKey: '',
  azureRegion: '',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  apiKey: '',
  proxy: '',
  model: 'claude-opus-5-5',
  targets: ['id'],
  description: false,
  autoNew: false,
  glossary: {},
};

// Đã có key cho nhà cung cấp đang chọn chưa
export const translateReady = (s: TranslateSettings) => (s.provider === 'azure' ? !!s.azureKey : s.provider === 'gemini' ? !!s.geminiKey.trim() : !!s.apiKey);

// Mã ngôn ngữ của Azure Translator
const AZURE_LANG: Record<TranslateLocale, string> = { en: 'en', id: 'id', ru: 'ru', zh: 'zh-Hans', pt: 'pt' };
// AZURE_TRANSLATOR_ENDPOINT chỉ dùng khi thử nghiệm với máy chủ giả lập
const AZURE_URL = `${process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'}/translate?api-version=3.0`; // không đặt from: Azure tự nhận ngôn ngữ gốc (thường là tiếng Việt)
// Giới hạn 1 request Azure: 1.000 đoạn, 50.000 ký tự -> chừa biên an toàn
const AZURE_MAX_CHARS = 45_000;
const AZURE_MAX_TEXTS = 500;

// Lỗi không nên thử lại (sai key, hết hạn mức miễn phí, sai region): dừng lượt dịch, hiện lỗi cho admin
class FatalTranslateError extends Error {}
// Tất cả key Gemini đều hết lượt free: giữ lượt dịch, tự dịch tiếp khi có lượt lại (không đánh dấu lỗi sản phẩm)
class QuotaWaitError extends Error {}

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
// Gemini free giới hạn số lượt/ngày -> gửi nhiều sản phẩm mỗi lượt (kết quả quá dài thì tự chia đôi)
const GEMINI_BATCH = 200;
const GEMINI_BATCH_DESC = 50;
const batchSize = (s: TranslateSettings, description: boolean) => (s.provider === 'gemini' ? (description ? GEMINI_BATCH_DESC : GEMINI_BATCH) : BATCH);
const TICK_BUDGET_MS = 40_000;
const JOB_KEY = 'translate.job';
// Tự dịch: "productId:locale" đã lỗi trong phiên worker này -> bỏ qua đến khi khởi động lại (tránh tốn tiền gọi lặp)
const autoSkip = new Set<string>();

export async function getTranslateSettings(): Promise<TranslateSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'translate' } });
  const parsed = CONFIG_SCHEMAS.translate.safeParse(row?.value);
  return parsed.success ? parsed.data : TRANSLATE_DEFAULTS;
}

// Mọi lệnh gọi API dịch đi qua proxy đã cài (nếu có)
const proxyOf = (s: TranslateSettings) => (s.proxy ? parseProxy(s.proxy) : null);
const tFetch = (s: TranslateSettings, url: string, init: RequestInit) => proxyFetch(proxyOf(s), url, init);
export const anthropicClient = (s: TranslateSettings) =>
  new Anthropic({ apiKey: s.apiKey, maxRetries: 3, ...(s.proxy && { fetch: ((url: string | URL | Request, init?: RequestInit) => tFetch(s, String(url instanceof Request ? url.url : url), init ?? {})) as typeof fetch }) });

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
- Shoppers are MMO / digital-marketing buyers (ads accounts, social accounts, emails). Vietnamese sellers use slang: clone, via (personal profile accounts), reg (registered / created), ngâm (aged), trust (high trust), BM (Business Manager), TKQC (ad account), ON2FA (2FA enabled), veri (verified), ngoại (foreign), cổ (old). Translate these into the words sellers in the target market actually use, not literally. Example for Brazilian Portuguese: "CLONE REG SẴN 1BM - VERI HOTMAIL TRUST - ON2FA" -> "Perfil com 1 BM Criada - Verificado no Hotmail Aquecido - 2FA Ativo".
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
    const res = await tFetch(s, `${AZURE_URL}&to=${AZURE_LANG[locale]}`, {
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

// Yêu cầu gửi AI: ngôn ngữ đích + bảng thuật ngữ admin đặt cho ngôn ngữ đó (nếu có) + danh sách cần dịch
// Văn phong dân chạy Ads / contingência ở Brazil (cố định trong code, không tính vào giới hạn bảng thuật ngữ)
const STYLE: Partial<Record<TranslateLocale, string>> = {
  pt: `Style guide for Brazilian contingency / paid-traffic buyers (follow strictly):
- Never write "Clone" in pt-BR (it sounds fake/hacked). clone = "Perfil". clone ngoại / clone nước ngoài = "Perfil Gringo".
- "Simples" only for cheap new profiles. Old profiles (UID 1000x / 10000x, or "cổ" / "old") are "Perfil Antigo", never "Simples".
- change full / changer full code mail = "Acesso Total (Troca de Senha e E-mail)". Never "Troca Completa" (sounds like a full refund/exchange).
- very / veri hotmail trust, hotmail ngâm = "Hotmail Confiável" (only profiles are "Aquecido"; never "Hotmail Aquecido"). Write "Acesso ao Hotmail" / "Acesso ao Gmail" only when the mail login is delivered; "veri gmail ... gmail no login" = "Verificado por Gmail (Sem Acesso ao Gmail)".
- qua 282 / kháng 282 / gỡ 282 / RD 282 = "Checkpoint 282 Resolvido". qua 956 = "Checkpoint 956 Resolvido". Never "Restabelecido".
- chuẩn <country> (e.g. chuẩn Pháp, Slovakia chuẩn) = "Origem <country>" (Origem França). Never "Padrão".
- nuôi / farm bài đăng nhiều ngày = "Aquecido com Postagens Reais". page tạo tay không share = "Página Própria (Criada no Perfil)".
- sll inbox admin / mua số lượng ib admin = "Para compras no atacado, fale com o suporte".
- Keep names short (ideally under 95 characters): type + age + friends + strongest feature. Do not repeat words.
- In descriptions write delivery formats like "UID | Senha | 2FA | E-mail | Senha E-mail" (PASS = Senha, MAIL = E-mail, PASS MAIL = Senha E-mail).`,
};

function userPrompt(s: TranslateSettings, items: Item[], locale: TranslateLocale) {
  const terms = (s.glossary?.[locale] ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const glossary = terms.length
    ? `\n\nGlossary for this market (source term = term buyers here use). Always use these exact target terms, matching the source term case-insensitively, and keep the rest of the rules:\n${terms.join('\n')}`
    : '';
  const style = STYLE[locale] ? `\n\n${STYLE[locale]}` : '';
  return `Target language: ${TRANSLATE_LANG[locale]}${style}${glossary}\n\nItems (JSON):\n${JSON.stringify(items)}`;
}

// Nhiều key Gemini (mỗi Gmail / project có lượt free riêng). Key hết lượt -> nghỉ 1 giờ rồi thử lại (lượt bị từ chối không bị tính).
export const geminiKeys = (s: TranslateSettings) => [...new Set(s.geminiKey.split(/[\s,;]+/).filter(Boolean))];
const geminiCooldown = new Map<string, number>();
const GEMINI_COOLDOWN_MS = 60 * 60_000;

export async function translateBatchGemini(s: TranslateSettings, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  try {
    return await geminiCall(s, items, locale);
  } catch (err) {
    // Kết quả quá dài / JSON hỏng với nhóm lớn -> chia đôi, dịch từng nửa
    if (err instanceof GeminiTooLong && items.length > 1) {
      const half = Math.ceil(items.length / 2);
      const a = await translateBatchGemini(s, items.slice(0, half), locale);
      const b = await translateBatchGemini(s, items.slice(half), locale);
      return new Map([...a, ...b]);
    }
    throw err;
  }
}
class GeminiTooLong extends Error {}

async function geminiCall(s: TranslateSettings, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt(s, items, locale) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, name: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['id', 'name', 'description'] } } },
        required: ['items'],
      },
      maxOutputTokens: 65536,
      temperature: 0.2,
    },
  });
  const keys = geminiKeys(s);
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const key = keys.find((k) => (geminiCooldown.get(k) ?? 0) <= now);
    if (!key) throw new QuotaWaitError(`Tất cả ${keys.length} key Gemini đã hết lượt free, hệ thống tự dịch tiếp khi có lượt lại (thường sau 15h giờ VN). Thêm key từ Gmail khác để dịch nhanh hơn.`);
    const res = await tFetch(s, `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(240_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } };
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini chặn nhóm này: ${data.promptFeedback.blockReason}`);
      const c = data.candidates?.[0];
      if (c?.finishReason === 'MAX_TOKENS') throw new GeminiTooLong('Kết quả quá dài (MAX_TOKENS)');
      const text = (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
      const parsed = ResultSchema.safeParse(parseJson(text));
      if (!parsed.success) throw new GeminiTooLong(`Gemini trả về JSON không đúng (${c?.finishReason ?? 'không có kết quả'})`);
      return new Map(parsed.data.items.map((i) => [i.id, i]));
    }
    const full = await res.text().catch(() => '');
    const detail = (/"message":\s*"([^"]{1,300})/.exec(full)?.[1] ?? full).slice(0, 300);
    // Hết lượt trong phút -> chờ rồi thử lại; hết lượt trong ngày -> nghỉ key đó (Google ghi loại giới hạn ở cuối lỗi: đọc cả lỗi)
    if (res.status === 429) {
      // Hết lượt trong ngày (hoặc key không có lượt free) -> nghỉ key này, dùng key kế
      if (/PerDay|per day|limit: 0/i.test(full)) {
        geminiCooldown.set(key, Date.now() + GEMINI_COOLDOWN_MS);
        continue;
      }
      // Hết lượt trong phút: còn key khác thì đổi key, không thì chờ
      if (keys.length > 1 && attempt < keys.length * 2) {
        geminiCooldown.set(key, Date.now() + 60_000);
        continue;
      }
      if (attempt < 3) {
        await sleep(20_000);
        continue;
      }
    }
    if (res.status === 503 && attempt < 3) {
      await sleep(20_000);
      continue;
    }
    // 400 sai key / 403 không có quyền / 404 sai tên model -> dừng hẳn
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw new FatalTranslateError(`Gemini ${res.status}: ${detail}`);
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }
}

async function translateBatch(client: Anthropic, s: TranslateSettings, items: Item[], locale: TranslateLocale): Promise<Map<string, Item>> {
  const response = await client.beta.messages.parse({
    model: s.model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: betaZodOutputFormat(ResultSchema) },
    ...(FALLBACK_MODELS.test(s.model) && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    messages: [
      {
        role: 'user',
        content: userPrompt(s, items, locale),
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
// Bản dịch đã khóa (admin duyệt chuẩn): không dịch lại, đồng bộ nguồn không ghi đè. Cờ lưu ở khóa 'lock' trong JSON tên.
export const isTranslationLocked = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && !!(v as Record<string, unknown>).lock;

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
  return s.provider === 'azure' || !client ? translateBatchAzure(s, items, locale) : translateBatch(client, s, items, locale);
}

// Dịch 1 nhóm sản phẩm sang 1 ngôn ngữ. Trả về số sản phẩm đã ghi.
async function translateProducts(client: Anthropic | null, s: TranslateSettings, ids: string[], locale: TranslateLocale, opts: { description: boolean; overwrite: boolean }) {
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, description: true } });
  const todo = products.filter((p) => !isTranslationLocked(p.name) && (opts.overwrite || !hasTranslation(p.name, locale)));
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
  const client = s.provider === 'claude' ? anthropicClient(s) : null;
  const started = Date.now();
  let job = await getTranslateJob();

  if (job?.status === 'RUNNING') {
    while (job.cursor < job.productIds.length && Date.now() - started < TICK_BUDGET_MS) {
      const ids = job.productIds.slice(job.cursor, job.cursor + batchSize(s, job.description));
      for (const locale of job.locales) {
        try {
          const r = await translateProducts(client, s, ids, locale, { description: job.description, overwrite: job.overwrite });
          job.translated += r.written;
          job.skipped += r.skipped;
        } catch (err) {
          // Hết lượt free: giữ nguyên vị trí, lần sau dịch tiếp đúng nhóm này
          if (err instanceof QuotaWaitError) {
            await saveJob({ ...job, error: err.message });
            log.warn(`translate waiting: ${err.message}`);
            return { waiting: true };
          }
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
      job.error = job.error?.startsWith('Tất cả ') ? null : job.error;
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
      if (err instanceof QuotaWaitError) break;
      log.warn(`auto translate categories (${locale}) failed: ${errText(err)}`);
      if (isFatal(err)) break;
    }
    const skip = [...autoSkip].filter((k) => !k.startsWith('cat:') && k.endsWith(`:${locale}`)).map((k) => k.slice(0, -locale.length - 1));
    const rows =
      locale === 'en'
        ? await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM products WHERE "isActive" = true AND name->>'src' IS NULL AND id <> ALL(${skip})
            ORDER BY "createdAt" DESC LIMIT ${batchSize(s, s.description)}`
        : await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM products WHERE "isActive" = true AND coalesce(name->>${locale}, '') = '' AND id <> ALL(${skip})
            ORDER BY "createdAt" DESC LIMIT ${batchSize(s, s.description)}`;
    if (!rows.length) continue;
    const ids = rows.map((r) => r.id);
    try {
      written += (await translateProducts(client, s, ids, locale, { description: s.description, overwrite: false })).written;
      // Sản phẩm vẫn chưa có bản dịch sau khi gọi (tên rỗng, Claude bỏ sót) -> không thử lại liên tục
      const still = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      for (const p of still) if (!hasTranslation(p.name, locale)) autoSkip.add(`${p.id}:${locale}`);
    } catch (err) {
      if (err instanceof QuotaWaitError) break;
      log.warn(`auto translate (${locale}) failed: ${errText(err)}`);
      if (isFatal(err)) break;
      for (const id of ids) autoSkip.add(`${id}:${locale}`);
    }
  }
  if (written) log.info(`auto translated ${written} products/categories`);
  return { auto: written };
}
