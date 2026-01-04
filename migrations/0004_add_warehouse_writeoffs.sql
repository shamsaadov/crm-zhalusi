-- Migration: Add warehouse_writeoffs table for tracking material consumption by orders
-- This table stores material deductions when orders are marked as "Готов" (Ready)

CREATE TABLE IF NOT EXISTS warehouse_writeoffs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,  -- "component" or "fabric"
    component_id VARCHAR REFERENCES components(id),
    fabric_id VARCHAR REFERENCES fabrics(id),
    quantity DECIMAL(12, 4) NOT NULL,
    price DECIMAL(12, 2) DEFAULT 0,  -- average price at writeoff time
    total DECIMAL(12, 2) DEFAULT 0,
    date DATE NOT NULL,
    user_id VARCHAR NOT NULL REFERENCES users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_warehouse_writeoffs_order_id ON warehouse_writeoffs(order_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_writeoffs_component_id ON warehouse_writeoffs(component_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_writeoffs_fabric_id ON warehouse_writeoffs(fabric_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_writeoffs_user_id ON warehouse_writeoffs(user_id);


