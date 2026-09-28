CREATE TABLE "StagedPhotoCancellation" (
    "userId" TEXT NOT NULL,
    "draftKey" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StagedPhotoCancellation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("userId", "draftKey", "clientKey")
);

CREATE INDEX "StagedPhotoCancellation_createdAt_idx" ON "StagedPhotoCancellation"("createdAt");
