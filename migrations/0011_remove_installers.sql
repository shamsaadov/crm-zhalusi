-- Migration: Remove installers entity, unify to dealers
-- Date: 2026-03-29

-- Step 1: Add dealer_id column to measurements
ALTER TABLE measurements ADD COLUMN dealer_id VARCHAR REFERENCES dealers(id);

-- Step 2: Populate dealer_id from installers
UPDATE measurements m
SET dealer_id = i.dealer_id
FROM installers i
WHERE m.installer_id = i.id;

-- Step 3: Make dealer_id NOT NULL
ALTER TABLE measurements ALTER COLUMN dealer_id SET NOT NULL;

-- Step 4: Drop installer_id column
ALTER TABLE measurements DROP COLUMN installer_id;

-- Step 5: Replace index
DROP INDEX IF EXISTS idx_measurements_installer;
CREATE INDEX idx_measurements_dealer ON measurements(dealer_id, created_at DESC);

-- Step 6: Drop installer_notifications table
DROP TABLE IF EXISTS installer_notifications;

-- Step 7: Drop installers table
DROP TABLE IF EXISTS installers;
