

const { useState, useEffect, useCallback, useMemo, useRef } = React;

const API = window.location.origin;
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('bg_color');
    if (tg.setBackgroundColor) tg.setBackgroundColor('bg_color');
  } catch (e) {}
}

function money(n) {
  return Number(n || 0).toLocaleString('uz-UZ');
}

function getInitData() {
  try {
    if (tg) {
      if (tg.initData) return tg.initData;
      // ba'zi klientlarda kechikish
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        return tg.initData || '';
      }
    }
  } catch (e) {}
  return '';
}

function demoId() {
  let id = localStorage.getItem('demo_tg_id');
  if (!id) {
    id = 'web-' + Date.now();
    localStorage.setItem('demo_tg_id', id);
  }
  return id;
}

/** Har bir Telegram akkaunt uchun alohida kalit */
function getUserScopeId() {
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      return 'tg-' + String(tg.initDataUnsafe.user.id);
    }
  } catch (e) {}
  // Brauzer: demo ID (bir qurilmada bitta)
  return 'web-' + demoId();
}

function storageKey(base) {
  return base + '__' + getUserScopeId();
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(storageKey('bd_cart')) || '[]');
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(storageKey('bd_cart'), JSON.stringify(cart || []));
}

function apiHeaders(json) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const init = getInitData();
  if (init) h['x-telegram-init-data'] = init;
  h['x-demo-telegram-id'] = demoId();
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: apiHeaders(!!opts.body),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText || 'Xato');
  return data;
}

function productImages(p) {
  if (p.image_urls && p.image_urls.length) return p.image_urls;
  return [];
}

/* DB price = optom. Asosiy (500 gacha) = price + bulk_discount */
function prices(p, settings) {
  const disc = Number(settings.bulk_discount) || 3000;
  const yirik = Number(p.price) || 0;
  const asosiy = yirik + disc;
  const minQty = Number(settings.bulk_min_qty) || 500;
  return { asosiy, yirik, disc, minQty };
}

function unitPrice(p, qty, settings) {
  const { asosiy, yirik, minQty } = prices(p, settings);
  return (Number(qty) || 0) >= minQty ? yirik : asosiy;
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className={'toast ' + (msg.err ? 'err' : 'ok')}>{msg.text}</div>;
}

function Loading({ text }) {
  return <div className="loading">{text || 'Yuklanmoqda...'}</div>;
}

function Gallery({ images, alt }) {
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState({});
  const list = (images || []).filter(Boolean);
  const ok = list.filter(function (url, idx) { return !failed[idx]; });
  if (!list.length || !ok.length) {
    return (
      <div className="product-img product-img-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, background: 'var(--surface-2, #141210)' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ opacity: 0.45 }}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/>
        </svg>
      </div>
    );
  }
  const n = list.length;
  const cur = Math.min(i, n - 1);
  return (
    <div className="product-img" style={{ position: 'relative' }}>
      <img
        key={list[cur] + '-' + cur}
        src={list[cur]}
        alt={alt || ''}
        loading="lazy"
        onLoad={(e) => e.target.classList.add('loaded')}
        onError={() => {
          setFailed(function (prev) {
            var next = Object.assign({}, prev);
            next[cur] = true;
            return next;
          });
          var nextIdx = -1;
          for (var j = 1; j < n; j++) {
            var cand = (cur + j) % n;
            if (!failed[cand]) { nextIdx = cand; break; }
          }
          if (nextIdx >= 0) setI(nextIdx);
        }}
      />
      {n > 1 && (
        <>
          <button type="button" className="gallery-ctrl prev" aria-label="Oldingi rasm" onClick={(e) => { e.stopPropagation(); setI((cur - 1 + n) % n); }}>‹</button>
          <button type="button" className="gallery-ctrl next" aria-label="Keyingi rasm" onClick={(e) => { e.stopPropagation(); setI((cur + 1) % n); }}>›</button>
          <div className="gallery-dots">{list.map((_, d) => <span key={d} className={d === cur ? 'on' : ''} />)}</div>
        </>
      )}
    </div>
  );
}

