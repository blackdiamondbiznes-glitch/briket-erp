-- ============================================================
-- ERP admin sessiyasi yuk xati yozuvchisi. ADD-ONLY.
-- Yangi nullable ustunlar. Mavjud qatorlar NULL qoladi.
-- Eski qatorlarga tegilmaydi. Pul ustunlari tegilmaydi.
-- Productionga bu fayl qo'lda qo'llanadi. Agent yozmaydi.
-- ============================================================

ALTER TABLE waybills ADD COLUMN IF NOT EXISTS created_by_telegram_id TEXT;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS created_by_first_name TEXT;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS created_by_last_name TEXT;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS created_by_username TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_telegram_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_first_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_last_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_username TEXT;
