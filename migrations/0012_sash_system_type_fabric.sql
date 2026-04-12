-- Migration: Add system_type and fabric_name to measurement_sashes
-- Date: 2026-04-11
-- Reason: Mobile app sends systemType (coefficient file key: mini-rulons, mini-zebra, uni-1, ...)
--         and fabricName (selected fabric) per sash. Without these columns the data was silently
--         dropped on POST /api/mobile/dealer/measurements, breaking draft round-trip and
--         coefficient calculations after re-opening a saved draft.

ALTER TABLE measurement_sashes ADD COLUMN system_type TEXT;
ALTER TABLE measurement_sashes ADD COLUMN fabric_name TEXT;