function Lightbox({ images, index, onClose }) {
  const [i, setI] = useState(index || 0);
  if (!images || !images.length) return null;
  const n = images.length;
  return (
    <div className="lightbox" onClick={onClose}>
      <button type="button" className="lightbox-close" aria-label="Yopish" onClick={onClose}>×</button>
      {n > 1 && (
        <>
          <button type="button" className="lightbox-nav prev" aria-label="Oldingi rasm" onClick={(e) => { e.stopPropagation(); setI((i - 1 + n) % n); }}>‹</button>
          <button type="button" className="lightbox-nav next" aria-label="Keyingi rasm" onClick={(e) => { e.stopPropagation(); setI((i + 1) % n); }}>›</button>
        </>
      )}
      <img src={images[i]} alt="" onClick={(e) => e.stopPropagation()} />
      {n > 1 && <div className="lightbox-counter">{i + 1} / {n}</div>}
    </div>
  );
}

function ProductCard({ p, settings, onAdd, onDetail, onLightbox, showMsg }) {
  const [added, setAdded] = useState(false);
  const [qtyStr, setQtyStr] = useState('0');
  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const { asosiy, yirik, disc, minQty } = prices(p, settings);
  const imgs = productImages(p);
  const stock = Number(p.balance_qty) || 0;
  const out = stock <= 0;

  return (
    <div className="product">
      <div onClick={() => imgs.length && onLightbox(imgs, 0)}>
        <Gallery images={imgs} alt={p.sku} />
      </div>
      <div className="product-body">
        <h3 onClick={() => onDetail(p)}>{p.sku}</h3>
        <div className="price-block">
          <div className="price-main">{money(asosiy)} <span>so‘m / dona</span></div>
          <div className="price-bulk">
            <strong>{minQty}+ dona</strong> xarid qilsangiz: {money(yirik)} so‘m
            <br />Har bir donadan {money(disc)} so‘m tejaysiz
          </div>
        </div>
        <div className="stock-row">
          {out
            ? <span className="stock-out">Hozircha qolmadi · 3–7 kunda tayyor bo‘ladi</span>
            : <span className="stock-ok">Sotuvda: {stock} dona</span>}
          {p.weight_kg ? <span>· {p.weight_kg} kg</span> : null}
        </div>

        <div className="qty-actions">
          <div className="qty-label">Miqdor (dona) — <span style={{ color: 'var(--accent)' }}>bu yerga son yozing</span></div>
          <div className="row">
            <button type="button" className="qbtn" aria-label="Kamaytirish" onClick={() => setQtyStr(String(Math.max(0, qty - 1)))}>−</button>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value.replace(/\D/g, ''))}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="qbtn" aria-label="Ko‘paytirish" onClick={() => setQtyStr(String(qty + 1))}>+</button>
          </div>
          <div className="qty-hint">Masalan 10 yozing yoki + tugmasini bosing. 0 bo‘lsa savatga qo‘shilmaydi.</div>
        </div>

        <button
          className={'btn ' + (out ? 'btn-warn' : '') + (added ? ' btn-added' : '')}
          style={{ opacity: qty < 1 ? 0.55 : 1 }}
          onClick={() => {
            if (qty < 1) {
              if (showMsg) showMsg('Avval miqdorni kiriting (masalan: 10)', true);
              return;
            }
            onAdd(p, qty);
            setQtyStr('0');
            setAdded(true);
            setTimeout(() => setAdded(false), 1600);
          }}
        >
          {added ? '✓ Qo‘shildi' : 'Savatga'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onDetail(p)}>Batafsil</button>
      </div>
    </div>
  );
}

