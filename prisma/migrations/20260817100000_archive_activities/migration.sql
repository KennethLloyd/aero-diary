ALTER TABLE "Activity" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "new_EntryActivity" (
    "entryId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    PRIMARY KEY ("entryId", "activityId"),
    CONSTRAINT "EntryActivity_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntryActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_EntryActivity" ("entryId", "activityId")
SELECT "entryId", "activityId" FROM "EntryActivity";

DROP TABLE "EntryActivity";
ALTER TABLE "new_EntryActivity" RENAME TO "EntryActivity";
