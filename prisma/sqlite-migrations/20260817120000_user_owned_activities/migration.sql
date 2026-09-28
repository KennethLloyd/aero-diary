-- Activity rows created before this ownership boundary can be assigned safely
-- only when exactly one non-demo user exists. Otherwise the NOT NULL insert
-- below fails instead of silently exposing an activity to the wrong user.
PRAGMA foreign_keys=OFF;

ALTER TABLE "Activity" ADD COLUMN "userId" TEXT;

UPDATE "Activity"
SET "userId" = (
    SELECT "id"
    FROM "User"
    WHERE "isDemo" = false
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
)
WHERE "userId" IS NULL
  AND (SELECT COUNT(*) FROM "User" WHERE "isDemo" = false) = 1;

CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '✨',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Activity" ("id", "userId", "name", "emoji", "isArchived", "sortOrder")
SELECT "id", "userId", "name", "emoji", "isArchived", "sortOrder"
FROM "Activity";

DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";

CREATE UNIQUE INDEX "Activity_userId_name_emoji_key" ON "Activity"("userId", "name", "emoji");

PRAGMA foreign_keys=ON;
