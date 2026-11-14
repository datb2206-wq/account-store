import { prisma } from '@accszone/database';
import { isAssetKey } from '@/lib/site-assets';

type Ctx = { params: Promise<{ key: string }> };

// Ảnh giao diện công khai (logo, favicon...). Có ?v=<phiên bản> thì cache 1 năm: ảnh mới sẽ có URL mới.
export async function GET(req: Request, { params }: Ctx) {
  const { key } = await params;
  if (!isAssetKey(key)) return new Response('Not found', { status: 404 });
  const asset = await prisma.siteAsset.findUnique({ where: { key }, select: { data: true, mime: true } });
  if (!asset) return new Response('Not found', { status: 404 });

  const versioned = new URL(req.url).searchParams.has('v');
  return new Response(new Uint8Array(asset.data), {
    headers: {
      'Content-Type': asset.mime,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
