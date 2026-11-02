// Lấy hàng từ kho. PHẢI chạy trong transaction. Chỉ dùng phía server.
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@accszone/database';

// Lấy NGẪU NHIÊN `quantity` dòng còn trống và khóa lại. contentHash là HMAC (phân bố đều, không liên quan
// thứ tự nhập) nên quét từ 1 điểm ngẫu nhiên cho kết quả không đoán được và không theo lô nhập, mà không cần
// ORDER BY random() (phải sắp xếp toàn bộ hàng tồn, rất chậm với kho lớn). Đánh đổi: xác suất từng dòng
// không bằng nhau tuyệt đối. Hết hàng phía sau điểm đó thì quay vòng.
// SKIP LOCKED: nhiều người mua cùng lúc không phải chờ nhau, và không ai nhận trùng 1 tài khoản.
export async function pickRandomStock(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  const pivot = randomBytes(32).toString('hex');
  const items = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_items
    WHERE "productId" = ${productId} AND status = 'AVAILABLE' AND "contentHash" >= ${pivot}
    ORDER BY "contentHash" ASC
    LIMIT ${quantity}
    FOR UPDATE SKIP LOCKED`;
  if (items.length >= quantity) return items;

  const rest = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_items
    WHERE "productId" = ${productId} AND status = 'AVAILABLE' AND "contentHash" < ${pivot}
    ORDER BY "contentHash" ASC
    LIMIT ${quantity - items.length}
    FOR UPDATE SKIP LOCKED`;
  return [...items, ...rest];
}
