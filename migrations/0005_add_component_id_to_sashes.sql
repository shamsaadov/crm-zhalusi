-- Migration: Add component_id to order_sashes for product orders ("Товар")
-- This allows tracking which component is sold in product orders

ALTER TABLE order_sashes ADD COLUMN IF NOT EXISTS component_id VARCHAR REFERENCES components(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_order_sashes_component_id ON order_sashes(component_id);




