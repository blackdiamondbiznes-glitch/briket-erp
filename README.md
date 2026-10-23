# Briket ERP

Ishlab chiqarish, ombor, sotuv va mijoz qarzi. Express + PostgreSQL (Supabase). Admin: `/admin`. Mijoz ilovasi: `/mijoz`.

## Ishga tushirish

```bash
npm install
npm start
```

Productionda majburiy: `DATABASE_URL`, `ADMIN_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`.

Ixtiyoriy: `PORT` (Render `$PORT` ga bog'lanadi), `YUK_BOT_TOKEN`, `ERP_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN` (mijoz boti va xabar yuborish), `ALLOW_DEMO_CUSTOMER` (faqat local, productionda taqiqlangan).

## Yuk tarqatish

Hozir diler/agent yo'q. Admin o'zi **Yuk tarqatish** qiladi: mavjud ERP mijozga yuk xati yozadi. Bu savdo, buyurtma emas — `orders` jadvaliga tushmaydi va Buyurtmalar ro'yxatida ko'rinmaydi.

Tasdiqlangan yuk xati `stock_posted = true` bo'ladi. Tayyor mahsulot qoldig'i shu qatorlar yig'indisidan **bir marta** ayiriladi (ombor hisobi buyurtma qoldig'iga qo'shilmaydi). Bugungi/oylik savdo va mijoz qarzi shu summani qo'shib hisoblaydi. Naqd to'lov `payments` ga yoziladi, `order_id` bo'sh. Bir xil `idempotency_key` ikkinchi yuk xati ochmaydi.

Reys — Sotuv → Yuk tarqatish ichida. Boshlashda yuk ombordan yo'lga chiqadi. Shu reysdagi yuk xati shu yukdan ayiriladi, ombordan ikkinchi marta emas. Yopilganda qolgani omborga qaytadi. Hisob: yuklandi / sotildi / qaytdi / tushum / qarz. Reyssiz yuk xati avvalgidek ombordan bir marta kamayadi. Bir vaqtda bitta ochiq reys.

Agent jadvallari va `/api/agent/*` kodda qoladi, lekin admin oynasida yashirin. `settings.agents_ui_enabled = 1` bo'lsa Agentlar yorlig'i chiqadi. Komissiya bloki agentlar ro'yxati bo'sh bo'lsa ko'rinmaydi. Admin yuk xatida `agent_id` bo'sh, komissiya 0.

### Env

| O'zgaruvchi | Vazifa |
| --- | --- |
| `YUK_BOT_TOKEN` | @briketborbot. `/yuk` Mini App shu bot ichida ochiladi. initData HMAC da birinchi tekshiriladi. Qiymati logga yozilmaydi. |
| `ERP_BOT_TOKEN` | @Blckdmndbrqts_bot. briket-erp shu botda ham ishlaydi. initData HMAC da ikkinchi tekshiriladi. Bo'sh bo'lsa tashlab ketiladi. |
| `TELEGRAM_BOT_TOKEN` | @briket_mijoz_bot. initData HMAC uchun zaxira. Nakladnoy va mijoz xabarlarini yuborish shu tokenda qoladi — boshqa botga almashtirilmaydi. Uchala token ham bo'sh bo'lsa agent API 503. |
| `TELEGRAM_INITDATA_MAX_AGE_SEC` | Agent initData yoshi, soniya, sukut 86400. `/yuk` egasi yo'li buni 3600 soniyadan oshirmaydi. `auth_date` Unix soniya; 401 javobida `reason`: `missing`, `expired`, `hash_mismatch`. |
| `ADMIN_TELEGRAM_IDS` | Vergul bilan telegram id. Bo'sh yoki o'rnatilmagan bo'lsa **hech kim** `/yuk` va Telegram orqali admin kira olmaydi — ID kodga yozilmaydi. Hozir productionda o'rnatilmagan. `/yuk` ni ochishdan oldin egasining Telegram id sini qo'ying. Shu ro'yxatdagi egalar har doim kira oladi va faqat ular kirish so'rovini tasdiqlaydi. |
| `YUK_WEBHOOK_SECRET` | `POST /api/agent/yuk/telegram-webhook` sarlavhasi `X-Telegram-Bot-Api-Secret-Token`. Bo'sh bo'lsa endpoint 503. Token qiymati logga yozilmaydi. |
| `CORS_ORIGIN` | Vergul bilan originlar. Productionda majburiy. |
| `AGENT_CORS_ORIGINS` | Mini-app originlari. `CORS_ORIGIN` ga qo'shiladi, o'rnini bosmaydi. |
| `ADMIN_KEY` | Admin panel va `/api/agent/admin/*`. Shu kalit `X-Admin-Key` sarlavhasida bo'lsa `/api/agent/yuk/*` initData siz ham ochiladi. Query va JSON body dagi kalit qabul qilinmaydi. |
| `MINI_DATABASE_URL` | Faqat import skripti. Server o'qimaydi. |

### Rollout

1. Supabase SQL Editor da ketma-ket ishga tushiring: `migrations/004_agent_field_sales.sql`, `migrations/005_admin_waybills.sql`, `migrations/006_reys.sql`, `migrations/007_yuk_xati.sql`, `migrations/008_yuk_creator.sql`, `migrations/009_yuk_access.sql`. Hammasi qayta yurishga yaroqli. Mavjud qatorlar o'chirilmaydi, ustunlar qayta nomlanmaydi. 007 faqat yangi ustun, jadval va `waybill_code_seq` qo'shadi. `paid_amount` ni o'zgartirmaydi. 008 yuk xati va `/yuk` to'loviga yozuvchining Telegram id va ismini nullable ustun qilib qo'shadi. Eski qatorlar NULL qoladi va ekranda «Eski yozuv» deb chiqadi. 009 faqat `yuk_access_requests` va `yuk_allowed_users` jadvallarini yaratadi. `migrations/010_yuk_admin_creator.sql` 008 bilan bir xil nullable ustunlar (`IF NOT EXISTS`); 008 allaqachon qo'llangan bo'lsa qo'shimcha o'zgarish qilmaydi. `migrations/011_yuk_ulush.sql` faqat `products.yuk_unit_commission` (nullable) va `yuk_commission_withdrawals` jadvalini qo'shadi. Mavjud qatorlar o'zgarmaydi. Yuk xati `commission_amount` 0 qoladi; ulush shu ustundan o'qish paytida hisoblanadi. Do'kon xaritasi mavjud `customers.latitude` / `longitude` ustunlarini ishlatadi, alohida migratsiya shart emas.
2. Shu PR merge bo'lgach servisni yangilang. `ADMIN_TELEGRAM_IDS` ni egasining Telegram id si bilan to'ldiring. `YUK_BOT_TOKEN` (@briketborbot) va `ERP_BOT_TOKEN` (@Blckdmndbrqts_bot) ni qo'ying; `TELEGRAM_BOT_TOKEN` mijoz botida qoladi va HMAC zaxirasi. Bo'sh ro'yxatda `/yuk` 401 qaytaradi. Mini-app manzili: `https://<host>/yuk`. `YUK_WEBHOOK_SECRET` ni qo'ying (harf, raqam, `_`, `-`).

### Kirish so'rovi

`ADMIN_TELEGRAM_IDS` dagi egalar har doim kira oladi. Boshqa hisob `/yuk` da faqat qulflangan ekranni ko'radi: forma, do'kon va mahsulot so'rovi yo'q. «Ruxsat so'rash» `yuk_access_requests` ga `pending` yozadi va tekshiruvdan o'tgan bot orqali egalarga xabar yuboradi. Xabar matni: `🔐 Yangi kirish so'rovi`, Ism, Username, id, Vaqt. Tugmalar: `✅ Tasdiqlash` (`access_approve:{id}`), `❌ Rad etish` (`access_reject:{id}`). Bir soat ichida qayta so'rov egaga ikkinchi xabar yubormaydi. Rad etilgan hisob qayta so'rov ocholmaydi. Tasdiqlangan hisob yuk xati yozadi, lekin boshqasini tasdiqlay olmaydi.

**@briketborbot webhookini o'zgartirmang.** U hozir eski Supabase `telegram-webhook` funksiyasiga qaraydi va o'sha funksiya ishlayapti. Shu bot yuborgan tugma bosilsa, javob eski funksiyaga boradi: u eski mini-app bazasini yangilaydi, ERP `yuk_allowed_users` ni emas. Webhookni `https://<host>/api/agent/yuk/telegram-webhook` ga ko'chirish eski botning tugmalarini to'xtatadi.

ERP ruxsati hozir admin paneldan beriladi: Sotuv → Yuk tarqatish → Kirish so'rovlari → Tasdiqlash / Rad etish. Panel tasdiqlangan odamga shu tekshiruv botidan xabar yuboradi. Webhook shart emas.

Agar keyin tugma ERP da ishlasin desangiz, webhooki bo'sh botni (masalan @Blckdmndbrqts_bot, agar unda boshqa webhook yo'q bo'lsa) shu manzilga qo'ying va `allowed_updates` ni faqat `callback_query` qiling. @briket_mijoz_bot webhookini ham almashtirmang — mijoz xabarlari shu botda qoladi.

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<host>/api/agent/yuk/telegram-webhook" \
  -d "secret_token=<YUK_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["callback_query"]'
```

`<BOT_TOKEN>` ni logga yozmang. Bu qadamni @briketborbot uchun ishlatmang, toki eski botni ataylab o'chirish kerak bo'lmasa.
3. Tarixiy yuk xati taqsimi alohida, avval dry-run: `node scripts/backfill-waybill-allocations.js`. `--apply` faqat ko'rib chiqilgach. U `payment_allocations` yozadi, `paid_amount` ni tegmaydi, qator o'chirmaydi. Import (`legacy_source`, `stock_posted=false`) dry-run siz ham ekranda o'z `paid_amount` / `debt_amount` ini ko'rsatadi.
4. Admin → Sotuv → **Yuk tarqatish** shu brauzer yorlig'ida `/yuk` ni ochadi. Panelga kirilgan admin sessiyasi initData siz yozadi; yozuvchi shu operator (`X-Operator-Name`, sukut Admin). Ro'yxat va hisobot **Tarix** da qoladi. Chop etish, PDF va Telegram (mijozda `telegram_id` va bot token bo'lsa) Tarix dan. Telefon Mini App ham `/yuk`: Sotuv, Do'konlar, Eslatma, Sozlama. Keng ekranda sahifa 960px gacha. Kompaniya karta va telefon Sozlama (`company_card`, `company_phone`) dan o'qiladi.
5. Agentlar yorlig'i Sozlama dagi belgi yoqilmaguncha chiqmaydi. `/yuk` ni `ADMIN_TELEGRAM_IDS` dagi egasi va tasdiqlangan yozuvchi ochadi. Har bir yangi yuk xati va `/yuk` to'lovi yozuvchining ismini saqlaydi. Agent oynasi yashirin qoladi.
6. Haqiqiy savdo tarixi mini-appda. ERP dagi sinov qarzini avval dry-run bilan ko'ring. `--apply` faqat egasi tasdiqlagan `--ids` fayl bilan, nusxa `archived_rows` ga tushgach, bitta tranzaksiyada o'chiradi. Mijozlar o'chirilmaydi.
7. Importni avval dry-run qiling. Mini-app buyurtmalari Yuk tarqatish yuk xati bo'ladi, `stock_posted=false`, ombor va Bugun savdosi o'zgarmaydi. Qarz har bir do'kon bo'yicha solishtiriladi. Dublikat `--links` siz yozilmaydi. FARQ bo'lsa `--apply` to'xtaydi (`--accept-debt-as-stored` saqlangan qarzni o'zgartirmaydi).

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
- `/yuk` pulni ikki joyga yozmaydi. Manba `payments` + `payment_allocations`. `paid_amount` va `debt_amount` shu taqsimdan qayta hisoblanadi. Ortiqcha to'lov eng eski ochiq yuk xatiga (`sale_date`, keyin `id`) tushadi; qolgani do'kon krediti. `created_at` tartib uchun ishlatilmaydi. To'lovni o'chirish yo'q — tuzatish yangi manfiy qator.
- Do'kon o'chirish `is_active = false`. Qattiq o'chirish yo'q.
- Agent API hali ham faqat o'z `customers.agent_id` qatorlarini ko'radi.

`partners.type = 'agent'` — bu eski hamkor turi, Telegram agent emas.
