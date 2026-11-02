-- Khách xác nhận đã chuyển khoản ngân hàng (kèm biên lai tùy chọn)
ALTER TABLE "transactions" ADD COLUMN "claimedAt" TIMESTAMP(3);
