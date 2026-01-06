-- Add system_key to systems table
ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "system_key" text;

-- Create system_components junction table
CREATE TABLE IF NOT EXISTS "system_components" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "system_id" varchar NOT NULL REFERENCES "systems"("id") ON DELETE CASCADE,
  "component_id" varchar NOT NULL REFERENCES "components"("id") ON DELETE CASCADE,
  "quantity" decimal(10, 2) DEFAULT '1',
  "size_source" text,
  "size_multiplier" decimal(10, 4) DEFAULT '1'
);



