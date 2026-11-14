-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'MOMO';
ALTER TYPE "PaymentMethod" ADD VALUE 'CUSTOM';
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "cardCode" TEXT,
ADD COLUMN "cardHash" TEXT,
ADD COLUMN "cardSerial" TEXT,
ADD COLUMN "cardTelco" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_cardHash_key" ON "transactions"("cardHash");
