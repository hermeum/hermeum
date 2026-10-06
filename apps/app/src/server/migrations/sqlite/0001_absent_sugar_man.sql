CREATE TABLE `agent_session_event` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`session_id` text NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_session_event_sessionId_timestamp_idx` ON `agent_session_event` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `agent_session_event_agentId_idx` ON `agent_session_event` (`agent_id`);