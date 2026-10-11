CREATE TABLE "agent_tokens" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "agent_tokens_token_hash_unique" UNIQUE("token_hash")
);
