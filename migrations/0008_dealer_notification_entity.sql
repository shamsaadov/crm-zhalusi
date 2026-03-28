ALTER TABLE "dealer_notifications" ADD COLUMN IF NOT EXISTS "entity_type" varchar;
ALTER TABLE "dealer_notifications" ADD COLUMN IF NOT EXISTS "entity_id" varchar;
