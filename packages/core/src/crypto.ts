// Mã hóa nội dung StockItem / API key Supplier. Chỉ dùng phía server.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
let keys: { enc: Buffer; hash: Buffer } | undefined;

function getKeys() {
  if (keys) return keys;
  const raw = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY phải là 32 bytes dạng base64 (xem hướng dẫn trong .env.example)');
  }
  // Tách khóa HMAC riêng bằng HKDF: không dùng chung 1 khóa cho 2 mục đích khác nhau
  const hash = Buffer.from(hkdfSync('sha256', raw, Buffer.alloc(0), 'accszone:content-hash', 32));
  keys = { enc: raw, hash };
  return keys;
}

// Định dạng lưu DB: "v1:<iv>:<authTag>:<ciphertext>" (base64). Có version để sau này đổi thuật toán/khóa.
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKeys().enc, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decrypt(payload: string) {
  const [version, iv, tag, ct] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Dữ liệu mã hóa không đúng định dạng');
  const decipher = createDecipheriv('aes-256-gcm', getKeys().enc, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

// HMAC-SHA256 thay vì SHA-256 trần: nếu DB bị lộ, kẻ tấn công không thể đoán-rồi-so-hash
// để xác nhận một tài khoản cụ thể có trong kho.
export function contentHash(plain: string) {
  return createHmac('sha256', getKeys().hash).update(plain, 'utf8').digest('hex');
}
