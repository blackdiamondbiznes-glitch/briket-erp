# 8-bosqich: o'qish va deploy

Live yoqilmaydi. Production bazaga yozilmaydi.

## Faqat o'qiladigan sonlar

Siz ishga tushirasiz. Yozmaydi.

```sql
SELECT 'products' AS n, COUNT(*) FROM products
UNION ALL SELECT 'materials', COUNT(*) FROM materials
UNION ALL SELECT 'batches', COUNT(*) FROM batches
UNION ALL SELECT 'waybills', COUNT(*) FROM waybills
UNION ALL SELECT 'waybills_leg', COUNT(*) FROM waybills WHERE waybill_code LIKE 'YX-LEG-%' OR legacy_source IS NOT NULL
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'payments_legacy', COUNT(*) FROM payments WHERE legacy_source IS NOT NULL
UNION ALL SELECT 'allocations', COUNT(*) FROM payment_allocations
UNION ALL SELECT 'customers', COUNT(*) FROM customers;
```

Ulush farqi (yozmaydi):

```sql
SELECT
  SUM(i.commission) FILTER (
    WHERE w.waybill_code NOT LIKE 'YX-LEG-%' AND w.legacy_source IS NULL
  ) AS yangi_ulush,
  SUM(i.commission) FILTER (
    WHERE w.waybill_code LIKE 'YX-LEG-%' OR w.legacy_source IS NOT NULL
  ) AS chiqarilgan
FROM waybill_items i
JOIN waybills w ON w.id = i.waybill_id
WHERE w.agent_id IS NULL;
```

## O'lchangan (2026-11-02, faqat o'qish)

- products 7, materials 6, batches 3, waybills 16, waybills_leg 16, payments 22, allocations 15, customers 40
- payments.legacy_source ustuni yo'q. payments_legacy o'tkazib yuborildi.
- yangi_ulush NULL (0). chiqarilgan 945 000. Bu qator komissiyasi yig'indisi, to'langan ulush emas.
- Ekrandagi 830 611 — to'langan ulush. Farq 114 389 = to'lanmagan yoki sana filtri.

## Deploy

1. `pg_dump` zaxira. Ruxsat.
2. Render start: `npm start`. Migratsiya ishlamaydi.
3. 012 ni qo'llash alohida ruxsat: `node scripts/migrate.js` avval o'qiydi, `--apply` hozircha yopiq.
4. Env: `DATABASE_URL`, `ADMIN_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`.
5. `ALLOW_DEMO_CUSTOMER` qo'yilmasin.
6. `TELEGRAM_BOT_TOKEN` faqat @briket_mijoz_bot. @briketborbot webhookiga tegilmaydi.
7. Live nakladnoy yuborish alohida tasdiqdan keyin.
