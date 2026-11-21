CREATE TABLE "notification_sends" (
	"idempotency_key" text PRIMARY KEY,
	"recipient_user_id" text NOT NULL,
	"template" text NOT NULL,
	"request_hash" text NOT NULL,
	"to_address" text NOT NULL,
	"locale" text NOT NULL,
	"resend_request" jsonb NOT NULL,
	"resend_email_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_sends_status_check" CHECK ("status" in ('pending', 'sent'))
);
--> statement-breakpoint
CREATE INDEX "notification_sends_created_at_idx" ON "notification_sends" ("created_at");