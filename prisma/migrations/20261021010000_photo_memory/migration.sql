-- Source photos remain untouched; this migration creates no vectors or jobs.
ALTER TABLE "Photo" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "sourceVersion" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "JournalPhotoMemory" (
  "photoId" TEXT NOT NULL PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "contentHash" TEXT,
  "embeddingModel" TEXT NOT NULL,
  "preprocessingVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "embedding" vector(768),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JournalPhotoMemory_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "JournalPhotoMemory_userId_entryId_idx" ON "JournalPhotoMemory"("userId", "entryId");
