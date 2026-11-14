import type { Metadata } from 'next';
import { ThemeSlot } from '@/components/admin/theme-slot';
import { PageHeader, Panel } from '@/components/admin/ui';
import { requireStaff } from '@/lib/auth';
import { ASSET_SLOTS, getSiteAssets, type AssetKey } from '@/lib/site-assets';

export const metadata: Metadata = { title: 'Giao diện' };

const GROUPS: { title: string; keys: AssetKey[] }[] = [
  { title: 'Logo & biểu tượng', keys: ['logo', 'logoDark', 'favicon'] },
  { title: 'Trang chủ & chia sẻ', keys: ['banner', 'ogImage'] },
  { title: 'Ảnh mặc định', keys: ['productDefault', 'avatar'] },
];

export default async function AdminThemePage() {
  await requireStaff();
  const assets = await getSiteAssets();

  return (
    <div className="space-y-5">
      <PageHeader title="Giao diện" />
      <p className="text-sm text-zinc-500">
        Chọn ảnh là tải lên và áp dụng ngay. Tên website, liên hệ và chế độ bảo trì nằm ở <a href="/admin/settings" className="text-indigo-600 hover:underline">Cài đặt</a>.
      </p>
      {GROUPS.map((g) => (
        <Panel key={g.title} title={g.title}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.keys.map((key) => (
              <ThemeSlot key={key} slot={key} {...ASSET_SLOTS[key]} url={assets[key] ?? null} dark={key === 'logoDark'} />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
