-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "autoUpdateInfo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoUpdatePrice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priceRounding" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "stripHtml" BOOLEAN NOT NULL DEFAULT true;
