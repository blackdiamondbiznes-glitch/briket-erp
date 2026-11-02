-- 013: payments.legacy_source. Productionda hozir yo'q.
-- Qayta ishga tushsa xavfsiz. Mavjud qatorlar NULL qoladi.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS legacy_source TEXT;
