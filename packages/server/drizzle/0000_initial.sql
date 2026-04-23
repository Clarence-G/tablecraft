CREATE TABLE "action_log" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seq" integer NOT NULL,
	"action_json" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_players" (
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seat_index" integer NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	CONSTRAINT "room_players_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"status" text NOT NULL,
	"host_id" text NOT NULL,
	"config_json" text,
	"seed" text,
	"state_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_action_room" ON "action_log" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_action_room_user_seq" ON "action_log" USING btree ("room_id","user_id","seq");--> statement-breakpoint
CREATE INDEX "idx_rooms_status" ON "rooms" USING btree ("status");