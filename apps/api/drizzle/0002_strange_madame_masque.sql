ALTER TABLE "devices" DROP COLUMN IF EXISTS "webauthn_public_key";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "failed_attempts";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "locked_until";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";