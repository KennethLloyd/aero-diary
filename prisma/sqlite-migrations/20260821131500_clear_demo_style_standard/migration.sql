-- Generic demo standards are no longer stored; blank demo rows use the
-- server-side default polish standard instead.
UPDATE "User"
SET "styleStandard" = NULL
WHERE "isDemo" = 1;
