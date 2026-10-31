-- Migration: Производство как в УЭС — готовность по каждой створке.
-- Date: 2026-10-31
-- Idempotent: безопасно выполнять повторно.
-- production_status: NULL — не передано, 'in_work' — в производстве, 'ready' — готово.

ALTER TABLE "order_sashes" ADD COLUMN IF NOT EXISTS "production_status" text;
--> statement-breakpoint
ALTER TABLE "order_sashes" ADD COLUMN IF NOT EXISTS "production_sent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "order_sashes" ADD COLUMN IF NOT EXISTS "production_ready_at" timestamp;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "production_priority" text DEFAULT 'Обычно';
--> statement-breakpoint
-- Перенос текущих статусов: «В производстве» → створки в работе, «Готов»/«Отгружен» → готовы.
-- Строки товара (комплектующие без системы) в производство не идут.
UPDATE "order_sashes" s SET
  "production_status" = 'in_work',
  "production_sent_at" = timezone('utc', now())
FROM "orders" o
WHERE o.id = s.order_id
  AND o.status = 'В производстве'
  AND s.production_status IS NULL
  AND NOT (s.component_id IS NOT NULL AND s.system_id IS NULL);
--> statement-breakpoint
UPDATE "order_sashes" s SET
  "production_status" = 'ready',
  "production_sent_at" = coalesce(s.production_sent_at, timezone('utc', now())),
  "production_ready_at" = timezone('utc', now())
FROM "orders" o
WHERE o.id = s.order_id
  AND o.status IN ('Готов', 'Отгружен')
  AND s.production_status IS NULL
  AND NOT (s.component_id IS NOT NULL AND s.system_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_sashes_production_status_idx" ON "order_sashes" ("production_status");
