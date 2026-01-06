-- Allow null orderId for inventory adjustments
ALTER TABLE "warehouse_writeoffs" ALTER COLUMN "order_id" DROP NOT NULL;

-- Add comment field for writeoffs
ALTER TABLE "warehouse_writeoffs" ADD COLUMN "comment" text;



