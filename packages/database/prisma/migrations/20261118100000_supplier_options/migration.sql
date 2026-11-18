ALTER TABLE "suppliers" ADD COLUMN "syncCategories" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "suppliers" ADD COLUMN "autoActivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "priceRate" DECIMAL(24,12);
ALTER TABLE "suppliers" ADD COLUMN "proxyEnc" TEXT;
