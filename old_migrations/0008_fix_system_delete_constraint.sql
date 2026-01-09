-- Исправляем constraint для systemId чтобы разрешить удаление систем
-- При удалении системы, устанавливаем NULL в заказах

-- Удаляем старый constraint
ALTER TABLE "order_sashes" DROP CONSTRAINT IF EXISTS "order_sashes_system_id_systems_id_fk";

-- Добавляем новый constraint с ON DELETE SET NULL
ALTER TABLE "order_sashes" 
  ADD CONSTRAINT "order_sashes_system_id_systems_id_fk" 
  FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE SET NULL;




