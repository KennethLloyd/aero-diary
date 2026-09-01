-- Track background activity inference until its terminal outcome.
ALTER TABLE "Entry" ADD COLUMN "activityInferencePending" BOOLEAN NOT NULL DEFAULT false;
