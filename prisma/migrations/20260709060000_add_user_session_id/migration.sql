-- Single active session per clientType (instant kick): session id nhúng vào JWT.
ALTER TABLE "users" ADD COLUMN "sessionIdMobile" TEXT;
ALTER TABLE "users" ADD COLUMN "sessionIdWeb" TEXT;
