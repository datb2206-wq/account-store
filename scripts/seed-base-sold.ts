/**
 * Gán baseSold ngẫu nhiên 500–1200 (mỗi sản phẩm một giá trị) cho toàn bộ sản phẩm hiện có.
 * Chạy (từ packages/database): pnpm exec dotenv -e ../../.env -- tsx ../../scripts/seed-base-sold.ts
 */
import { PrismaClient } from '@prisma/client';

const MIN = 500;
const MAX = 1200;
const prisma = new PrismaClient();

async function main() {
  // random() được tính riêng cho từng dòng -> mỗi sản phẩm một số khác nhau trong [MIN, MAX]
  const n = await prisma.$executeRaw`UPDATE "products" SET "baseSold" = ${MIN}::int + floor(random() * (${MAX - MIN + 1}))::int`;
  console.log(`Đã gán baseSold (${MIN}–${MAX}) cho ${n} sản phẩm.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
