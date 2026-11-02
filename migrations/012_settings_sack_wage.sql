-- 012: qop kg va qadoq haqi settings da.
-- Qayta ishga tushsa xavfsiz. Mavjud qiymat o'zgarmaydi.
INSERT INTO settings (key, value, description) VALUES
  ('sack_kg', '29', '1 qop ko''mir, kg. Black Diamond.'),
  ('pack_unit_wage', '700', 'Qadoq ish haqi, 1 dona, so''m. Bo''sh kelsa shu.')
ON CONFLICT (key) DO NOTHING;
