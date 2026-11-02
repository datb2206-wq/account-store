import { randomBytes } from 'node:crypto';

// Bỏ các ký tự dễ nhầm: 0/O, 1/I/L
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomCode(length: number) {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function datePart(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

// VD: 20261027-8F3K2
export function newImportBatchCode() {
  return `${datePart()}-${randomCode(5)}`;
}

// VD: ORD-20261027-8F3K2Q
export function newOrderCode() {
  return `ORD-${datePart()}-${randomCode(6)}`;
}
