CREATE TABLE "agent_session_event" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text,
	"session_id" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_session_event_agent_session_idx" ON "agent_session_event" USING btree ("agent_id","session_id","timestamp");