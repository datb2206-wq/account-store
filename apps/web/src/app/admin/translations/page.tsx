import type { Metadata } from 'next';
import { TranslationEditor, type TranslationRow } from '@/components/admin/translation-editor';
import { requireStaff } from '@/lib/auth';
import { LOCALE_META, LOCALES } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { flatten, getOverrides } from '@/lib/i18n-overrides';

export const metadata: Metadata = { title: 'Bản dịch' };

export default async function AdminTranslationsPage() {
  await requireStaff();

  const flat = Object.fromEntries(LOCALES.map((l) => [l, flatten(getDictionary(l))]));
  const rows: TranslationRow[] = Object.keys(flat.en!).map((key) => ({
    key,
    defaults: Object.fromEntries(LOCALES.map((l) => [l, flat[l]![key] ?? ''])) as TranslationRow['defaults'],
  }));
  const overrides = await getOverrides(true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bản dịch giao diện</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Sửa câu chữ hiển thị cho khách ({LOCALES.map((l) => LOCALE_META[l].name).join(', ')}) mà không cần sửa code. Để trống = dùng bản gốc.
          Giữ nguyên các biến dạng <code className="rounded bg-zinc-100 px-1">{'{name}'}</code>. Thay đổi áp dụng cho mọi trang sau tối đa 30 giây.
          Tên danh mục / sản phẩm dịch ở trang Danh mục và Sản phẩm.
        </p>
      </div>
      <TranslationEditor rows={rows} overrides={overrides} locales={LOCALES.map((l) => ({ code: l, name: LOCALE_META[l].name }))} />
    </div>
  );
}
