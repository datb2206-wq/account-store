-- CreateTable
CREATE TABLE "site_assets" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_assets_pkey" PRIMARY KEY ("key")
);
