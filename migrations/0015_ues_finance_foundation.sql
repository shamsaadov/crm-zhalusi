-- Migration: Фундамент для управленческой отчётности (ОПиУ, ДДС, Баланс) по образцу УЭС
-- Date: 2026-10-31
-- Idempotent: безопасно выполнять повторно.

-- 1. Дата отгрузки заказа — момент признания выручки и долга дилера.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" date;
--> statement-breakpoint

-- 2. Вид операции у финансовых операций и статей (как ПКО/РКО в УЭС).
ALTER TABLE "finance_operations" ADD COLUMN IF NOT EXISTS "operation_type" text;
--> statement-breakpoint
ALTER TABLE "expense_types" ADD COLUMN IF NOT EXISTS "operation_type" text;
--> statement-breakpoint

-- 3. Заполняем дату отгрузки у уже отгруженных заказов:
--    сначала из журнала действий (последний переход в «Отгружен»)...
UPDATE "orders" o
SET "shipped_at" = sub.shipped_date
FROM (
  SELECT "entity_id", max("created_at")::date AS shipped_date
  FROM "audit_logs"
  WHERE "action" = 'status_change'
    AND "entity_type" = 'order'
    AND "changes" LIKE '%"after":{"status":"Отгружен"}%'
  GROUP BY "entity_id"
) sub
WHERE o."id" = sub."entity_id"
  AND o."status" = 'Отгружен'
  AND o."shipped_at" IS NULL;
--> statement-breakpoint

--    ...остальным — дату заказа.
UPDATE "orders"
SET "shipped_at" = "date"
WHERE "status" = 'Отгружен' AND "shipped_at" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_user_shipped_at_idx" ON "orders" ("user_id", "shipped_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_operations_user_date_idx" ON "finance_operations" ("user_id", "date");

--> statement-breakpoint

-- 4. Оплаты заказов и рассрочки, созданные автоматически, — это оплата от покупателя,
--    а не прочий доход (иначе у розничных заказов без дилера выручка считалась бы дважды).
UPDATE "finance_operations"
SET "operation_type" = 'Оплата от покупателя'
WHERE "type" = 'income'
  AND "operation_type" IS NULL
  AND (
    "comment" LIKE 'Оплата заказа №%'
    OR "comment" LIKE 'Рассрочка, платёж №%'
    OR "id" IN (SELECT "finance_operation_id" FROM "installment_payments" WHERE "finance_operation_id" IS NOT NULL)
  );
