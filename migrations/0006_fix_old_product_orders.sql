-- Migration: Fix old product orders - добавление componentId для старых заказов "Товар"
-- ВНИМАНИЕ: Этот скрипт пытается определить componentId по себестоимости позиции
-- Запустите вручную после проверки логики

-- К сожалению, в старых записях нет прямой связи с componentId
-- Можно только попытаться сопоставить по цене, но это не надежно

-- Альтернативный подход: для новых заказов все будет работать автоматически
-- Для старых заказов можно вручную обновить component_id через SQL:

-- Пример обновления конкретного sash:
-- UPDATE order_sashes SET component_id = 'uuid-комплектующего' WHERE id = 'uuid-sash';

-- Или можно создать view для просмотра проблемных записей:
CREATE OR REPLACE VIEW v_product_orders_without_component AS
SELECT 
    os.id as sash_id,
    o.order_number,
    o.comment,
    o.status,
    os.quantity,
    os.sash_cost,
    os.component_id
FROM order_sashes os
JOIN orders o ON o.id = os.order_id
WHERE o.comment LIKE '%[Товар]%'
  AND os.component_id IS NULL
  AND os.width = '0.00'
  AND os.height = '0.00'
ORDER BY o.order_number DESC;

-- Для просмотра: SELECT * FROM v_product_orders_without_component;


