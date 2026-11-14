-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductApproval" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "approval" "ProductApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "sellerId" TEXT;

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
    "commissionPercent" DECIMAL(5,2),
    "balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "adminNote" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_earnings" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(18,6) NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HOLD',
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_withdrawals" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "method" TEXT NOT NULL,
    "bankName" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sellers_userId_key" ON "sellers"("userId");

-- CreateIndex
CREATE INDEX "sellers_status_idx" ON "sellers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "seller_earnings_orderId_key" ON "seller_earnings"("orderId");

-- CreateIndex
CREATE INDEX "seller_earnings_sellerId_createdAt_idx" ON "seller_earnings"("sellerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "seller_earnings_status_releaseAt_idx" ON "seller_earnings"("status", "releaseAt");

-- CreateIndex
CREATE INDEX "seller_withdrawals_sellerId_createdAt_idx" ON "seller_withdrawals"("sellerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "seller_withdrawals_status_idx" ON "seller_withdrawals"("status");

-- CreateIndex
CREATE INDEX "products_sellerId_idx" ON "products"("sellerId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_withdrawals" ADD CONSTRAINT "seller_withdrawals_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

