-- Demo accounts are ordinary users selected by environment configuration.
-- Keep the historical isDemo column in its original migrations; this is the
-- safe follow-up that removes it from the current schema.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "styleStandard" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_User" ("id", "email", "passwordHash", "name", "styleStandard", "createdAt")
SELECT "id", "email", "passwordHash", "name", "styleStandard", "createdAt"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

PRAGMA foreign_keys=ON;
