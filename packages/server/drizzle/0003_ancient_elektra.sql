CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"game_id" text NOT NULL,
	"room_id" text,
	"reason" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_owner_check" CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_points_user_created" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_points_game_created" ON "points_ledger" USING btree ("game_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_points_guest" ON "points_ledger" USING btree ("guest_id");