-- AlterTable
ALTER TABLE "users" ADD COLUMN     "registerIp" TEXT;

-- CreateIndex
CREATE INDEX "users_registerIp_idx" ON "users"("registerIp");
