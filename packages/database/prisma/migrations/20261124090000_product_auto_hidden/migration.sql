ALTER TABLE "products" ADD COLUMN "autoHidden" BOOLEAN NOT NULL DEFAULT false;
-- Sản phẩm nguồn API đang ẩn và hết hàng: đánh dấu để tự bật lại khi nguồn có hàng
UPDATE "products" SET "autoHidden" = true WHERE "isActive" = false AND "supplierId" IS NOT NULL AND coalesce("externalStock", 0) = 0;
