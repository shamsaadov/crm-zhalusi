ALTER TABLE "dealers" ADD COLUMN IF NOT EXISTS "login" text UNIQUE;
--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN IF NOT EXISTS "password" text;
--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dealer_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" varchar,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"is_broadcast" boolean DEFAULT false,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dealer_notifications" ADD CONSTRAINT "dealer_notifications_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id");
--> statement-breakpoint
ALTER TABLE "dealer_notifications" ADD CONSTRAINT "dealer_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dealer_notifications_dealer" ON "dealer_notifications" ("dealer_id", "created_at" DESC);
