-- Migration: Add device_tokens table for mobile push notifications
-- Date: 2026-05-01
-- Reason: Direct APNs push from CRM backend to dealer mobile app.
--         Stores APNs/FCM device tokens registered by mobile clients on login,
--         linked to dealers (and optionally CRM users for future expansion).

CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL,
  "platform" varchar NOT NULL,
  "dealer_id" varchar REFERENCES "dealers"("id"),
  "user_id" varchar REFERENCES "users"("id"),
  "last_seen_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

-- One row per device-platform pair: re-registering the same APNs/FCM token
-- updates ownership and last_seen_at instead of inserting duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_platform_uq"
  ON "device_tokens" ("token", "platform");

CREATE INDEX IF NOT EXISTS "device_tokens_dealer_idx"
  ON "device_tokens" ("dealer_id") WHERE "dealer_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "device_tokens_user_idx"
  ON "device_tokens" ("user_id") WHERE "user_id" IS NOT NULL;
