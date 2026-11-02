import { getRedis } from './redis';

// Cache kết quả query nặng trong Redis. Redis lỗi -> đọc thẳng DB, trang vẫn chạy bình thường.
// Chỉ dùng cho dữ liệu HIỂN THỊ; quyết định về tiền và tồn kho luôn đọc DB trong transaction.
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const redisKey = `cache:${key}`;
  try {
    const hit = await getRedis().get(redisKey);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    return load();
  }
  const value = await load();
  await getRedis().set(redisKey, JSON.stringify(value), 'EX', ttlSec).catch(() => {});
  return value;
}

export async function invalidateCache(...keys: string[]) {
  try {
    await getRedis().del(...keys.map((k) => `cache:${k}`));
  } catch {
    // Không xóa được thì cache tự hết hạn sau vài giây; không làm hỏng thao tác vừa commit
  }
}

export const SHOP_STOCK_CACHE = 'shop:stock';
