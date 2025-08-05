CREATE TABLE IF NOT EXISTS "chat_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"message_id" text NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"total_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"total_completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_execution_time" integer DEFAULT 0 NOT NULL,
	"request_size" integer DEFAULT 0 NOT NULL,
	"response_size" integer DEFAULT 0 NOT NULL,
	"full_conversation_context" json
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "chat_usage_log" ADD CONSTRAINT "chat_usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_usage_log_session_idx" ON "chat_usage_log" ("session_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_usage_log_timestamp_idx" ON "chat_usage_log" ("timestamp");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_usage_log_user_idx" ON "chat_usage_log" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_usage_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"timestamp" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"system_prompt_size" integer,
	"messages_count" integer,
	"tools_count" integer,
	"mcp_tools_count" integer,
	"workflow_tools_count" integer,
	"app_default_tools_count" integer,
	"tool_call_results" json,
	"prompt_size_breakdown" json,
	"actual_content" json,
	"additional_data" json
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "chat_usage_step" ADD CONSTRAINT "chat_usage_step_log_id_chat_usage_log_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."chat_usage_log"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_usage_step_log_idx" ON "chat_usage_step" ("log_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_usage_step_timestamp_idx" ON "chat_usage_step" ("timestamp");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "daily_usage_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp UNIQUE NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"unique_sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "daily_usage_stats_date_idx" ON "daily_usage_stats" ("date");