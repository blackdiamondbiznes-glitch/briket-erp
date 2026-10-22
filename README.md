# Briket ERP

Ishlab chiqarish, ombor, sotuv va mijoz qarzi. Express + PostgreSQL (Supabase). Admin: `/admin`. Mijoz ilovasi: `/mijoz`.

## Ishga tushirish

```bash
npm install
npm start
```

Productionda majburiy: `DATABASE_URL`, `ADMIN_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`.

Ixtiyoriy: `PORT` (Render `$PORT` ga bog'lanadi), `TELEGRAM_BOT_TOKEN` (mijoz ilovasi), `ALLOW_DEMO_CUSTOMER` (faqat local, productionda taqiqlangan).

## Yuk tarqatish

Hozir diler/agent yo'q. Admin o'zi **Yuk tarqatish** qiladi: mavjud ERP mijozga yuk xati yozadi. Bu savdo, buyurtma emas — `orders` jadvaliga tushmaydi va Buyurtmalar ro'yxatida ko'rinmaydi.

Tasdiqlangan yuk xati `stock_posted = true` bo'ladi. Tayyor mahsulot qoldig'i shu qatorlar yig'indisidan **bir marta** ayiriladi (ombor hisobi buyurtma qoldig'iga qo'shilmaydi). Bugungi/oylik savdo va mijoz qarzi shu summani qo'shib hisoblaydi. Naqd to'lov `payments` ga yoziladi, `order_id` bo'sh. Bir xil `idempotency_key` ikkinchi yuk xati ochmaydi.

Reys — Sotuv → Yuk tarqatish ichida. Boshlashda yuk ombordan yo'lga chiqadi. Shu reysdagi yuk xati shu yukdan ayiriladi, ombordan ikkinchi marta emas. Yopilganda qolgani omborga qaytadi. Hisob: yuklandi / sotildi / qaytdi / tushum / qarz. Reyssiz yuk xati avvalgidek ombordan bir marta kamayadi. Bir vaqtda bitta ochiq reys.

Agent jadvallari va `/api/agent/*` kodda qoladi, lekin admin oynasida yashirin. `settings.agents_ui_enabled = 1` bo'lsa Agentlar yorlig'i chiqadi. Komissiya bloki agentlar ro'yxati bo'sh bo'lsa ko'rinmaydi. Admin yuk xatida `agent_id` bo'sh, komissiya 0.

### Env

| O'zgaruvchi | Vazifa |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Agent initData HMAC va nakladnoyni Telegramga yuborish. Bo'sh bo'lsa agent API va yuborish 503. |
| `TELEGRAM_INITDATA_MAX_AGE_SEC` | initData yoshi, sukut 86400. |
| `ADMIN_TELEGRAM_IDS` | Vergul bilan telegram id. Shu idlar `/api/agent/admin/*` ni kalitsiz chaqira oladi. Bo'sh bo'lsa faqat `X-Admin-Key`. |
| `CORS_ORIGIN` | Vergul bilan originlar. Productionda majburiy. |
| `AGENT_CORS_ORIGINS` | Mini-app originlari. `CORS_ORIGIN` ga qo'shiladi, o'rnini bosmaydi. |
| `ADMIN_KEY` | Admin panel va `/api/agent/admin/*`. |
| `MINI_DATABASE_URL` | Faqat import skripti. Server o'qimaydi. |

### Rollout

1. Supabase SQL Editor da ketma-ket ishga tushiring: `migrations/004_agent_field_sales.sql`, `migrations/005_admin_waybills.sql`, `migrations/006_reys.sql`. Hammasi qayta yurishga yaroqli. Mavjud qatorlar o'chirilmaydi, ustunlar qayta nomlanmaydi.
2. Shu PR merge bo'lgach servisni yangilang. Migratsiyasiz yuk xati endpointlari 503 beradi, qolgan API o'zgarmaydi.
3. Admin → Sotuv → Yuk tarqatish. Mijoz va mahsulotni tanlang, to'lov va qarzni ko'ring, yuk xatini yozing. Chop etish server HTML ini ochadi. PDF va Telegramga yuborish (mijozda `telegram_id` va bot token bo'lsa) shu yerdan.
4. Agentlar yorlig'i Sozlama dagi belgi yoqilmaguncha chiqmaydi.
5. Haqiqiy savdo tarixi mini-appda. ERP dagi sinov qarzini avval dry-run bilan ko'ring. `--apply` faqat egasi tasdiqlagan `--ids` fayl bilan, nusxa `archived_rows` ga tushgach, bitta tranzaksiyada o'chiradi. Mijozlar o'chirilmaydi.
6. Importni avval dry-run qiling. Mini-app buyurtmalari Yuk tarqatish yuk xati bo'ladi, `stock_posted=false`, ombor va Bugun savdosi o'zgarmaydi. Qarz har bir do'kon bo'yicha solishtiriladi. Dublikat `--links` siz yozilmaydi. FARQ bo'lsa `--apply` to'xtaydi (`--accept-debt-as-stored` saqlangan qarzni o'zgartirmaydi).

```bash
node scripts/cleanup-test-data.js
node scripts/cleanup-test-data.js --apply --ids ids.json
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
- Admin yuk xati komissiya yozmaydi. Kelajakdagi agent uchun komissiya yig'ilgan pul ulushida: `komissiya * yig'ilgan / yuk_jami`.
- `commission_enabled_on` bo'sh bo'lsa, agent komissiyasi darhol yoqilgan hisoblanadi. Sana kelajakda bo'lsa, o'sha kungacha yig'ilgan ulush keyin qo'shilmaydi.
- Admin qarz to'lovi yuk xatining to'langan/qarz summasini yangilaydi va bitta `payments` qatorini yozadi (`order_id` bo'sh). Buyurtma yaratilmaydi. Agent qarz jadvaliga ikkinchi marta yozilmaydi.
- Do'kon o'chirish `is_active = false`. Qattiq o'chirish yo'q.
- Agent API hali ham faqat o'z `customers.agent_id` qatorlarini ko'radi.

`partners.type = 'agent'` — bu eski hamkor turi, Telegram agent emas.
