-- Add multiplier_id field to systems table
-- This allows assigning a price multiplier to each system for sale price calculations

ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "multiplier_id" varchar REFERENCES "multipliers"("id") ON DELETE SET NULL;




