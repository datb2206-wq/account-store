-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'COMMISSION';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commissionBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "affiliate_commissions" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(18,6) NOT NULL,
    "percent" DECIMAL(6,3) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREDITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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

    CONSTRAINT "affiliate_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_orderId_key" ON "affiliate_commissions"("orderId");

-- CreateIndex
CREATE INDEX "affiliate_commissions_referrerId_createdAt_idx" ON "affiliate_commissions"("referrerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "affiliate_withdrawals_userId_createdAt_idx" ON "affiliate_withdrawals"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "affiliate_withdrawals_status_idx" ON "affiliate_withdrawals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_referredById_idx" ON "users"("referredById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

