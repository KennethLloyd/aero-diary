-- AlterTable
ALTER TABLE "User" ADD COLUMN "appLockPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "appLockTimeoutMinutes" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "appLockVerifiedAt" DATETIME;
