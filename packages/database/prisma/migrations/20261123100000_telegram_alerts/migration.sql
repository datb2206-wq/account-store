-- CreateTable
CREATE TABLE "telegram_alerts" (
    "key" TEXT NOT NULL,
    "state" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_alerts_pkey" PRIMARY KEY ("key")
);
