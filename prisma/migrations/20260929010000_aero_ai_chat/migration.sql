CREATE TYPE "AeroAiTurnStatus" AS ENUM ('GENERATING', 'COMPLETE', 'FAILED');

CREATE TABLE "AeroAiThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "summary" TEXT,
    "summaryThroughTurn" INTEGER NOT NULL DEFAULT 0,
    "isGenerating" BOOLEAN NOT NULL DEFAULT false,
    "nextTurnSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeroAiThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AeroAiTurn" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "userContent" TEXT NOT NULL,
    "assistantContent" TEXT,
    "status" "AeroAiTurnStatus" NOT NULL DEFAULT 'GENERATING',
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeroAiTurn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AeroAiThread_userId_updatedAt_idx" ON "AeroAiThread"("userId", "updatedAt");

CREATE UNIQUE INDEX "AeroAiTurn_threadId_clientRequestId_key" ON "AeroAiTurn"("threadId", "clientRequestId");

CREATE UNIQUE INDEX "AeroAiTurn_threadId_sequence_key" ON "AeroAiTurn"("threadId", "sequence");

CREATE INDEX "AeroAiTurn_threadId_status_sequence_idx" ON "AeroAiTurn"("threadId", "status", "sequence");

ALTER TABLE "AeroAiThread" ADD CONSTRAINT "AeroAiThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AeroAiTurn" ADD CONSTRAINT "AeroAiTurn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AeroAiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
