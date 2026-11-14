import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { ASSET_SLOTS, isAssetKey, sniffImage } from '@/lib/site-assets';

type Ctx = { params: Promise<{ key: string }> };

async function slotOf(params: Ctx['params']) {
  const { key } = await params;
  if (!isAssetKey(key)) throw notFound('Ô ảnh không tồn tại');
  return key;
}

// Tải ảnh lên (multipart, trường "file"): thay ảnh cũ của ô đó
export const POST = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const key = await slotOf(params);
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) throw badRequest('Chưa chọn ảnh');

    const maxBytes = ASSET_SLOTS[key].maxKb * 1024;
    if (file.size > maxBytes) throw badRequest(`Ảnh quá lớn: tối đa ${ASSET_SLOTS[key].maxKb} KB`);
    const data = Buffer.from(await file.arrayBuffer());
    const mime = sniffImage(data);
    if (!mime) throw badRequest('Chỉ nhận ảnh PNG, JPG, WebP, GIF hoặc ICO');

    const row = await prisma.siteAsset.upsert({
      where: { key },
      create: { key, data, mime, size: data.length },
      update: { data, mime, size: data.length },
      select: { updatedAt: true },
    });
    await writeAudit({ actorId: user.id, action: 'theme.upload', entity: 'SiteAsset', entityId: key, after: { mime, size: data.length }, ip: getClientIp(req) });
    return NextResponse.json({ url: `/api/assets/${key}?v=${row.updatedAt.getTime().toString(36)}` });
  },
  { superAdminOnly: true },
);

// Xóa ảnh: ô đó quay về giao diện mặc định
export const DELETE = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const key = await slotOf(params);
    await prisma.siteAsset.deleteMany({ where: { key } });
    await writeAudit({ actorId: user.id, action: 'theme.delete', entity: 'SiteAsset', entityId: key, ip: getClientIp(req) });
    return NextResponse.json({ ok: true });
  },
  { superAdminOnly: true },
);
