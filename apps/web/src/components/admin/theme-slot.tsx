'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/client-api';

// Ô tải ảnh giao diện: xem trước ảnh hiện tại, chọn file là tải lên ngay, nút xóa để quay về mặc định
export function ThemeSlot({ slot, label, hint, maxKb, url, dark = false }: { slot: string; label: string; hint: string; maxKb: number; url: string | null; dark?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(url);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > maxKb * 1024) {
      setError(`Ảnh quá lớn: tối đa ${maxKb} KB`);
      return;
    }
    setPending(true);
    const form = new FormData();
    form.set('file', file);
    const res = await apiRequest<{ url: string }>(`/api/admin/theme/${slot}`, 'POST', form);
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Tải ảnh thất bại');
      return;
    }
    setCurrent(res.data.url);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Xóa ảnh "${label}" và quay về mặc định?`)) return;
    setPending(true);
    const res = await apiRequest(`/api/admin/theme/${slot}`, 'DELETE');
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Xóa thất bại');
      return;
    }
    setCurrent(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-800">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{hint}</p>
      </div>

      <div className={`grid h-32 place-items-center overflow-hidden rounded-lg border border-dashed ${dark ? 'border-white/10 bg-[#111c43]' : 'border-zinc-200 bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px]'}`}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={label} className="max-h-28 max-w-full object-contain" />
        ) : (
          <span className={`text-xs ${dark ? 'text-[#6c7bb0]' : 'text-zinc-400'}`}>Đang dùng mặc định</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,.ico"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
        <button type="button" className="btn-primary" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? 'Đang xử lý…' : current ? 'Đổi ảnh' : 'Tải ảnh lên'}
        </button>
        {current && (
          <button type="button" className="btn-ghost text-red-600" disabled={pending} onClick={remove}>
            Xóa
          </button>
        )}
        <span className="ml-auto text-[11px] text-zinc-400">Tối đa {maxKb} KB · PNG, JPG, WebP, GIF, ICO</span>
      </div>
    </div>
  );
}
