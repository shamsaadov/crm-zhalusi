-- Add multiplier_id to systems table
ALTER TABLE "systems" ADD COLUMN "multiplier_id" varchar;

-- Add foreign key constraint for multiplier_id
ALTER TABLE "systems" ADD CONSTRAINT "systems_multiplier_id_multipliers_id_fk" 
  FOREIGN KEY ("multiplier_id") REFERENCES "public"."multipliers"("id") ON DELETE no action ON UPDATE no action;

-- Create system_components junction table
CREATE TABLE IF NOT EXISTS "system_components" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" varchar NOT NULL,
	"component_id" varchar NOT NULL
);

-- Add foreign key constraints for system_components
ALTER TABLE "system_components" ADD CONSTRAINT "system_components_system_id_systems_id_fk" 
  FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "system_components" ADD CONSTRAINT "system_components_component_id_components_id_fk" 
  FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;

