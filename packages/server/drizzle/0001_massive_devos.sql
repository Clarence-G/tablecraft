CREATE TABLE "bot_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "bot_tokens_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "bot_tokens_token_hash_unique" UNIQUE("token_hash")
);
