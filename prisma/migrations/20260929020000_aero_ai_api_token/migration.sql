ALTER TABLE "User" ADD COLUMN "aeroAiTokenHash" TEXT;

CREATE UNIQUE INDEX "User_aeroAiTokenHash_key" ON "User"("aeroAiTokenHash");
