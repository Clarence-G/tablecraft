CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "friendships_user_a_user_b_pk" PRIMARY KEY("user_a","user_b"),
	CONSTRAINT "friendships_normalized_check" CHECK (user_a < user_b)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"room_id" text,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE INDEX "idx_chat_room_created" ON "chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_friendships_user_a" ON "friendships" USING btree ("user_a");--> statement-breakpoint
CREATE INDEX "idx_friendships_user_b" ON "friendships" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "idx_reports_target" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "idx_reports_status_created" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_blocks_blocker" ON "user_blocks" USING btree ("blocker_id");