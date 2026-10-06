CREATE TABLE IF NOT EXISTS "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_lookup" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_pin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pin_lookup_unique" UNIQUE("pin_lookup");