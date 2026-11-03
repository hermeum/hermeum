CREATE TABLE "agent_memory_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"content" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_memory_entries_agent_position_idx" ON "agent_memory_entries" USING btree ("agent_id","position");