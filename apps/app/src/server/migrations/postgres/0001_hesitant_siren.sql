CREATE TABLE "agent_session_events" (
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
CREATE INDEX "agent_session_events_agent_session_idx" ON "agent_session_events" USING btree ("agent_id","session_id","timestamp");