function DetailPage({ p, settings, onClose, onAdd, showMsg }) {
  const [qtyStr, setQtyStr] = useState('0');
  const [imgI, setImgI] = useState(0);
  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const { asosiy, yirik, disc, minQty } = prices(p, settings);
  const imgs = productImages(p);
  const stock = Number(p.balance_qty) || 0;
  const out = stock <= 0;

  useEffect(() => {
    try {
      if (tg && tg.BackButton) {
        tg.BackButton.show();
        const h = () => onClose();
        if (tg.BackButton.onClick) tg.BackButton.onClick(h);
        return () => { try { tg.BackButton.hide(); } catch (e) {} };
      }
    } catch (e) {}
  }, [onClose]);

  return (
    <div className="detail-page">
      <div className="detail-header">
        <button type="button" className="detail-back" onClick={onClose}>← Orqaga</button>
        <h2>{p.sku}</h2>
      </div>
      <div className="detail-gallery">
        {imgs.length ? (
          <>
            <img src={imgs[imgI]} alt={p.sku} onLoad={(e) => e.target.classList.add('loaded')} />
            {imgs.length > 1 && (
              <>
                <button type="button" className="gallery-ctrl prev" aria-label="Oldingi rasm" onClick={() => setImgI((imgI - 1 + imgs.length) % imgs.length)}>‹</button>
                <button type="button" className="gallery-ctrl next" aria-label="Keyingi rasm" onClick={() => setImgI((imgI + 1) % imgs.length)}>›</button>
                <div className="gallery-dots">{imgs.map((_, d) => <span key={d} className={d === imgI ? 'on' : ''} />)}</div>
              </>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/></svg>
          </div>
        )}
      </div>
      <div className="detail-body">
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{p.sku}</h3>
        <div className="price-block">
          <div className="price-main">{money(asosiy)} <span>so‘m / dona</span></div>
          <div className="price-bulk">
            <strong>{minQty}+ dona</strong> xarid qilsangiz: {money(yirik)} so‘m
            <br />Har bir donadan {money(disc)} so‘m tejaysiz
          </div>
        </div>
        <div className="stock-row" style={{ marginTop: 10 }}>
          {out
            ? <span className="stock-out">Hozircha qolmadi · 3–7 kunda tayyor bo‘ladi</span>
            : <span className="stock-ok">Sotuvda: {stock} dona</span>}
          {p.weight_kg ? <span>· {p.weight_kg} kg</span> : null}
        </div>
        {(p.description || p.desc || p.note) ? (
          <div className="detail-desc">{p.description || p.desc || p.note}</div>
        ) : null}
      </div>
      <div className="detail-actions">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
          Miqdor (dona) — son yozing yoki + bosing
        </div>
        <div className="qty-row" style={{ marginTop: 0 }}>
          <button type="button" aria-label="Kamaytirish" onClick={() => setQtyStr(String(Math.max(0, qty - 1)))}>−</button>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value.replace(/\D/g, ''))}
            onFocus={(e) => e.target.select()}
            style={{ border: '2px solid var(--accent)', fontWeight: 700, fontSize: 18 }}
          />
          <button type="button" aria-label="Ko‘paytirish" onClick={() => setQtyStr(String(qty + 1))}>+</button>
          <button
            className={'btn ' + (out ? 'btn-warn' : '')}
            style={{ opacity: qty < 1 ? 0.55 : 1 }}
            onClick={() => {
              if (qty < 1) {
                showMsg('Avval miqdorni kiriting (masalan: 10)', true);
                return;
              }
              onAdd(p, qty);
              onClose();
            }}
          >
            Savatga
          </button>
        </div>
      </div>
    </div>
  );
}

