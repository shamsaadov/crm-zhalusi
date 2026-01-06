-- Добавляем поле system_key в таблицу systems для связи с coefficients.json
ALTER TABLE "systems" ADD COLUMN IF NOT EXISTS "system_key" text;



