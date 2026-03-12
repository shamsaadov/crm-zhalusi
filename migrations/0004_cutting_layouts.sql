CREATE TABLE "cutting_layouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"fabric_id" varchar NOT NULL,
	"roll_width" numeric(10, 2) NOT NULL,
	"total_length" numeric(10, 2) NOT NULL,
	"waste_percent" numeric(5, 2) DEFAULT '0',
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cutting_layout_rows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" varchar NOT NULL,
	"row_index" integer NOT NULL,
	"cut_length" numeric(10, 2) NOT NULL,
	"pieces" text NOT NULL,
	"used_width" numeric(10, 2) NOT NULL,
	"waste_width" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cutting_layouts" ADD CONSTRAINT "cutting_layouts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cutting_layouts" ADD CONSTRAINT "cutting_layouts_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cutting_layouts" ADD CONSTRAINT "cutting_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cutting_layout_rows" ADD CONSTRAINT "cutting_layout_rows_layout_id_cutting_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."cutting_layouts"("id") ON DELETE cascade ON UPDATE no action;
