-- Khách xem lại API key (bản mã hóa); apiKeyHash vẫn dùng để tra cứu khi gọi API
ALTER TABLE "users" ADD COLUMN "apiKeyEnc" TEXT;
