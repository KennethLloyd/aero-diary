-- Preserve the date users saw through the old UTC timestamp plus local offset.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" INTEGER,
    "userId" TEXT NOT NULL,
    "journalDate" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Entry" ("id", "sourceId", "userId", "journalDate", "mood", "note", "isFavorite", "createdAt", "updatedAt")
SELECT
    "id",
    "sourceId",
    "userId",
    substr(strftime('%Y-%m-%d', "date", printf('%+d minutes', "localOffset")), 1, 10),
    "mood",
    "note",
    "isFavorite",
    "createdAt",
    "updatedAt"
FROM "Entry";

DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";

CREATE UNIQUE INDEX "Entry_sourceId_key" ON "Entry"("sourceId");
CREATE INDEX "Entry_userId_journalDate_idx" ON "Entry"("userId", "journalDate");

PRAGMA foreign_keys=ON;
