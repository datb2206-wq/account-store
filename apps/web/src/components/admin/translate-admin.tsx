'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TranslateSettings } from '@accszone/core'; // chỉ kiểu
import { useI18n } from '@/i18n/client';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

export const LOCALE_LABEL = { en: 'Tiếng Anh', id: 'Tiếng Indonesia', ru: 'Tiếng Nga', zh: 'Tiếng Trung', pt: 'Tiếng Bồ Đào Nha (Brazil)' } as const;
type Locale = keyof typeof LOCALE_LABEL;

const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (mặc định, dịch tốt nhất)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (rẻ hơn ~2 lần)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (rẻ nhất, ~40 lần)'],
] as const;

export function TranslateSettingsForm({ initial, hasKey, hasAzureKey, hasGeminiKey, hasProxy = false, geminiKeyCount = 0 }: { initial: Omit<TranslateSettings, 'apiKey' | 'azureKey' | 'geminiKey' | 'proxy'>; hasKey: boolean; hasAzureKey: boolean; hasGeminiKey: boolean; hasProxy?: boolean; geminiKeyCount?: number }) {
  const router = useRouter();
  // Ngôn ngữ đã ẩn khỏi web thì không dịch nữa (lưu lại cấu hình sẽ bỏ chúng khỏi danh sách)
  const { locales } = useI18n();
  const isActiveLocale = (l: string) => (locales as readonly string[]).includes(l);
  const [f, setF] = useState({ ...initial, targets: initial.targets.filter((l) => isActiveLocale(l)), apiKey: '', azureKey: '', geminiKey: '', proxy: '', clearProxy: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toggle = (l: Locale) => setF((s) => ({ ...s, targets: s.targets.includes(l) ? s.targets.filter((x) => x !== l) : [...s.targets, l] }));

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest('/api/admin/translate', 'PUT', f);
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lưu thất bại');
    setSuccess('Đã lưu cấu hình dịch.');
    setF((s) => ({ ...s, apiKey: '', azureKey: '', geminiKey: '', proxy: '', clearProxy: false }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <span className="block font-medium text-zinc-700">Dịch bằng</span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="radio" checked={f.provider === 'azure'} onChange={() => setF((s) => ({ ...s, provider: 'azure' }))} />Microsoft Azure Translator <span className="rounded bg-emerald-50 px-1.5 text-xs font-medium text-emerald-700">miễn phí 2 triệu ký tự/tháng</span></label>
          <label className="flex items-center gap-2"><input type="radio" checked={f.provider === 'gemini'} onChange={() => setF((s) => ({ ...s, provider: 'gemini' }))} />Google Gemini <span className="rounded bg-emerald-50 px-1.5 text-xs font-medium text-emerald-700">miễn phí, không cần thẻ</span></label>
          <label className="flex items-center gap-2"><input type="radio" checked={f.provider === 'claude'} onChange={() => setF((s) => ({ ...s, provider: 'claude' }))} />Claude AI (trả phí, dịch tự nhiên hơn)</label>
        </div>
      </div>

      {f.provider === 'azure' && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Key Azure Translator (KEY 1)</span>
              <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasAzureKey ? '•••••••• (để trống = giữ nguyên)' : ''} value={f.azureKey} onChange={(e) => setF((s) => ({ ...s, azureKey: e.target.value.trim() }))} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Location / Region</span>
              <input className="input font-mono" placeholder="VD southeastasia" value={f.azureRegion} onChange={(e) => setF((s) => ({ ...s, azureRegion: e.target.value.trim().toLowerCase() }))} />
            </label>
          </div>
          <ol className="list-decimal space-y-0.5 rounded-lg bg-zinc-50 py-3 pr-3 pl-8 text-xs text-zinc-600">
            <li>Đăng ký tài khoản miễn phí ở portal.azure.com (cần thẻ Visa/Mastercard để xác minh, không bị trừ tiền khi dùng gói Free).</li>
            <li>Tìm &quot;Translator&quot; → Create → Pricing tier chọn <b>Free F0</b>, Region chọn <b>Southeast Asia</b> → Review + create.</li>
            <li>Mở resource vừa tạo → <b>Keys and Endpoint</b> → copy <b>KEY 1</b> và <b>Location/Region</b> dán vào 2 ô trên.</li>
          </ol>
        </div>
      )}

      {f.provider === 'gemini' && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">API key Gemini {hasGeminiKey && <span className="font-normal text-emerald-600">(đang lưu {geminiKeyCount} key)</span>}</span>
              <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasGeminiKey ? '•••••••• (để trống = giữ nguyên)' : 'AIza..., AIza...'} value={f.geminiKey} onChange={(e) => setF((s) => ({ ...s, geminiKey: e.target.value.trim() }))} />
              <span className="mt-1 block text-xs text-zinc-400">Nhiều key thì cách nhau dấu phẩy. Nhập mới sẽ thay toàn bộ key cũ, nên dán lại đủ tất cả key.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Model</span>
              <input className="input font-mono" value={f.geminiModel} onChange={(e) => setF((s) => ({ ...s, geminiModel: e.target.value.trim() }))} />
              <span className="mt-1 block text-xs text-zinc-400">Để gemini-flash-latest (luôn là bản Flash mới nhất, có gói free).</span>
            </label>
          </div>
          <ol className="list-decimal space-y-0.5 rounded-lg bg-zinc-50 py-3 pr-3 pl-8 text-xs text-zinc-600">
            <li>Vào aistudio.google.com/api-keys, đăng nhập Gmail → <b>Create API key</b> (hoặc bấm nút copy ở key có sẵn).</li>
            <li>Dán key vào ô trên → Lưu. Key chỉ lưu trên server, không hiện ra trình duyệt.</li>
            <li>Gói free giới hạn lượt/ngày theo từng Gmail: tạo key ở nhiều Gmail khác nhau rồi dán hết vào (cách nhau dấu phẩy) để dịch được nhiều hơn. Key cùng 1 Gmail dùng chung lượt.</li>
            <li>Mỗi lượt gửi 200 sản phẩm (50 nếu dịch cả mô tả). Hết lượt thì hệ thống tự chờ và dịch tiếp khi có lượt lại, không cần bấm lại.</li>
          </ol>
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Proxy HTTP {hasProxy && !f.clearProxy && <span className="font-normal text-emerald-600">(đang dùng proxy)</span>}</span>
        <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasProxy ? '•••••••• (để trống = giữ nguyên)' : 'ip:port:user:pass hoặc user:pass@ip:port'} value={f.proxy} disabled={f.clearProxy} onChange={(e) => setF((s) => ({ ...s, proxy: e.target.value.trim() }))} />
        <span className="mt-1 block text-xs text-zinc-400">Máy chủ ở Hồng Kông bị Gemini / Claude chặn khu vực: dán proxy HTTP (IP Việt Nam, Mỹ, Singapore...) để gọi API dịch qua proxy. Không dùng Socks5. Proxy chỉ lưu trên server.</span>
        {hasProxy && (
          <span className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" checked={f.clearProxy} onChange={(e) => setF((s) => ({ ...s, clearProxy: e.target.checked, proxy: '' }))} /> Bỏ proxy (gọi thẳng)
          </span>
        )}
      </label>

      <div className={`grid gap-4 sm:grid-cols-2 ${f.provider === 'claude' ? '' : 'hidden'}`}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">API key Anthropic</span>
          <input className="input font-mono" type="password" autoComplete="new-password" placeholder={hasKey ? '•••••••• (để trống = giữ nguyên)' : 'sk-ant-...'} value={f.apiKey} onChange={(e) => setF((s) => ({ ...s, apiKey: e.target.value.trim() }))} />
          <span className="mt-1 block text-xs text-zinc-400">Tạo key ở console.anthropic.com → API Keys (cần nạp credit). Key chỉ lưu trên server.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Model</span>
          <select className="input" value={f.model} onChange={(e) => setF((s) => ({ ...s, model: e.target.value }))}>
            {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {!MODELS.some(([v]) => v === f.model) && <option value={f.model}>{f.model}</option>}
          </select>
        </label>
      </div>
      <div className="space-y-2 text-sm">
        <span className="block font-medium text-zinc-700">Dịch sang</span>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(LOCALE_LABEL) as Locale[]).filter((l) => isActiveLocale(l)).map((l) => (
            <label key={l} className="flex items-center gap-2"><input type="checkbox" checked={f.targets.includes(l)} onChange={() => toggle(l)} />{LOCALE_LABEL[l]}</label>
          ))}
        </div>
      </div>
      {f.targets.length > 0 && (
        <div className="space-y-2 text-sm">
          <span className="block font-medium text-zinc-700">Bảng thuật ngữ MMO theo thị trường</span>
          <p className="text-xs text-zinc-500">
            Mỗi dòng <code>từ gốc = từ dân MMO ở nước đó dùng</code>. AI luôn dịch đúng các từ này thay vì tự đoán. Dòng bắt đầu bằng # là ghi chú.
            {f.provider === 'azure' && <b className="text-amber-700"> Azure dịch máy, không dùng được bảng thuật ngữ: chọn Gemini hoặc Claude.</b>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {f.targets.map((l) => (
              <label key={l} className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600">{LOCALE_LABEL[l]}</span>
                <textarea
                  className="input min-h-32 font-mono text-xs"
                  maxLength={8000}
                  placeholder={l === 'pt' ? '# Mỗi dòng: từ gốc = từ dân MMO ở thị trường này dùng\nvia = perfil antigo\nclone = perfil novo\nTKQC = conta de anúncio\nngâm = aquecido' : 'via = ...'}
                  value={f.glossary?.[l] ?? ''}
                  onChange={(e) => setF((s) => ({ ...s, glossary: { ...s.glossary, [l]: e.target.value } }))}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {f.targets.length > 0 && f.provider !== 'azure' && (
        <div className="space-y-2 text-sm">
          <span className="block font-medium text-zinc-700">Prompt dịch riêng (System Instruction)</span>
          <p className="text-xs text-zinc-500">
            Dán bản Master Prompt vào đây. Có prompt thì AI dùng prompt này <b>thay cho</b> quy tắc mặc định và bảng thuật ngữ ở trên, mỗi sản phẩm gửi kèm <code>category</code>, <code>price_brl</code>, <code>raw_title</code>, <code>raw_bio</code> (temperature 0.15). Để trống = dùng mặc định.
          </p>
          {f.targets.map((l) => (
            <label key={l} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">{LOCALE_LABEL[l]} {f.prompt?.[l]?.trim() ? <span className="text-emerald-600">(đang dùng prompt riêng · {f.prompt[l]!.length.toLocaleString('en-US')} ký tự)</span> : null}</span>
              <textarea
                className="input min-h-48 font-mono text-xs"
                maxLength={30000}
                placeholder="You are a Senior Brazilian Copywriter and Localization Specialist..."
                value={f.prompt?.[l] ?? ''}
                onChange={(e) => setF((s) => ({ ...s, prompt: { ...s.prompt, [l]: e.target.value } }))}
              />
            </label>
          ))}
        </div>
      )}
      {f.targets.length > 0 && (
        <div className="space-y-2 text-sm">
          <span className="block font-medium text-zinc-700">Quy tắc sửa tự động (sau khi AI dịch)</span>
          <p className="text-xs text-zinc-500">
            Mỗi dòng <code>cụm sai =&gt; cụm đúng</code>. Mỗi lần AI dịch xong (dịch hàng loạt, dịch sản phẩm đã chọn, AI gợi ý), web tự thay theo danh sách này <b>trước khi ghi</b>, nên lỗi đã sửa 1 lần không quay lại. Không phân biệt hoa / thường; để trống bên phải = xóa cụm đó. Không dùng AI, không tốn tiền.
          </p>
          {f.targets.map((l) => (
            <label key={l} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">{LOCALE_LABEL[l]}</span>
              <textarea
                className="input min-h-28 font-mono text-xs"
                maxLength={8000}
                placeholder={'# Ví dụ\nReg Celular => Criado no Celular\nClone => Perfil\nGarantia de Saúde => Alta Estabilidade'}
                value={f.fixRules?.[l] ?? ''}
                onChange={(e) => setF((s) => ({ ...s, fixRules: { ...s.fixRules, [l]: e.target.value } }))}
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.checked }))} />Dịch cả mô tả (dài hơn tên khoảng 5–10 lần: tốn hạn mức / chi phí hơn)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.autoNew} onChange={(e) => setF((s) => ({ ...s, autoNew: e.target.checked }))} />Tự dịch sản phẩm mới / chưa có bản dịch (worker kiểm tra mỗi phút)</label>
      </div>
      <FormAlert error={error} success={success} />
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
    </div>
  );
}

type PreviewRow = { id: string; category: string; priceBrl: number | null; rawTitle: string; rawBio: string; name: string; description: string };

// Dịch thử ~10 sản phẩm mẫu với cấu hình đã LƯU, chỉ hiển thị kết quả, không ghi vào web
export function TranslatePreview() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  async function run() {
    setPending(true);
    setError(null);
    const res = await apiRequest<{ items: PreviewRow[] }>('/api/admin/translate/preview', 'POST', { locale: 'pt' });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Dịch thử thất bại');
    setRows(res.data.items);
  }
  const brl = (n: number | null) => (n == null ? '' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">Tự chọn khoảng 10 sản phẩm đại diện (Matriz, 282, có Page, Gmail/Hotmail, Instagram) và dịch sang tiếng Bồ bằng cấu hình đã lưu. <b>Không ghi vào web</b>: ưng kết quả rồi mới bấm &quot;Dịch lại tất cả&quot;. Mất khoảng 30–90 giây.</p>
      <button type="button" className="btn-primary" disabled={pending} onClick={run}>{pending ? 'Đang dịch thử…' : '🧪 Dịch thử 10 sản phẩm mẫu'}</button>
      <FormAlert error={error} success={null} />
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-zinc-500"><tr><th className="py-2 pr-3">Gốc (tiếng Việt)</th><th className="py-2">Bản dịch thử (tiếng Bồ)</th></tr></thead>
            <tbody className="divide-y divide-zinc-100 align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="w-1/2 py-3 pr-3">
                    <p className="text-xs text-zinc-400">{r.category} · {brl(r.priceBrl)}</p>
                    <p className="font-medium text-zinc-800">{r.rawTitle}</p>
                    {r.rawBio && <p className="mt-1 text-xs whitespace-pre-line text-zinc-500">{r.rawBio}</p>}
                  </td>
                  <td className="w-1/2 py-3">
                    <p className="font-medium text-emerald-800">{r.name || <span className="text-red-600">(AI không trả về)</span>} <span className="text-xs font-normal text-zinc-400">{r.name.length} ký tự</span></p>
                    {r.description && <p className="mt-1 text-xs whitespace-pre-line text-zinc-600">{r.description}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type FileCheck = {
  rows: number;
  errors: number;
  changes: number;
  unchanged: number;
  errorList?: { row: number; id: string; reason: string }[];
  items?: { id: string; row: number; src: string; oldName: string; newName: string | null; oldBio: string; newBio: string | null }[];
  written?: number;
};

// Xuất file CSV bản dịch -> sửa ngoài web (Excel / Google Sheets / Gemini) -> nhập lại: kiểm tra lệch dòng, xem trước, ghi + khóa
export function TranslateFile({ pendingCount = 0 }: { pendingCount?: number }) {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [check, setCheck] = useState<FileCheck | null>(null);

  async function pick(file: File | undefined) {
    setCheck(null);
    setError(null);
    setSuccess(null);
    if (!file) return;
    if (file.size > 8_000_000) return setError('File quá lớn (tối đa 8 MB)');
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    call(text, false);
  }

  async function call(text: string, apply: boolean) {
    setPending(true);
    setError(null);
    const res = await apiRequest<FileCheck>('/api/admin/translate/file', 'POST', { csv: text, apply });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Không đọc được file');
    if (!apply) return setCheck(res.data);
    setCheck(null);
    setCsv(null);
    setSuccess(`Đã nhập ${res.data.written?.toLocaleString('en-US') ?? 0} sản phẩm và khóa bản dịch.${res.data.errors ? ` Bỏ qua ${res.data.errors} dòng lỗi.` : ''}`);
    router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-500">
        <b>B1.</b> Tải file CSV: <b>chỉ sản phẩm chưa dịch / chưa duyệt</b> (hàng mới từ API, sản phẩm mới thêm), hoặc toàn bộ sản phẩm (cả đang ẩn). <b>B2.</b> Sửa 2 cột <code>title_pt</code>, <code>bio_pt</code> bằng Excel / Google Sheets / Gemini, <b>giữ nguyên cột id và tên gốc</b>. <b>B3.</b> Chọn file đã sửa: web kiểm tra từng dòng (đúng id, tên gốc khớp id để không lộn sản phẩm), hiện bảng thay đổi, bấm Nhập mới ghi. Sản phẩm được nhập tự khóa bản dịch.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a href="/api/admin/translate/file?only=pending" className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${pendingCount ? 'bg-amber-600 hover:bg-amber-700' : 'pointer-events-none bg-zinc-300'}`} aria-disabled={!pendingCount}>⬇️ Tải file sản phẩm chưa dịch / chưa duyệt ({pendingCount.toLocaleString('en-US')})</a>
        <a href="/api/admin/translate/file" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">⬇️ Tải file CSV (toàn bộ sản phẩm)</a>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
          📤 Nhập file đã sửa…
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {fileName && <span className="text-xs text-zinc-500">{fileName}</span>}
        {pending && <span className="text-xs text-zinc-500">Đang xử lý…</span>}
      </div>
      <FormAlert error={error} success={success} />
      {check && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-zinc-50 px-4 py-3">
            <span>Tổng <b>{check.rows}</b> dòng</span>
            <span className="text-emerald-700">Sẽ cập nhật <b>{check.changes}</b></span>
            <span className="text-zinc-500">Không đổi {check.unchanged}</span>
            <span className={check.errors ? 'text-red-600' : 'text-zinc-500'}>Lỗi (bỏ qua) <b>{check.errors}</b></span>
          </div>
          {!!check.errorList?.length && (
            <div className="max-h-56 overflow-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {check.errorList.map((e) => <p key={`${e.row}-${e.id}`}>Dòng {e.row} {e.id && <code>{e.id}</code>}: {e.reason}</p>)}
            </div>
          )}
          {check.changes > 0 && (
            <>
              <div className="max-h-[480px] overflow-auto rounded-lg border border-zinc-200">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500"><tr><th className="px-3 py-2">Tên gốc</th><th className="px-3 py-2">Đang trên web</th><th className="px-3 py-2">Sẽ ghi</th></tr></thead>
                  <tbody className="divide-y divide-zinc-100 align-top">
                    {check.items?.map((c) => (
                      <tr key={c.id}>
                        <td className="w-1/4 px-3 py-2 text-xs text-zinc-500"><span className="text-zinc-400">Dòng {c.row} · </span>{c.src}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{c.newName !== null && <p className="font-medium">{c.oldName}</p>}{c.newBio !== null && <p className="mt-1 whitespace-pre-line">{c.oldBio}</p>}</td>
                        <td className="px-3 py-2 text-xs text-emerald-800">{c.newName !== null && <p className="font-medium">{c.newName}</p>}{c.newBio !== null && <p className="mt-1 whitespace-pre-line">{c.newBio}</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn-primary" disabled={pending || !csv} onClick={() => csv && window.confirm(`Nhập ${check.changes} sản phẩm vào web và khóa bản dịch?`) && call(csv, true)}>
                {pending ? 'Đang nhập…' : `✅ Nhập ${check.changes.toLocaleString('en-US')} sản phẩm`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type ReplaceRow = { id: string; field: 'name' | 'description'; before: string; after: string };

// Tìm & thay thế 1 cụm trong bản dịch tiếng Bồ (không dùng AI, không tốn tiền): xem trước rồi mới áp dụng
export function TranslateReplace() {
  const router = useRouter();
  const [f, setF] = useState({ find: '', replace: '', field: 'both' as 'name' | 'description' | 'both', matchCase: false, lock: true, saveRule: true });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ products: number; changes: number; items: ReplaceRow[]; key: string } | null>(null);
  const key = JSON.stringify([f.find, f.replace, f.field, f.matchCase]);

  async function call(apply: boolean) {
    setPending(true);
    setError(null);
    setSuccess(null);
    const res = await apiRequest<{ products: number; changes: number; items?: ReplaceRow[]; ruleSaved?: boolean }>('/api/admin/translate/replace', 'POST', { ...f, locale: 'pt', apply });
    setPending(false);
    if (!res.ok) return setError(res.data.error ?? 'Lỗi');
    if (!apply) return setPreview({ products: res.data.products, changes: res.data.changes, items: res.data.items ?? [], key });
    setPreview(null);
    setSuccess(`Đã sửa ${res.data.products.toLocaleString('en-US')} sản phẩm${f.lock ? ' và khóa bản dịch' : ''}.${res.data.ruleSaved ? ' Đã lưu vào Quy tắc sửa tự động: lần dịch sau AI tự sửa cụm này.' : ''}`);
    router.refresh();
  }

  function apply() {
    if (!preview) return;
    if (!window.confirm(`Thay "${f.find}" → "${f.replace || '(xóa)'}" trong ${preview.products} sản phẩm?`)) return;
    call(true);
  }

  // Tô màu cụm tìm thấy trong bản cũ
  const mark = (text: string) => {
    const re = new RegExp(`(${f.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, f.matchCase ? 'g' : 'gi');
    return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-red-100 px-0.5 text-red-700">{part}</mark> : part));
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-500">
        Sửa đúng 1 cụm từ sai trong <b>bản tiếng Bồ</b> của mọi sản phẩm, VD <code>Reg Celular</code> → <code>Criado no Celular</code>. <b>Không dùng AI, không tốn tiền</b>, phần còn lại của tên / mô tả giữ nguyên. Để trống ô &quot;Thay bằng&quot; = xóa cụm đó.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Tìm cụm sai</span>
          <input className="input" maxLength={300} value={f.find} placeholder="Reg Celular" onChange={(e) => setF((s) => ({ ...s, find: e.target.value }))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Thay bằng</span>
          <input className="input" maxLength={300} value={f.replace} placeholder="Criado no Celular" onChange={(e) => setF((s) => ({ ...s, replace: e.target.value }))} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <select className="input h-9 w-auto py-0" value={f.field} onChange={(e) => setF((s) => ({ ...s, field: e.target.value as typeof s.field }))}>
          <option value="both">Tên + mô tả</option>
          <option value="name">Chỉ tên</option>
          <option value="description">Chỉ mô tả</option>
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.matchCase} onChange={(e) => setF((s) => ({ ...s, matchCase: e.target.checked }))} /> Phân biệt hoa / thường</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.lock} onChange={(e) => setF((s) => ({ ...s, lock: e.target.checked }))} /> 🔒 Khóa bản dịch các sản phẩm đã sửa</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.saveRule} onChange={(e) => setF((s) => ({ ...s, saveRule: e.target.checked }))} /> ♻️ Lưu thành quy tắc sửa tự động (AI dịch sau này tự sửa)</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost border border-zinc-200" disabled={pending || !f.find.trim()} onClick={() => call(false)}>{pending && !preview ? 'Đang tìm…' : '🔍 Xem trước'}</button>
        {preview && preview.key === key && preview.products > 0 && (
          <button type="button" className="btn-primary" disabled={pending} onClick={apply}>{pending ? 'Đang sửa…' : `✅ Áp dụng cho ${preview.products.toLocaleString('en-US')} sản phẩm`}</button>
        )}
      </div>
      <FormAlert error={error} success={success} />
      {preview && preview.key === key && (
        preview.products === 0 ? (
          <p className="text-zinc-500">Không tìm thấy &quot;{f.find}&quot; trong bản tiếng Bồ nào.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-zinc-600">Tìm thấy trong <b>{preview.products}</b> sản phẩm ({preview.changes} chỗ){preview.items.length < preview.changes ? `, hiện ${preview.items.length} chỗ đầu` : ''}:</p>
            <div className="max-h-[480px] overflow-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500"><tr><th className="px-3 py-2">Hiện tại</th><th className="px-3 py-2">Sau khi sửa</th></tr></thead>
                <tbody className="divide-y divide-zinc-100 align-top">
                  {preview.items.map((r) => (
                    <tr key={`${r.id}-${r.field}`}>
                      <td className="w-1/2 px-3 py-2 whitespace-pre-line text-zinc-700"><span className="mr-1 text-xs text-zinc-400">{r.field === 'name' ? 'Tên' : 'Mô tả'}:</span>{mark(r.before)}</td>
                      <td className="w-1/2 px-3 py-2 whitespace-pre-line text-emerald-800">{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export function TranslateActions({ running, canStart }: { running: boolean; canStart: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function start(overwrite: boolean) {
    const msg = overwrite
      ? 'Dịch LẠI toàn bộ sản phẩm đang bán? Tên bạn đã tự sửa ở các ngôn ngữ đích sẽ bị thay bằng bản dịch mới.'
      : 'Dịch tất cả sản phẩm đang bán CHƯA có bản dịch?';
    if (!window.confirm(msg)) return;
    setPending(true);
    const res = await apiRequest<{ total: number }>('/api/admin/translate/start', 'POST', { all: true, overwrite });
    setPending(false);
    if (!res.ok) return window.alert(res.data.error ?? 'Không bắt đầu được');
    router.refresh();
  }
  async function stop() {
    setPending(true);
    await apiRequest('/api/admin/translate/stop', 'POST');
    setPending(false);
    router.refresh();
  }
  if (running) return <button type="button" className="btn-ghost border border-red-200 text-red-600" disabled={pending} onClick={stop}>Dừng lượt dịch</button>;
  return (
    <span className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary" disabled={pending || !canStart} onClick={() => start(false)}>🌐 Dịch sản phẩm chưa có bản dịch</button>
      <button type="button" className="btn-ghost border border-zinc-200" disabled={pending || !canStart} onClick={() => start(true)}>Dịch lại tất cả</button>
    </span>
  );
}
