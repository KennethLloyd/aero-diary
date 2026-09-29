CREATE TABLE "StagedPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "draftKey" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "drivePath" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StagedPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StagedPhoto_userId_draftKey_clientKey_key" ON "StagedPhoto"("userId", "draftKey", "clientKey");
CREATE INDEX "StagedPhoto_userId_draftKey_createdAt_idx" ON "StagedPhoto"("userId", "draftKey", "createdAt");
