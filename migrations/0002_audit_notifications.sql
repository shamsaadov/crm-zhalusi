CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" varchar NOT NULL,
  "changes" text,
  "metadata" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "entity_type" text,
  "entity_id" varchar,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created" ON "audit_logs" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "is_read", "created_at" DESC);
