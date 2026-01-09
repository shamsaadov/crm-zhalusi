--> statement-breakpoint
ALTER TABLE "order_sashes" DROP CONSTRAINT "order_sashes_fabric_id_fabrics_id_fk";
--> statement-breakpoint
ALTER TABLE "order_sashes" DROP CONSTRAINT "order_sashes_fabric_color_id_colors_id_fk";
--> statement-breakpoint
ALTER TABLE "systems" DROP CONSTRAINT "systems_multiplier_id_multipliers_id_fk";
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "order_sashes" ADD CONSTRAINT "order_sashes_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_sashes" ADD CONSTRAINT "order_sashes_fabric_color_id_colors_id_fk" FOREIGN KEY ("fabric_color_id") REFERENCES "public"."colors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_multiplier_id_multipliers_id_fk" FOREIGN KEY ("multiplier_id") REFERENCES "public"."multipliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
