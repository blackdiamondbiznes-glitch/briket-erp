# Briket ERP

Ishlab chiqarish, ombor, sotuv va mijoz qarzi. Express + PostgreSQL (Supabase). Admin: `/admin`. Mijoz ilovasi: `/mijoz`.

## Ishga tushirish

```bash
npm install
npm start
```

Productionda majburiy: `DATABASE_URL`, `ADMIN_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`.

Ixtiyoriy: `PORT` (Render `$PORT` ga bog'lanadi), `TELEGRAM_BOT_TOKEN` (mijoz ilovasi), `ALLOW_DEMO_CUSTOMER` (faqat local, productionda taqiqlangan).

## Agentlar / yuk xati (phase 2)

Telegram field-sales mini ilovasi (`briket-mini-app`) shu ERP ga qo'shiladi. Yuk xati alohida jadvalda. Zavod buyurtmasi va ombor qoldig'iga yozilmaydi.

### Env

| O'zgaruvchi | Vazifa |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Agent API initData HMAC. Bo'sh bo'lsa `/api/agent` 503 qaytaradi. |
| `TELEGRAM_INITDATA_MAX_AGE_SEC` | initData yoshi, sukut 86400. |
| `CORS_ORIGIN` | Vergul bilan originlar. Productionda majburiy. |
| `AGENT_CORS_ORIGINS` | Mini-app originlari. `CORS_ORIGIN` ga qo'shiladi, o'rnini bosmaydi. |
| `ADMIN_KEY` | `/api/agent/admin/*` shu kalit bilan. |
| `MINI_DATABASE_URL` | Faqat import skripti. Server o'qimaydi. |

### Rollout

1. Ko'rib chiqilgan migratsiyani Supabase SQL Editor da ishga tushiring: `migrations/004_agent_field_sales.sql`. Fayl qayta yurishga yaroqli (`IF NOT EXISTS`). `DROP` / `DELETE` yo'q.
2. Shu PR merge bo'lgach servisni yangilang. Migratsiyasiz agent endpointlari 503 beradi, qolgan API o'zgarmaydi.
3. `TELEGRAM_BOT_TOKEN` va mini-app originini (`CORS_ORIGIN` yoki `AGENT_CORS_ORIGINS`) qo'ying.
4. Admin → Mijozlar va qarzlar → Agentlar. Kirish so'rovini tasdiqlang yoki rad eting.
5. Importni avval dry-run qiling. `--apply` ni dublikatlarni ko'rib chiqqandan keyin.

```bash
node scripts/import-mini-app.js
node scripts/import-mini-app.js --apply --links links.json
```

Dry-run hech narsa yozmaydi. Dublikatlar normallashtirilgan ism/telefon bo'yicha chiqadi va avtomatik birlashmaydi. Har bir do'kon qarzi uchun saqlangan `debt_amount`, `total-paid` va to'lovlar yig'indisi solishtiriladi; farq `FARQ` deb belgilanadi.

`links.json`:

```json
{ "stores": { "<mini store uuid>": 12 }, "products": { "<mini product uuid>": 3 } }
```

### Test

```bash
npm test
```

Jonli lokal server (production URLga chiqmaydi, bazaga yozadi):

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 ADMIN_KEY=... TELEGRAM_BOT_TOKEN=... node scripts/smoke-agent.js
```

### Hisob qoidalari

- Qator summasi, jami, qarz va komissiyani server hisoblaydi. Mijoz yuborgan `total_amount` / `subtotal` olinmaydi.
- Pul butun so'mga yaxlitlanadi (ERP dagi kabi). Import tarixiy summani o'zgartirmay nusxa oladi.
- Komissiya yig'ilgan pul ulushida yoziladi: `komissiya * yig'ilgan / yuk_jami`.
- `commission_enabled_on` bo'sh bo'lsa, komissiya darhol yoqilgan. Sana kelajakda bo'lsa, o'sha kungacha yig'ilgan ulush keyin qo'shilmaydi.
- Do'kon o'chirish `is_active = false`. Qattiq o'chirish yo'q.
- Agent faqat o'z `customers.agent_id` qatorlarini ko'radi.

`partners.type = 'agent'` — bu eski hamkor turi, Telegram agent emas.
