-- Keep vector storage in the same PostgreSQL database as journal entries.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('AWFUL', 'BAD', 'MEH', 'GOOD', 'RAD');

-- CreateEnum
CREATE TYPE "ActivityInferenceStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "styleStandard" TEXT,
    "appLockPinHash" TEXT,
    "appLockTimeoutMinutes" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appLockVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "sourceId" INTEGER,
    "userId" TEXT NOT NULL,
    "journalDate" TEXT NOT NULL,
    "mood" "Mood" NOT NULL,
    "note" TEXT NOT NULL,
    "activityInferenceStatus" "ActivityInferenceStatus" NOT NULL DEFAULT 'COMPLETE',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalMemoryGeneration" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "passageVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalMemoryGeneration_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "JournalMemoryPassage" (
    "generationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passageIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,

    CONSTRAINT "JournalMemoryPassage_pkey" PRIMARY KEY ("generationId","passageIndex")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '✨',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryActivity" (
    "entryId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "EntryActivity_pkey" PRIMARY KEY ("entryId","activityId")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "drivePath" TEXT NOT NULL,
    "driveFileId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagedPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "draftKey" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "drivePath" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagedPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagedPhotoCancellation" (
    "userId" TEXT NOT NULL,
    "draftKey" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "stagedPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StagedPhotoCancellation_pkey" PRIMARY KEY ("userId","draftKey","clientKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_sourceId_key" ON "Entry"("sourceId");

-- CreateIndex
CREATE INDEX "Entry_userId_journalDate_idx" ON "Entry"("userId", "journalDate");

-- CreateIndex
CREATE INDEX "JournalMemoryGeneration_userId_idx" ON "JournalMemoryGeneration"("userId");

-- CreateIndex
CREATE INDEX "JournalMemoryPassage_userId_generationId_idx" ON "JournalMemoryPassage"("userId", "generationId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_userId_name_emoji_key" ON "Activity"("userId", "name", "emoji");

-- CreateIndex
CREATE INDEX "StagedPhoto_userId_draftKey_createdAt_idx" ON "StagedPhoto"("userId", "draftKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StagedPhoto_userId_draftKey_clientKey_key" ON "StagedPhoto"("userId", "draftKey", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "StagedPhotoCancellation_stagedPhotoId_key" ON "StagedPhotoCancellation"("stagedPhotoId");

-- CreateIndex
CREATE INDEX "StagedPhotoCancellation_createdAt_idx" ON "StagedPhotoCancellation"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalMemoryGeneration" ADD CONSTRAINT "JournalMemoryGeneration_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalMemoryPassage" ADD CONSTRAINT "JournalMemoryPassage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "JournalMemoryGeneration"("entryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryActivity" ADD CONSTRAINT "EntryActivity_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryActivity" ADD CONSTRAINT "EntryActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagedPhoto" ADD CONSTRAINT "StagedPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagedPhotoCancellation" ADD CONSTRAINT "StagedPhotoCancellation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
