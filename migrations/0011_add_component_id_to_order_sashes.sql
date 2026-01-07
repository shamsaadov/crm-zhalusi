-- Add componentId to order_sashes for product orders (direct component sales)
ALTER TABLE order_sashes ADD COLUMN IF NOT EXISTS component_id VARCHAR REFERENCES components(id) ON DELETE SET NULL;




