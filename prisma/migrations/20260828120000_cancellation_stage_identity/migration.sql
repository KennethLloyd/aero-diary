ALTER TABLE "StagedPhotoCancellation" ADD COLUMN "stagedPhotoId" TEXT;

CREATE UNIQUE INDEX "StagedPhotoCancellation_stagedPhotoId_key" ON "StagedPhotoCancellation"("stagedPhotoId");
