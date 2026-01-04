-- Add fabric_type column to fabrics table
-- "roll" = рулонная ткань (стандартный расчёт)
-- "zebra" = зебра (количество материала умножается на 2)

ALTER TABLE "fabrics" ADD COLUMN IF NOT EXISTS "fabric_type" text DEFAULT 'roll';



