ALTER TABLE "installers" ADD COLUMN IF NOT EXISTS "dealer_id" varchar REFERENCES "dealers"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_installers_dealer" ON "installers" ("dealer_id");
