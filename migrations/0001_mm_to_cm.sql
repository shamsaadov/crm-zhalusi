UPDATE "order_sashes" SET
  "width" = ROUND("width" / 10, 2),
  "height" = ROUND("height" / 10, 2)
WHERE "width" IS NOT NULL AND "height" IS NOT NULL;
