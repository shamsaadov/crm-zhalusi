-- Migration: Add mobile-app fallback fields to order_sashes
-- Date: 2026-04-11
-- Reason: When a mobile measurement is converted into an order via
--         POST /api/mobile/dealer/measurements/:id/send the dealer's selections
--         come as plain strings (systemName, systemType, category, fabricName),
--         not as FK ids into systems/fabrics catalogues. Without these columns
--         the data was silently dropped and the admin saw "-" in view-order-dialog
--         instead of the dealer's actual choice.

ALTER TABLE order_sashes ADD COLUMN system_name TEXT;
ALTER TABLE order_sashes ADD COLUMN system_type TEXT;
ALTER TABLE order_sashes ADD COLUMN category TEXT;
ALTER TABLE order_sashes ADD COLUMN fabric_name TEXT;
