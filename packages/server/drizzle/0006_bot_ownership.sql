-- Add ownership column to bot_tokens so bots are tied to a logged-in user.
-- Existing tokens (e.g. DefaultBot) keep owner_user_id = NULL.
ALTER TABLE "bot_tokens" ADD COLUMN "owner_user_id" text REFERENCES "public"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "idx_bot_tokens_owner" ON "bot_tokens" USING btree ("owner_user_id");--> statement-breakpoint

-- Design A1: drop FK on points_ledger.user_id so bot user IDs (which have no
-- matching row in "user") can be written directly. Application code enforces
-- validity; the NOT-NULL-OR-guest_id check constraint is kept unchanged.
ALTER TABLE "points_ledger" DROP CONSTRAINT "points_ledger_user_id_user_id_fk";
