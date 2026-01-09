-- Добавляем поле fabric_type в таблицу fabrics
ALTER TABLE "fabrics" ADD COLUMN IF NOT EXISTS "fabric_type" text;

-- Удаляем поле material из fabrics (если требуется)
-- ALTER TABLE "fabrics" DROP COLUMN IF EXISTS "material";

-- Исправляем constraints для fabricId в order_sashes
ALTER TABLE "order_sashes" DROP CONSTRAINT IF EXISTS "order_sashes_fabric_id_fabrics_id_fk";
ALTER TABLE "order_sashes" ADD CONSTRAINT "order_sashes_fabric_id_fabrics_id_fk" 
  FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE SET NULL;

-- Исправляем constraints для fabricColorId в order_sashes
ALTER TABLE "order_sashes" DROP CONSTRAINT IF EXISTS "order_sashes_fabric_color_id_colors_id_fk";
ALTER TABLE "order_sashes" ADD CONSTRAINT "order_sashes_fabric_color_id_colors_id_fk" 
  FOREIGN KEY ("fabric_color_id") REFERENCES "colors"("id") ON DELETE SET NULL;

-- Исправляем constraints для componentId и fabricId в warehouse_receipt_items
ALTER TABLE "warehouse_receipt_items" DROP CONSTRAINT IF EXISTS "warehouse_receipt_items_component_id_components_id_fk";
ALTER TABLE "warehouse_receipt_items" ADD CONSTRAINT "warehouse_receipt_items_component_id_components_id_fk" 
  FOREIGN KEY ("component_id") REFERENCES "components"("id") ON DELETE SET NULL;

ALTER TABLE "warehouse_receipt_items" DROP CONSTRAINT IF EXISTS "warehouse_receipt_items_fabric_id_fabrics_id_fk";
ALTER TABLE "warehouse_receipt_items" ADD CONSTRAINT "warehouse_receipt_items_fabric_id_fabrics_id_fk" 
  FOREIGN KEY ("fabric_id") REFERENCES "fabrics"("id") ON DELETE SET NULL;




