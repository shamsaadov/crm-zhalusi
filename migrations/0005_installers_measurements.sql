CREATE TABLE "installers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL UNIQUE,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installer_id" varchar NOT NULL,
	"client_name" text,
	"client_phone" text,
	"address" text,
	"latitude" numeric(12, 8),
	"longitude" numeric(12, 8),
	"status" text DEFAULT 'draft',
	"comment" text,
	"total_coefficient" numeric(12, 2),
	"created_at" timestamp DEFAULT now(),
	"sent_at" timestamp,
	"order_id" varchar,
	"signature_url" text
);
--> statement-breakpoint
CREATE TABLE "measurement_sashes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measurement_id" varchar NOT NULL,
	"width" numeric(10, 2),
	"height" numeric(10, 2),
	"system_name" text,
	"category" text,
	"control" text,
	"coefficient" numeric(12, 2),
	"room" integer,
	"room_name" text,
	"photo_url" text
);
--> statement-breakpoint
CREATE TABLE "measurement_photos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measurement_id" varchar NOT NULL,
	"sash_index" integer,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "installers" ADD CONSTRAINT "installers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_installer_id_installers_id_fk" FOREIGN KEY ("installer_id") REFERENCES "public"."installers"("id");
--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");
--> statement-breakpoint
ALTER TABLE "measurement_sashes" ADD CONSTRAINT "measurement_sashes_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "measurement_photos" ADD CONSTRAINT "measurement_photos_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_measurements_installer" ON "measurements" ("installer_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_measurement_sashes_measurement" ON "measurement_sashes" ("measurement_id");