function Catalog({ katalog, settings, loading, onAdd, onDetail, onLightbox, tipOpen, setTipOpen, onRefresh, showMsg }) {
  return (
    <div>
      <div className="top">
        <h1>BLACK DIAMOND</h1>
        <p>Premium Auto-Ignite Briquettes</p>
      </div>
      <div className="container">
        {tipOpen && (
          <div className="tip-banner">
            <div className="tip-text">
              <strong>Qanday buyurtma beriladi?</strong><br />
              1) Miqdorni yozing → 2) Savatga qo'shing → 3) Savatdan yuboring
            </div>
            <button type="button" className="tip-close" aria-label="Maslahatni yopish" onClick={() => { setTipOpen(false); localStorage.setItem(storageKey('bd_tip_closed'), '1'); }}>×</button>
          </div>
        )}
        <div className="catalog-toolbar">
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Katalog</div>
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>Yangilash</button>
        </div>
        {loading && <Loading text="Katalog yuklanmoqda..." />}
        {!loading && !katalog.length && (
          <div className="empty">
            <div className="empty-icon">◇</div>
            <div className="empty-title">Mahsulot yo'q</div>
            <div className="empty-desc">Hozircha katalog bo‘sh. Yangilab ko‘ring yoki keyinroq qayting.</div>
            <button type="button" className="btn" style={{ maxWidth: 240, margin: '0 auto' }} onClick={onRefresh}>Yangilash</button>
          </div>
        )}
        {!loading && katalog.map((p) => (
          <ProductCard key={p.id} p={p} settings={settings} onAdd={onAdd} onDetail={onDetail} onLightbox={onLightbox} showMsg={showMsg} />
        ))}
      </div>
    </div>
  );
}

function formatUzPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  let out = '+998';
  if (d.length) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}
