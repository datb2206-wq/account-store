// Ảnh biên lai chuyển khoản khách tải lên. Lưu trong bảng uploaded_files (không ghi ra ổ đĩa:
// Vercel/serverless không giữ file giữa các lần chạy). Chỉ xem được qua route có kiểm tra quyền
// (/api/deposits/[id]/proof). File cũ từng lưu trên ổ đĩa (bản tự host trước đây) vẫn đọc được.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@accszone/database';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const LEGACY_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
const KEY_RE = /^proofs\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
type Ext = keyof typeof MIME;

// Nhận diện bằng "magic bytes" của nội dung, không tin tên file / Content-Type trình duyệt gửi
function sniff(buf: Buffer): Ext | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export class UploadError extends Error {}

export async function saveProof(file: File): Promise<string> {
  if (file.size > MAX_PROOF_BYTES) throw new UploadError('The receipt image must be 5 MB or smaller');
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new UploadError('Upload a JPG, PNG or WebP image');
  const key = `proofs/${randomUUID()}.${ext}`;
  await prisma.uploadedFile.create({ data: { key, data: buf, mime: MIME[ext], size: buf.length } });
  return key;
}

export async function readProof(key: string) {
  const m = KEY_RE.exec(key); // chỉ nhận đúng định dạng khóa do saveProof tạo (chặn path traversal ở nhánh đọc file cũ)
  if (!m) return null;
  const row = await prisma.uploadedFile.findUnique({ where: { key }, select: { data: true, mime: true } });
  if (row) return { data: Buffer.from(row.data), type: row.mime };
  try {
    return { data: await readFile(path.join(LEGACY_DIR, key)), type: MIME[m[1] as Ext] };
  } catch {
    return null;
  }
}

export async function deleteProof(key: string | null | undefined) {
  if (key && KEY_RE.test(key)) await prisma.uploadedFile.deleteMany({ where: { key } }).catch(() => {});
}
