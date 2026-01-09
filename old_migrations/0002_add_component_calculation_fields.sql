-- Add calculation fields to system_components table
-- These fields control how component cost is calculated based on sash dimensions

-- quantity: for pieces (шт) - how many pieces per sash
ALTER TABLE "system_components" ADD COLUMN IF NOT EXISTS "quantity" decimal(10, 2) DEFAULT '1';

-- size_source: for running meters (м) - which dimension to use ('height' or 'width')
ALTER TABLE "system_components" ADD COLUMN IF NOT EXISTS "size_source" text;

-- size_multiplier: multiplier for the dimension (e.g., 2 for chain = height × 2)
ALTER TABLE "system_components" ADD COLUMN IF NOT EXISTS "size_multiplier" decimal(10, 4) DEFAULT '1';