function Savat({ cart, katalog, settings, user, setCart, showMsg, onOrdered, onGoCatalog }) {
  const [tolangan, setTolangan] = useState('');
  const [muddat, setMuddat] = useState('');
  const [izoh, setIzoh] = useState('');
  const [phone, setPhone] = useState(user.phone || localStorage.getItem(storageKey('bd_phone')) || '');
  const [address, setAddress] = useState(localStorage.getItem(storageKey('bd_address')) || '');
  const [busy, setBusy] = useState(false);
  const [qtyStr, setQtyStr] = useState({});

  const map = {};
  (katalog || []).forEach((p) => { map[p.id] = p; });

  const lines = cart.map((c) => {
    const p = map[c.id];
    if (!p) return null;
    const up = unitPrice(p, c.qty, settings);
    return { p, qty: c.qty, up, sum: up * c.qty };
  }).filter(Boolean);

  const jamiDona = lines.reduce((s, l) => s + l.qty, 0);
  const jamiKg = lines.reduce((s, l) => s + l.qty * (Number(l.p.weight_kg) || 0), 0);
  const jami = lines.reduce((s, l) => s + l.sum, 0);
  const minQty = Number(settings.bulk_min_qty) || 500;
  const yirik = jamiDona >= minQty;
  const hasLater = lines.some((l) => (Number(l.p.balance_qty) || 0) <= 0);

  const maxDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };
  const minDate = () => new Date().toISOString().slice(0, 10);

  const setQty = (id, n) => {
    n = Math.max(0, Math.floor(Number(n) || 0));
    setCart((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, qty: n } : x)).filter((x) => x.qty > 0);
      saveCart(next);
      return next;
    });
  };

  if (!cart.length) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty-icon">🛒</div>
          <div className="empty-title">Savat bo‘sh</div>
          <div className="empty-desc">Katalogdan mahsulot tanlab, miqdorni yozing va savatga qo'shing.</div>
          <button className="btn" style={{ maxWidth: 240, margin: '0 auto' }} onClick={onGoCatalog}>Katalogga o‘tish</button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    const initNow = getInitData();
    if (!initNow && !(tg && tg.initDataUnsafe && tg.initDataUnsafe.user)) {
      showMsg('Telegram sessiyasi topilmadi. Botdagi Mini App tugmasidan qayta oching (brauzer orqali emas).', true);
      return;
    }
    if (!phone || String(phone).replace(/\D/g, '').length < 9) {
      showMsg('Telefon raqamini to‘liq kiriting', true);
      return;
    }
    const tol = Math.max(0, Number(String(tolangan).replace(/\s/g, '')) || 0);
    const qarz = Math.max(0, jami - tol);
    if (qarz > 0 && !muddat) {
      showMsg('Qarz bo‘lsa, qaytarish sanasini tanlang', true);
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(storageKey('bd_phone'), phone);
      localStorage.setItem(storageKey('bd_address'), address);
      const r = await api('/api/customer/orders', {
        method: 'POST',
        body: {
          initData: getInitData(),
          items: cart.map((c) => ({ product_id: c.id, qty: c.qty })),
          phone,
          address: address || null,
          note: [izoh, muddat ? ('Qarz muddati: ' + muddat) : ''].filter(Boolean).join(' | ') || null,
          paid_amount: tol
        }
      });
      setCart([]);
      saveCart([]);
      showMsg('Buyurtma qabul qilindi: ' + r.data.order_code, false);
      onOrdered(r.data);
    } catch (e) {
      showMsg(e.message, true);
    }
    setBusy(false);
  };

  return (
    <div className="container cart-has-sticky">
      <div className="card">
        <div className="card-title">Savat</div>
        <div className="meta" style={{ marginBottom: 10 }}>{user.name || 'Mijoz'} · {phone || '—'}</div>

        {[['Hozir mavjud', false], ['Kutish kerak (3–7 kun)', true]].map(function (sec) {
          const part = lines.filter(function (l) { return ((Number(l.p.balance_qty) || 0) <= 0) === sec[1]; });
          if (!part.length) return null;
          return (
            <div key={sec[0]}>
              <div className="card-title" style={{ marginTop: 8, fontSize: 13 }}>{sec[0]}</div>
        {part.map((l) => {
          const display = qtyStr[l.p.id] !== undefined ? qtyStr[l.p.id] : String(l.qty);
          const out = (Number(l.p.balance_qty) || 0) <= 0;
          const imgs = productImages(l.p);
          return (
            <div className="cart-item" key={l.p.id}>
              {imgs[0]
                ? <img src={imgs[0]} alt="" loading="lazy" onLoad={(e) => e.target.classList.add('loaded')} />
                : <div style={{ width: 72, height: 72, background: 'var(--surface-2)', borderRadius: 12 }} />}
              <div className="info">
                <strong>{l.p.sku}</strong>
                {out && <div className="later-badge">Savatga (3–7 kun)</div>}
                <div className="meta">{money(l.sum)} so‘m</div>
                <div className="qty-row" style={{ marginTop: 8 }}>
                  <button type="button" aria-label="Kamaytirish" onClick={() => { setQtyStr({ ...qtyStr, [l.p.id]: undefined }); setQty(l.p.id, l.qty - 1); }}>−</button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={display}
                    onChange={(e) => setQtyStr({ ...qtyStr, [l.p.id]: e.target.value.replace(/\D/g, '') })}
                    onBlur={() => {
                      const n = parseInt(qtyStr[l.p.id], 10);
                      setQtyStr({ ...qtyStr, [l.p.id]: undefined });
                      setQty(l.p.id, isNaN(n) ? 0 : n);
                    }}
                  />
                  <button type="button" aria-label="Ko‘paytirish" onClick={() => { setQtyStr({ ...qtyStr, [l.p.id]: undefined }); setQty(l.p.id, l.qty + 1); }}>+</button>
                </div>
              </div>
            </div>
          );
        })}
            </div>
          );
        })}

        <div className="total-box">
          <div className="row"><span>Jami dona</span><span>{jamiDona}</span></div>
          <div className="row"><span>Jami kg</span><span>{jamiKg.toFixed(1)}</span></div>
          <div className="row"><span>Narx turi</span><span>{yirik ? 'Yirik (500+ chegirma)' : 'Oddiy narx'}</span></div>
          <div className="row big"><span>Jami summa</span><span>{money(jami)} so‘m</span></div>
        </div>

        {!yirik && jamiDona > 0 && jamiDona >= Math.max(1, minQty - 150) ? (
          <div className="bulk-note">Yana {minQty - jamiDona} dona — yirik narxga o‘tasiz.</div>
        ) : null}
        {yirik && (
          <div className="bulk-note">Siz {minQty}+ dona xarid qilyapsiz — yirik chegirma qo‘llanmoqda.</div>
        )}
        {hasLater && (
          <div className="pay-note" style={{ borderColor: 'rgba(234,179,8,0.3)' }}>
            Ba’zi mahsulotlar hozir omborda yo'q. Ular 3–7 kunda tayyor bo‘ladi.
          </div>
        )}
        <div className="pay-note">
          Buyurtma qabul qilingandan keyin <b>naqd</b> yoki <b>karta</b> orqali to‘lanadi.
        </div>

        <label>Telefon *</label>
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(formatUzPhone(e.target.value))} placeholder="+998 90 123 45 67" />
        <div className="pay-note" style={{ marginTop: 6 }}>Format: +998 XX XXX XX XX</div>

        <label>Manzil</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Yetkazib berish manzili" />

        <label>Hozir to‘laysizmi? Summani kiriting (ixtiyoriy)</label>
        <input type="number" value={tolangan} onChange={(e) => setTolangan(e.target.value)} placeholder="0 — keyin to‘lash mumkin" />
        <div className="pay-note">
          Qolgan qarz: <b>{money(Math.max(0, jami - (Number(String(tolangan).replace(/\s/g, '')) || 0)))} so‘m</b> — buyurtma tasdiqlanganda naqd yoki karta orqali to‘lanadi.
        </div>

        <label>Qarz qaytarish sanasi (max 7 kun)</label>
        <input type="date" value={muddat} min={minDate()} max={maxDate()} onChange={(e) => setMuddat(e.target.value)} />

        <label>Izoh (ixtiyoriy)</label>
        <textarea rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder="Masalan: manzilingiz" />

        <button type="button" className="btn btn-ghost" onClick={() => {
          const ask = window.bdConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
          ask('Savatni tozalashni xohlaysizmi?').then((ok) => { if (ok) { setCart([]); saveCart([]); } });
        }}>
          Savatni tozalash
        </button>
      </div>
      <div className="checkout-sticky">
        <div className="checkout-sticky-inner">
          <div className="sum">
            Jami · {jamiDona} dona
            <strong>{money(jami)} so‘m</strong>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {busy ? 'Yuborilmoqda...' : 'Buyurtmani yuborish'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Buyurtmalar({ orders, loading, onReload, orderSuccess, onClearSuccess, onGoCatalog, showMsg }) {
  if (orderSuccess) {
    return (
      <div className="container">
        <div className="card">
          <div className="success-panel">
            <div className="success-icon">✓</div>
            <h3>Buyurtma qabul qilindi</h3>
            {orderSuccess && orderSuccess.order_code && (
              <div className="success-code-row">
                <div className="success-code">{orderSuccess.order_code}</div>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  const c = orderSuccess.order_code;
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(c).then(() => showMsg('Kod nusxalandi', false)).catch(() => showMsg(c, false));
                  } else { showMsg(c, false); }
                }}>Nusxa</button>
              </div>
            )}
            <p>Tez orada siz bilan bog'lanamiz. Holatni shu yerda kuzatishingiz mumkin.</p>
            <button className="btn" onClick={() => { onClearSuccess(); onReload(); }}>Buyurtmalarni ko'rish</button>
            <button className="btn btn-secondary" onClick={onGoCatalog}>Katalogga qaytish</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="container"><Loading text="Buyurtmalar yuklanmoqda..." /></div>;

  if (!orders.length) {
    return (
      <div className="container">
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-title">Hali buyurtma yo'q</div>
          <div className="empty-desc">Birinchi buyurtmangizni bering — holatni shu yerda kuzatasiz.</div>
          <button className="btn" style={{ maxWidth: 240, margin: '0 auto' }} onClick={onGoCatalog}>Katalogga o‘tish</button>
        </div>
      </div>
    );
  }

  const normalizeStatus = (raw) => {
    const low = String(raw || '').toLowerCase();
    // Faqat 3 asosiy holat (mijoz uchun)
    if (low === 'confirmed' || low === 'paid' || low === 'closed' || low.indexOf('tasdiq') >= 0) {
      return { badgeCls: 'badge-ok', text: 'Tasdiqlandi', canCancel: false };
    }
    if (low.indexOf('reject') >= 0 || low.indexOf('rad') >= 0 || low.indexOf('cancel') >= 0 || low === 'bekor') {
      return { badgeCls: 'badge-no', text: low.indexOf('cancel') >= 0 || low === 'bekor' ? 'Bekor qilindi' : 'Rad etildi', canCancel: false };
    }
    // pending, partial, yangi, ...
    return { badgeCls: 'badge-wait', text: 'Ko‘rib chiqilmoqda', canCancel: true };
  };

  const cancelOrder = async (orderId) => {
    const ask = window.bdConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
    if (!(await ask('Buyurtmani bekor qilasizmi?'))) return;
    try {
      await api('/api/customer/orders/' + orderId + '/cancel', { method: 'POST', body: {} });
      showMsg('Buyurtma bekor qilindi', false);
      onReload();
    } catch (e) {
      showMsg(e.message, true);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="card-title">Buyurtmalarim</div>
        {orders.map((b) => {
          const st = normalizeStatus(b.status);
          return (
            <div className="order-card" key={b.id}>
              <strong>{b.order_code}</strong>
              <span className={'badge ' + st.badgeCls}>{st.text}</span>
              {Number(b.debt_amount) > 0 ? <span className="badge badge-no" style={{ marginLeft: 6 }}>Qarz bor</span> : null}
              <div className="meta">{b.created_at ? new Date(b.created_at).toLocaleString('uz-UZ') : ''}</div>
              {(b.items || []).map((it, i) => (
                <div className="meta" key={i}>• {it.sku} × {it.qty}</div>
              ))}
              <div className="meta">
                Jami: {money(b.total_amount)} so‘m
              </div>
              <div className="meta">
                Naqd (niyat): {money(b.paid_amount)} so‘m · Qoldiq: {money(b.debt_amount)} so‘m
              </div>
              <div className="meta" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Ko'rsatilgan summa buyurtma tasdiqlanganda naqd yoki karta orqali to'lanadi
              </div>
              {b.phone ? <div className="meta">Tel: {b.phone}</div> : null}
              {st.canCancel ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 10, background: 'transparent', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
                  onClick={() => cancelOrder(b.id)}
                >
                  Bekor qilish
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Aloqa({ user, settings }) {
  const phone = settings.customer_phone || '998880090506';
  const tgl = settings.customer_telegram || 'https://t.me/briketkumir';
  const digits = String(phone).replace(/\D/g, '');
  return (
    <div className="container">
      <div className="card">
        <div className="card-title">Aloqa</div>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Siz: <b>{user.name || 'Mijoz'}</b><br />
          {user.phone || '—'}
        </p>
        <a className="btn btn-block" href={'tel:+' + digits} style={{ textDecoration: 'none' }}>
          Qo‘ng‘iroq qilish: +{digits}
        </a>
        <a className="btn btn-secondary btn-block" href={tgl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          Telegram
        </a>
      </div>
    </div>
  );
}

function Nav({ tab, setTab, cartCount, onOrders }) {
  const Icon = ({ d }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d={d} strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  return (
    <nav className="nav">
      <button type="button" className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>
        <span className="nav-icon-wrap"><Icon d="M4 6h16M4 12h16M4 18h16" /></span>
        Katalog
      </button>
      <button type="button" className={tab === 'cart' ? 'active' : ''} onClick={() => setTab('cart')}>
        <span className="nav-icon-wrap">
          <Icon d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-1.5 6h13M10 19a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" />
          {cartCount > 0 && <span className="nav-badge">{cartCount}</span>}
        </span>
        Savat
      </button>
      <button type="button" className={tab === 'orders' ? 'active' : ''} onClick={() => { setTab('orders'); onOrders(); }}>
        <span className="nav-icon-wrap"><Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></span>
        Buyurtmalar
      </button>
      <button type="button" className={tab === 'aloqa' ? 'active' : ''} onClick={() => setTab('aloqa')}>
        <span className="nav-icon-wrap"><Icon d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" /></span>
        Aloqa
      </button>
    </nav>
  );
}

function App() {
  const [tab, setTab] = useState('catalog');
  const [katalog, setKatalog] = useState([]);
  const [settings, setSettings] = useState({
    bulk_discount: '3000',
    bulk_min_qty: '500',
    customer_phone: '998880090506',
    customer_telegram: 'https://t.me/briketkumir'
  });
  const [cart, setCart] = useState(() => loadCart());
  const [user, setUser] = useState({ name: 'Mijoz', phone: '' });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [tipOpen, setTipOpen] = useState(localStorage.getItem(storageKey('bd_tip_closed')) !== '1');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const msgTimer = useRef(null);

  useEffect(() => {
    function on() { setOnline(true); }
    function off() { setOnline(false); }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const showMsg = useCallback((text, err) => {
    setMsg({ text, err: !!err });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), err ? 6000 : 2500);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const auth = await api('/api/customer/auth/telegram', { method: 'POST', body: { initData: getInitData() } });
        setUser({ name: auth.data.name || 'Mijoz', phone: auth.data.phone || '' });
        setCart(loadCart());
      } catch (e) {}
      const cat = await api('/api/customer/catalog');
      setKatalog(cat.data || []);
      try {
        const st = await api('/api/customer/settings');
        setSettings((s) => Object.assign({}, s, st.data || {}));
      } catch (e) {}
    } catch (e) {
      showMsg(e.message, true);
    }
    setLoading(false);
  }, [showMsg]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const addToCart = (p, qty) => {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      let next;
      if (i >= 0) {
        next = prev.slice();
        next[i] = { id: p.id, qty: next[i].qty + qty };
      } else {
        next = prev.concat([{ id: p.id, qty }]);
      }
      saveCart(next);
      return next;
    });
    showMsg('Savatga qo‘shildi', false);
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const r = await api('/api/customer/orders');
      setOrders(r.data || []);
    } catch (e) {
      showMsg(e.message, true);
    }
    setOrdersLoading(false);
  };

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <>
      {!online && (
        <div className="offline-banner">Internet aloqasi yo'q — oxirgi ko'rilgan ma'lumotlar ko'rsatilmoqda
          <button type="button" className="btn btn-secondary" style={{ marginLeft: 8, padding: '4px 8px', width: 'auto' }} onClick={loadCatalog}>Qayta urinish</button>
        </div>
      )}
      {tab === 'catalog' && !detail && (
        <Catalog
          katalog={katalog}
          settings={settings}
          loading={loading}
          onAdd={addToCart}
          onDetail={setDetail}
          onLightbox={(imgs, i) => setLightbox({ images: imgs, index: i })}
          tipOpen={tipOpen}
          setTipOpen={setTipOpen}
          onRefresh={loadCatalog}
          showMsg={showMsg}
        />
      )}
      {tab === 'cart' && !detail && (
        <Savat
          cart={cart}
          katalog={katalog}
          settings={settings}
          user={user}
          setCart={setCart}
          showMsg={showMsg}
          onOrdered={(o) => { setOrderSuccess(o); setTab('orders'); }}
          onGoCatalog={() => setTab('catalog')}
        />
      )}
      {tab === 'orders' && !detail && (
        <Buyurtmalar
          orders={orders}
          loading={ordersLoading}
          onReload={loadOrders}
          orderSuccess={orderSuccess}
          onClearSuccess={() => setOrderSuccess(null)}
          onGoCatalog={() => setTab('catalog')}
          showMsg={showMsg}
        />
      )}
      {tab === 'aloqa' && !detail && <Aloqa user={user} settings={settings} />}

      {detail && (
        <DetailPage
          p={detail}
          settings={settings}
          onClose={() => setDetail(null)}
          onAdd={addToCart}
          showMsg={showMsg}
        />
      )}
      {lightbox && (
        <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {!detail && (
        <Nav tab={tab} setTab={setTab} cartCount={cartCount} onOrders={loadOrders} />
      )}
      <Toast msg={msg} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

  
