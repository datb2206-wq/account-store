-- AlterTable
ALTER TABLE "orders" ADD COLUMN "unitCost" DECIMAL(18,6);

-- Đơn cũ: lấy giá vốn hiện tại của sản phẩm (ước tính, đơn mới sẽ lưu đúng giá vốn lúc mua)
UPDATE "orders" o SET "unitCost" = p."costPrice" FROM "products" p WHERE o."productId" = p."id" AND p."costPrice" IS NOT NULL;
