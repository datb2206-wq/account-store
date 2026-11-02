-- Mã giao dịch khách tự khai khi báo đã chuyển khoản
ALTER TABLE "transactions" ADD COLUMN "customerRef" TEXT;
CREATE INDEX "transactions_customerRef_idx" ON "transactions"("customerRef");

-- Lấy hàng ngẫu nhiên từ kho lớn mà không phải sắp xếp toàn bộ
CREATE INDEX "stock_items_productId_status_contentHash_idx" ON "stock_items"("productId", "status", "contentHash");

-- Định dạng API của từng nhà cung cấp
ALTER TABLE "suppliers" ADD COLUMN "adapter" TEXT NOT NULL DEFAULT 'generic';
