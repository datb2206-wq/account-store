'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ChangeEvent } from 'react';
import { apiRequest } from '@/lib/client-api';
import { FormAlert } from './form-field';

interface ImportResult {
  batch: string;
  total: number;
  imported: number;
  duplicateInInput: number;
  duplicateInStock: number;
}

export function StockImport({ productId }: { productId: string }) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const lineCount = useMemo(() => content.split(/\r?\n/).filter((l) => l.trim()).length, [content]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
    e.target.value = '';
  }

  async function onImport() {
    setPending(true);
    setError(null);
    setResult(null);
    const res = await apiRequest<ImportResult>(`/api/admin/products/${productId}/stock`, 'POST', { content });
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? res.data.fields?.content?.[0] ?? 'Nhập kho thất bại');
      return;
    }
    setResult(res.data);
    setContent('');
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Nhập kho</h2>
        <label className="btn-ghost cursor-pointer text-xs">
          Chọn file .txt
          <input type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={onFile} />
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Mỗi dòng là 1 tài khoản, định dạng tự do (user|pass|cookie, user:pass...). Dùng dấu | thì file CSV của khách sẽ tách đúng cột. Dữ liệu được mã hóa AES-256-GCM trước khi lưu. Dòng trống và dòng trùng (kể cả trùng với
        hàng đã có trong kho) sẽ tự động bị bỏ qua. Tối đa 10.000 dòng mỗi lần.
      </p>

      <FormAlert error={error} />
      {result && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Đã nhập <b>{result.imported}</b>/{result.total} dòng vào lô <span className="font-mono">{result.batch}</span>.
          {(result.duplicateInInput > 0 || result.duplicateInStock > 0) && (
            <span className="block text-xs text-emerald-700">
              Bỏ qua: {result.duplicateInInput} dòng trùng trong dữ liệu dán vào, {result.duplicateInStock} dòng đã có trong kho.
            </span>
          )}
        </div>
      )}

      <textarea
        className="input min-h-48 font-mono text-xs"
        placeholder={'user1|pass1|cookie1\nuser2:pass2:mail2@example.com:mailpass2'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{lineCount.toLocaleString()} dòng</span>
        <button type="button" className="btn-primary" disabled={pending || lineCount === 0} onClick={onImport}>
          {pending ? 'Đang mã hóa & nhập…' : 'Nhập vào kho'}
        </button>
      </div>
    </section>
  );
}
