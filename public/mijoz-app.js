const { useState, useEffect, useCallback, useMemo, useRef } = React;
const API = window.location.origin;
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("bg_color");
    if (tg.setBackgroundColor) tg.setBackgroundColor("bg_color");
  } catch (e) {
  }
}
function money(n) {
  return Number(n || 0).toLocaleString("uz-UZ");
}
function getInitData() {
  try {
    if (tg) {
      if (tg.initData) return tg.initData;
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        return tg.initData || "";
      }
    }
  } catch (e) {
  }
  return "";
}
function demoId() {
  let id = localStorage.getItem("demo_tg_id");
  if (!id) {
    id = "web-" + Date.now();
    localStorage.setItem("demo_tg_id", id);
  }
  return id;
}
function getUserScopeId() {
  try {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      return "tg-" + String(tg.initDataUnsafe.user.id);
    }
  } catch (e) {
  }
  return "web-" + demoId();
}
function storageKey(base) {
  return base + "__" + getUserScopeId();
}
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(storageKey("bd_cart")) || "[]");
  } catch (e) {
    return [];
  }
}
function saveCart(cart) {
  localStorage.setItem(storageKey("bd_cart"), JSON.stringify(cart || []));
}
function apiHeaders(json) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  const init = getInitData();
  if (init) h["x-telegram-init-data"] = init;
  h["x-demo-telegram-id"] = demoId();
  return h;
}
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: apiHeaders(!!opts.body),
    body: opts.body ? JSON.stringify(opts.body) : void 0
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText || "Xato");
  return data;
}
function productImages(p) {
  if (p.image_urls && p.image_urls.length) return p.image_urls;
  return [];
}
function prices(p, settings) {
  const disc = Number(settings.bulk_discount) || 3e3;
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
  return /* @__PURE__ */ React.createElement("div", { className: "toast " + (msg.err ? "err" : "ok") }, msg.text);
}
function Loading({ text }) {
  return /* @__PURE__ */ React.createElement("div", { className: "loading" }, text || "Yuklanmoqda...");
}
function Gallery({ images, alt }) {
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState({});
  const list = (images || []).filter(Boolean);
  const ok = list.filter(function(url, idx) {
    return !failed[idx];
  });
  if (!list.length || !ok.length) {
    return /* @__PURE__ */ React.createElement("div", { className: "product-img product-img-empty", style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, background: "var(--surface-2, #141210)" } }, /* @__PURE__ */ React.createElement("svg", { width: "56", height: "56", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", style: { opacity: 0.45 } }, /* @__PURE__ */ React.createElement("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }), /* @__PURE__ */ React.createElement("path", { d: "M3.3 7L12 12l8.7-5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 22V12" })));
  }
  const n = list.length;
  const cur = Math.min(i, n - 1);
  return /* @__PURE__ */ React.createElement("div", { className: "product-img", style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
    "img",
    {
      key: list[cur] + "-" + cur,
      src: list[cur],
      alt: alt || "",
      loading: "lazy",
      onLoad: (e) => e.target.classList.add("loaded"),
      onError: () => {
        setFailed(function(prev) {
          var next = Object.assign({}, prev);
          next[cur] = true;
          return next;
        });
        var nextIdx = -1;
        for (var j = 1; j < n; j++) {
          var cand = (cur + j) % n;
          if (!failed[cand]) {
            nextIdx = cand;
            break;
          }
        }
        if (nextIdx >= 0) setI(nextIdx);
      }
    }
  ), n > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gallery-ctrl prev", "aria-label": "Oldingi rasm", onClick: (e) => {
    e.stopPropagation();
    setI((cur - 1 + n) % n);
  } }, "\u2039"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gallery-ctrl next", "aria-label": "Keyingi rasm", onClick: (e) => {
    e.stopPropagation();
    setI((cur + 1) % n);
  } }, "\u203A"), /* @__PURE__ */ React.createElement("div", { className: "gallery-dots" }, list.map((_, d) => /* @__PURE__ */ React.createElement("span", { key: d, className: d === cur ? "on" : "" })))));
}
function Lightbox({ images, index, onClose }) {
  const [i, setI] = useState(index || 0);
  if (!images || !images.length) return null;
  const n = images.length;
  return /* @__PURE__ */ React.createElement("div", { className: "lightbox", onClick: onClose }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "lightbox-close", "aria-label": "Yopish", onClick: onClose }, "\xD7"), n > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "lightbox-nav prev", "aria-label": "Oldingi rasm", onClick: (e) => {
    e.stopPropagation();
    setI((i - 1 + n) % n);
  } }, "\u2039"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "lightbox-nav next", "aria-label": "Keyingi rasm", onClick: (e) => {
    e.stopPropagation();
    setI((i + 1) % n);
  } }, "\u203A")), /* @__PURE__ */ React.createElement("img", { src: images[i], alt: "", onClick: (e) => e.stopPropagation() }), n > 1 && /* @__PURE__ */ React.createElement("div", { className: "lightbox-counter" }, i + 1, " / ", n));
}
function ProductCard({ p, settings, onAdd, onDetail, onLightbox, showMsg }) {
  const [added, setAdded] = useState(false);
  const [qtyStr, setQtyStr] = useState("0");
  const qty = Math.max(0, parseInt(qtyStr, 10) || 0);
  const { asosiy, yirik, disc, minQty } = prices(p, settings);
  const imgs = productImages(p);
  const stock = Number(p.balance_qty) || 0;
  const out = stock <= 0;
  return /* @__PURE__ */ React.createElement("div", { className: "product" }, /* @__PURE__ */ React.createElement("div", { onClick: () => imgs.length && onLightbox(imgs, 0) }, /* @__PURE__ */ React.createElement(Gallery, { images: imgs, alt: p.sku })), /* @__PURE__ */ React.createElement("div", { className: "product-body" }, /* @__PURE__ */ React.createElement("h3", { onClick: () => onDetail(p) }, p.sku), /* @__PURE__ */ React.createElement("div", { className: "price-block" }, /* @__PURE__ */ React.createElement("div", { className: "price-main" }, money(asosiy), " ", /* @__PURE__ */ React.createElement("span", null, "so\u2018m / dona")), /* @__PURE__ */ React.createElement("div", { className: "price-bulk" }, /* @__PURE__ */ React.createElement("strong", null, minQty, "+ dona"), " xarid qilsangiz: ", money(yirik), " so\u2018m", /* @__PURE__ */ React.createElement("br", null), "Har bir donadan ", money(disc), " so\u2018m tejaysiz")), /* @__PURE__ */ React.createElement("div", { className: "stock-row" }, out ? /* @__PURE__ */ React.createElement("span", { className: "stock-out" }, "Hozircha qolmadi \xB7 3\u20137 kunda tayyor bo\u2018ladi") : /* @__PURE__ */ React.createElement("span", { className: "stock-ok" }, "Sotuvda: ", stock, " dona"), p.weight_kg ? /* @__PURE__ */ React.createElement("span", null, "\xB7 ", p.weight_kg, " kg") : null), /* @__PURE__ */ React.createElement("div", { className: "qty-actions" }, /* @__PURE__ */ React.createElement("div", { className: "qty-label" }, "Miqdor (dona) \u2014 ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent)" } }, "bu yerga son yozing")), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "qbtn", "aria-label": "Kamaytirish", onClick: () => setQtyStr(String(Math.max(0, qty - 1))) }, "\u2212"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      inputMode: "numeric",
      placeholder: "0",
      value: qtyStr,
      onChange: (e) => setQtyStr(e.target.value.replace(/\D/g, "")),
      onFocus: (e) => e.target.select()
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "button", className: "qbtn", "aria-label": "Ko\u2018paytirish", onClick: () => setQtyStr(String(qty + 1)) }, "+")), /* @__PURE__ */ React.createElement("div", { className: "qty-hint" }, "Masalan 10 yozing yoki + tugmasini bosing. 0 bo\u2018lsa savatga qo\u2018shilmaydi.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn " + (out ? "btn-warn" : "") + (added ? " btn-added" : ""),
      style: { opacity: qty < 1 ? 0.55 : 1 },
      onClick: () => {
        if (qty < 1) {
          if (showMsg) showMsg("Avval miqdorni kiriting (masalan: 10)", true);
          return;
        }
        onAdd(p, qty);
        setQtyStr("0");
        setAdded(true);
        setTimeout(() => setAdded(false), 1600);
      }
    },
    added ? "\u2713 Qo\u2018shildi" : "Savatga"
  ), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost", onClick: () => onDetail(p) }, "Batafsil")));
}
function DetailPage({ p, settings, onClose, onAdd, showMsg }) {
  const [qtyStr, setQtyStr] = useState("0");
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
        return () => {
          try {
            tg.BackButton.hide();
          } catch (e) {
          }
        };
      }
    } catch (e) {
    }
  }, [onClose]);
  return /* @__PURE__ */ React.createElement("div", { className: "detail-page" }, /* @__PURE__ */ React.createElement("div", { className: "detail-header" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "detail-back", onClick: onClose }, "\u2190 Orqaga"), /* @__PURE__ */ React.createElement("h2", null, p.sku)), /* @__PURE__ */ React.createElement("div", { className: "detail-gallery" }, imgs.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("img", { src: imgs[imgI], alt: p.sku, onLoad: (e) => e.target.classList.add("loaded") }), imgs.length > 1 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "gallery-ctrl prev", "aria-label": "Oldingi rasm", onClick: () => setImgI((imgI - 1 + imgs.length) % imgs.length) }, "\u2039"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "gallery-ctrl next", "aria-label": "Keyingi rasm", onClick: () => setImgI((imgI + 1) % imgs.length) }, "\u203A"), /* @__PURE__ */ React.createElement("div", { className: "gallery-dots" }, imgs.map((_, d) => /* @__PURE__ */ React.createElement("span", { key: d, className: d === imgI ? "on" : "" }))))) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" } }, /* @__PURE__ */ React.createElement("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6" }, /* @__PURE__ */ React.createElement("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }), /* @__PURE__ */ React.createElement("path", { d: "M3.3 7L12 12l8.7-5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 22V12" })))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 20, fontWeight: 700, marginBottom: 8 } }, p.sku), /* @__PURE__ */ React.createElement("div", { className: "price-block" }, /* @__PURE__ */ React.createElement("div", { className: "price-main" }, money(asosiy), " ", /* @__PURE__ */ React.createElement("span", null, "so\u2018m / dona")), /* @__PURE__ */ React.createElement("div", { className: "price-bulk" }, /* @__PURE__ */ React.createElement("strong", null, minQty, "+ dona"), " xarid qilsangiz: ", money(yirik), " so\u2018m", /* @__PURE__ */ React.createElement("br", null), "Har bir donadan ", money(disc), " so\u2018m tejaysiz")), /* @__PURE__ */ React.createElement("div", { className: "stock-row", style: { marginTop: 10 } }, out ? /* @__PURE__ */ React.createElement("span", { className: "stock-out" }, "Hozircha qolmadi \xB7 3\u20137 kunda tayyor bo\u2018ladi") : /* @__PURE__ */ React.createElement("span", { className: "stock-ok" }, "Sotuvda: ", stock, " dona"), p.weight_kg ? /* @__PURE__ */ React.createElement("span", null, "\xB7 ", p.weight_kg, " kg") : null), p.description || p.desc || p.note ? /* @__PURE__ */ React.createElement("div", { className: "detail-desc" }, p.description || p.desc || p.note) : null), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 } }, "Miqdor (dona) \u2014 son yozing yoki + bosing"), /* @__PURE__ */ React.createElement("div", { className: "qty-row", style: { marginTop: 0 } }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Kamaytirish", onClick: () => setQtyStr(String(Math.max(0, qty - 1))) }, "\u2212"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      inputMode: "numeric",
      placeholder: "0",
      value: qtyStr,
      onChange: (e) => setQtyStr(e.target.value.replace(/\D/g, "")),
      onFocus: (e) => e.target.select(),
      style: { border: "2px solid var(--accent)", fontWeight: 700, fontSize: 18 }
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Ko\u2018paytirish", onClick: () => setQtyStr(String(qty + 1)) }, "+"), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn " + (out ? "btn-warn" : ""),
      style: { opacity: qty < 1 ? 0.55 : 1 },
      onClick: () => {
        if (qty < 1) {
          showMsg("Avval miqdorni kiriting (masalan: 10)", true);
          return;
        }
        onAdd(p, qty);
        onClose();
      }
    },
    "Savatga"
  ))));
}
function Catalog({ katalog, settings, loading, onAdd, onDetail, onLightbox, tipOpen, setTipOpen, onRefresh, showMsg }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "top" }, /* @__PURE__ */ React.createElement("h1", null, "BLACK DIAMOND"), /* @__PURE__ */ React.createElement("p", null, "Premium Auto-Ignite Briquettes")), /* @__PURE__ */ React.createElement("div", { className: "container" }, tipOpen && /* @__PURE__ */ React.createElement("div", { className: "tip-banner" }, /* @__PURE__ */ React.createElement("div", { className: "tip-text" }, /* @__PURE__ */ React.createElement("strong", null, "Qanday buyurtma beriladi?"), /* @__PURE__ */ React.createElement("br", null), "1) Miqdorni yozing \u2192 2) Savatga qo'shing \u2192 3) Savatdan yuboring"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tip-close", "aria-label": "Maslahatni yopish", onClick: () => {
    setTipOpen(false);
    localStorage.setItem(storageKey("bd_tip_closed"), "1");
  } }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "catalog-toolbar" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "var(--text-muted)" } }, "Katalog"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: onRefresh }, "Yangilash")), loading && /* @__PURE__ */ React.createElement(Loading, { text: "Katalog yuklanmoqda..." }), !loading && !katalog.length && /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u25C7"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Mahsulot yo'q"), /* @__PURE__ */ React.createElement("div", { className: "empty-desc" }, "Hozircha katalog bo\u2018sh. Yangilab ko\u2018ring yoki keyinroq qayting."), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", style: { maxWidth: 240, margin: "0 auto" }, onClick: onRefresh }, "Yangilash")), !loading && katalog.map((p) => /* @__PURE__ */ React.createElement(ProductCard, { key: p.id, p, settings, onAdd, onDetail, onLightbox, showMsg }))));
}
function formatUzPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  let out = "+998";
  if (d.length) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return out;
}
function Savat({ cart, katalog, settings, user, setCart, showMsg, onOrdered, onGoCatalog }) {
  const [tolangan, setTolangan] = useState("");
  const [muddat, setMuddat] = useState("");
  const [izoh, setIzoh] = useState("");
  const [phone, setPhone] = useState(user.phone || localStorage.getItem(storageKey("bd_phone")) || "");
  const [address, setAddress] = useState(localStorage.getItem(storageKey("bd_address")) || "");
  const [busy, setBusy] = useState(false);
  const [qtyStr, setQtyStr] = useState({});
  const map = {};
  (katalog || []).forEach((p) => {
    map[p.id] = p;
  });
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
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };
  const minDate = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const setQty = (id, n) => {
    n = Math.max(0, Math.floor(Number(n) || 0));
    setCart((prev) => {
      const next = prev.map((x) => x.id === id ? { ...x, qty: n } : x).filter((x) => x.qty > 0);
      saveCart(next);
      return next;
    });
  };
  if (!cart.length) {
    return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u{1F6D2}"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Savat bo\u2018sh"), /* @__PURE__ */ React.createElement("div", { className: "empty-desc" }, "Katalogdan mahsulot tanlab, miqdorni yozing va savatga qo'shing."), /* @__PURE__ */ React.createElement("button", { className: "btn", style: { maxWidth: 240, margin: "0 auto" }, onClick: onGoCatalog }, "Katalogga o\u2018tish")));
  }
  const submit = async () => {
    const initNow = getInitData();
    if (!initNow && !(tg && tg.initDataUnsafe && tg.initDataUnsafe.user)) {
      showMsg("Telegram sessiyasi topilmadi. Botdagi Mini App tugmasidan qayta oching (brauzer orqali emas).", true);
      return;
    }
    if (!phone || String(phone).replace(/\D/g, "").length < 9) {
      showMsg("Telefon raqamini to\u2018liq kiriting", true);
      return;
    }
    const tol = Math.max(0, Number(String(tolangan).replace(/\s/g, "")) || 0);
    const qarz = Math.max(0, jami - tol);
    if (qarz > 0 && !muddat) {
      showMsg("Qarz bo\u2018lsa, qaytarish sanasini tanlang", true);
      return;
    }
    setBusy(true);
    try {
      localStorage.setItem(storageKey("bd_phone"), phone);
      localStorage.setItem(storageKey("bd_address"), address);
      const r = await api("/api/customer/orders", {
        method: "POST",
        body: {
          initData: getInitData(),
          items: cart.map((c) => ({ product_id: c.id, qty: c.qty })),
          phone,
          address: address || null,
          note: [izoh, muddat ? "Qarz muddati: " + muddat : ""].filter(Boolean).join(" | ") || null,
          paid_amount: tol
        }
      });
      setCart([]);
      saveCart([]);
      showMsg("Buyurtma qabul qilindi: " + r.data.order_code, false);
      onOrdered(r.data);
    } catch (e) {
      showMsg(e.message, true);
    }
    setBusy(false);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "container cart-has-sticky" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, "Savat"), /* @__PURE__ */ React.createElement("div", { className: "meta", style: { marginBottom: 10 } }, user.name || "Mijoz", " \xB7 ", phone || "\u2014"), [["Hozir mavjud", false], ["Kutish kerak (3\u20137 kun)", true]].map(function(sec) {
    const part = lines.filter(function(l) {
      return (Number(l.p.balance_qty) || 0) <= 0 === sec[1];
    });
    if (!part.length) return null;
    return /* @__PURE__ */ React.createElement("div", { key: sec[0] }, /* @__PURE__ */ React.createElement("div", { className: "card-title", style: { marginTop: 8, fontSize: 13 } }, sec[0]), part.map((l) => {
      const display = qtyStr[l.p.id] !== void 0 ? qtyStr[l.p.id] : String(l.qty);
      const out = (Number(l.p.balance_qty) || 0) <= 0;
      const imgs = productImages(l.p);
      return /* @__PURE__ */ React.createElement("div", { className: "cart-item", key: l.p.id }, imgs[0] ? /* @__PURE__ */ React.createElement("img", { src: imgs[0], alt: "", loading: "lazy", onLoad: (e) => e.target.classList.add("loaded") }) : /* @__PURE__ */ React.createElement("div", { style: { width: 72, height: 72, background: "var(--surface-2)", borderRadius: 12 } }), /* @__PURE__ */ React.createElement("div", { className: "info" }, /* @__PURE__ */ React.createElement("strong", null, l.p.sku), out && /* @__PURE__ */ React.createElement("div", { className: "later-badge" }, "Savatga (3\u20137 kun)"), /* @__PURE__ */ React.createElement("div", { className: "meta" }, money(l.sum), " so\u2018m"), /* @__PURE__ */ React.createElement("div", { className: "qty-row", style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Kamaytirish", onClick: () => {
        setQtyStr({ ...qtyStr, [l.p.id]: void 0 });
        setQty(l.p.id, l.qty - 1);
      } }, "\u2212"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          inputMode: "numeric",
          value: display,
          onChange: (e) => setQtyStr({ ...qtyStr, [l.p.id]: e.target.value.replace(/\D/g, "") }),
          onBlur: () => {
            const n = parseInt(qtyStr[l.p.id], 10);
            setQtyStr({ ...qtyStr, [l.p.id]: void 0 });
            setQty(l.p.id, isNaN(n) ? 0 : n);
          }
        }
      ), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Ko\u2018paytirish", onClick: () => {
        setQtyStr({ ...qtyStr, [l.p.id]: void 0 });
        setQty(l.p.id, l.qty + 1);
      } }, "+"))));
    }));
  }), /* @__PURE__ */ React.createElement("div", { className: "total-box" }, /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("span", null, "Jami dona"), /* @__PURE__ */ React.createElement("span", null, jamiDona)), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("span", null, "Jami kg"), /* @__PURE__ */ React.createElement("span", null, jamiKg.toFixed(1))), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("span", null, "Narx turi"), /* @__PURE__ */ React.createElement("span", null, yirik ? "Yirik (500+ chegirma)" : "Oddiy narx")), /* @__PURE__ */ React.createElement("div", { className: "row big" }, /* @__PURE__ */ React.createElement("span", null, "Jami summa"), /* @__PURE__ */ React.createElement("span", null, money(jami), " so\u2018m"))), !yirik && jamiDona > 0 && jamiDona >= Math.max(1, minQty - 150) ? /* @__PURE__ */ React.createElement("div", { className: "bulk-note" }, "Yana ", minQty - jamiDona, " dona \u2014 yirik narxga o\u2018tasiz.") : null, yirik && /* @__PURE__ */ React.createElement("div", { className: "bulk-note" }, "Siz ", minQty, "+ dona xarid qilyapsiz \u2014 yirik chegirma qo\u2018llanmoqda."), hasLater && /* @__PURE__ */ React.createElement("div", { className: "pay-note", style: { borderColor: "rgba(234,179,8,0.3)" } }, "Ba\u2019zi mahsulotlar hozir omborda yo'q. Ular 3\u20137 kunda tayyor bo\u2018ladi."), /* @__PURE__ */ React.createElement("div", { className: "pay-note" }, "Buyurtma qabul qilingandan keyin ", /* @__PURE__ */ React.createElement("b", null, "naqd"), " yoki ", /* @__PURE__ */ React.createElement("b", null, "karta"), " orqali to\u2018lanadi."), /* @__PURE__ */ React.createElement("label", null, "Telefon *"), /* @__PURE__ */ React.createElement("input", { type: "tel", inputMode: "tel", value: phone, onChange: (e) => setPhone(formatUzPhone(e.target.value)), placeholder: "+998 90 123 45 67" }), /* @__PURE__ */ React.createElement("div", { className: "pay-note", style: { marginTop: 6 } }, "Format: +998 XX XXX XX XX"), /* @__PURE__ */ React.createElement("label", null, "Manzil"), /* @__PURE__ */ React.createElement("input", { value: address, onChange: (e) => setAddress(e.target.value), placeholder: "Yetkazib berish manzili" }), /* @__PURE__ */ React.createElement("label", null, "Hozir to\u2018laysizmi? Summani kiriting (ixtiyoriy)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: tolangan, onChange: (e) => setTolangan(e.target.value), placeholder: "0 \u2014 keyin to\u2018lash mumkin" }), /* @__PURE__ */ React.createElement("div", { className: "pay-note" }, "Qolgan qarz: ", /* @__PURE__ */ React.createElement("b", null, money(Math.max(0, jami - (Number(String(tolangan).replace(/\s/g, "")) || 0))), " so\u2018m"), " \u2014 buyurtma tasdiqlanganda naqd yoki karta orqali to\u2018lanadi."), /* @__PURE__ */ React.createElement("label", null, "Qarz qaytarish sanasi (max 7 kun)"), /* @__PURE__ */ React.createElement("input", { type: "date", value: muddat, min: minDate(), max: maxDate(), onChange: (e) => setMuddat(e.target.value) }), /* @__PURE__ */ React.createElement("label", null, "Izoh (ixtiyoriy)"), /* @__PURE__ */ React.createElement("textarea", { rows: 2, value: izoh, onChange: (e) => setIzoh(e.target.value), placeholder: "Masalan: manzilingiz" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost", onClick: () => {
    const ask = window.bdConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
    ask("Savatni tozalashni xohlaysizmi?").then((ok) => {
      if (ok) {
        setCart([]);
        saveCart([]);
      }
    });
  } }, "Savatni tozalash")), /* @__PURE__ */ React.createElement("div", { className: "checkout-sticky" }, /* @__PURE__ */ React.createElement("div", { className: "checkout-sticky-inner" }, /* @__PURE__ */ React.createElement("div", { className: "sum" }, "Jami \xB7 ", jamiDona, " dona", /* @__PURE__ */ React.createElement("strong", null, money(jami), " so\u2018m")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", disabled: busy, onClick: submit }, busy ? "Yuborilmoqda..." : "Buyurtmani yuborish"))));
}
function Buyurtmalar({ orders, loading, onReload, orderSuccess, onClearSuccess, onGoCatalog, showMsg }) {
  if (orderSuccess) {
    return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "success-panel" }, /* @__PURE__ */ React.createElement("div", { className: "success-icon" }, "\u2713"), /* @__PURE__ */ React.createElement("h3", null, "Buyurtma qabul qilindi"), orderSuccess && orderSuccess.order_code && /* @__PURE__ */ React.createElement("div", { className: "success-code-row" }, /* @__PURE__ */ React.createElement("div", { className: "success-code" }, orderSuccess.order_code), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: () => {
      const c = orderSuccess.order_code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c).then(() => showMsg("Kod nusxalandi", false)).catch(() => showMsg(c, false));
      } else {
        showMsg(c, false);
      }
    } }, "Nusxa")), /* @__PURE__ */ React.createElement("p", null, "Tez orada siz bilan bog'lanamiz. Holatni shu yerda kuzatishingiz mumkin."), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => {
      onClearSuccess();
      onReload();
    } }, "Buyurtmalarni ko'rish"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-secondary", onClick: onGoCatalog }, "Katalogga qaytish"))));
  }
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement(Loading, { text: "Buyurtmalar yuklanmoqda..." }));
  if (!orders.length) {
    return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u{1F4CB}"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Hali buyurtma yo'q"), /* @__PURE__ */ React.createElement("div", { className: "empty-desc" }, "Birinchi buyurtmangizni bering \u2014 holatni shu yerda kuzatasiz."), /* @__PURE__ */ React.createElement("button", { className: "btn", style: { maxWidth: 240, margin: "0 auto" }, onClick: onGoCatalog }, "Katalogga o\u2018tish")));
  }
  const normalizeStatus = (raw) => {
    const low = String(raw || "").toLowerCase();
    if (low === "confirmed" || low === "paid" || low === "closed" || low.indexOf("tasdiq") >= 0) {
      return { badgeCls: "badge-ok", text: "Tasdiqlandi", canCancel: false };
    }
    if (low.indexOf("reject") >= 0 || low.indexOf("rad") >= 0 || low.indexOf("cancel") >= 0 || low === "bekor") {
      return { badgeCls: "badge-no", text: low.indexOf("cancel") >= 0 || low === "bekor" ? "Bekor qilindi" : "Rad etildi", canCancel: false };
    }
    return { badgeCls: "badge-wait", text: "Ko\u2018rib chiqilmoqda", canCancel: true };
  };
  const cancelOrder = async (orderId) => {
    const ask = window.bdConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
    if (!await ask("Buyurtmani bekor qilasizmi?")) return;
    try {
      await api("/api/customer/orders/" + orderId + "/cancel", { method: "POST", body: {} });
      showMsg("Buyurtma bekor qilindi", false);
      onReload();
    } catch (e) {
      showMsg(e.message, true);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, "Buyurtmalarim"), orders.map((b) => {
    const st = normalizeStatus(b.status);
    return /* @__PURE__ */ React.createElement("div", { className: "order-card", key: b.id }, /* @__PURE__ */ React.createElement("strong", null, b.order_code), /* @__PURE__ */ React.createElement("span", { className: "badge " + st.badgeCls }, st.text), Number(b.debt_amount) > 0 ? /* @__PURE__ */ React.createElement("span", { className: "badge badge-no", style: { marginLeft: 6 } }, "Qarz bor") : null, /* @__PURE__ */ React.createElement("div", { className: "meta" }, b.created_at ? new Date(b.created_at).toLocaleString("uz-UZ") : ""), (b.items || []).map((it, i) => /* @__PURE__ */ React.createElement("div", { className: "meta", key: i }, "\u2022 ", it.sku, " \xD7 ", it.qty)), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Jami: ", money(b.total_amount), " so\u2018m"), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Naqd (niyat): ", money(b.paid_amount), " so\u2018m \xB7 Qoldiq: ", money(b.debt_amount), " so\u2018m"), /* @__PURE__ */ React.createElement("div", { className: "meta", style: { fontSize: 12, color: "var(--text-muted)" } }, "Ko'rsatilgan summa buyurtma tasdiqlanganda naqd yoki karta orqali to'lanadi"), b.phone ? /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Tel: ", b.phone) : null, st.canCancel ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "btn btn-secondary",
        style: { marginTop: 10, background: "transparent", borderColor: "var(--danger-border)", color: "var(--danger)" },
        onClick: () => cancelOrder(b.id)
      },
      "Bekor qilish"
    ) : null);
  })));
}
function Aloqa({ user, settings }) {
  const phone = settings.customer_phone || "998880090506";
  const tgl = settings.customer_telegram || "https://t.me/briketkumir";
  const digits = String(phone).replace(/\D/g, "");
  return /* @__PURE__ */ React.createElement("div", { className: "container" }, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-title" }, "Aloqa"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 14, marginBottom: 12 } }, "Siz: ", /* @__PURE__ */ React.createElement("b", null, user.name || "Mijoz"), /* @__PURE__ */ React.createElement("br", null), user.phone || "\u2014"), /* @__PURE__ */ React.createElement("a", { className: "btn btn-block", href: "tel:+" + digits, style: { textDecoration: "none" } }, "Qo\u2018ng\u2018iroq qilish: +", digits), /* @__PURE__ */ React.createElement("a", { className: "btn btn-secondary btn-block", href: tgl, target: "_blank", rel: "noreferrer", style: { textDecoration: "none" } }, "Telegram")));
}
function Nav({ tab, setTab, cartCount, onOrders }) {
  const Icon = ({ d }) => /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" }, /* @__PURE__ */ React.createElement("path", { d, strokeLinecap: "round", strokeLinejoin: "round" }));
  return /* @__PURE__ */ React.createElement("nav", { className: "nav" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: tab === "catalog" ? "active" : "", onClick: () => setTab("catalog") }, /* @__PURE__ */ React.createElement("span", { className: "nav-icon-wrap" }, /* @__PURE__ */ React.createElement(Icon, { d: "M4 6h16M4 12h16M4 18h16" })), "Katalog"), /* @__PURE__ */ React.createElement("button", { type: "button", className: tab === "cart" ? "active" : "", onClick: () => setTab("cart") }, /* @__PURE__ */ React.createElement("span", { className: "nav-icon-wrap" }, /* @__PURE__ */ React.createElement(Icon, { d: "M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-1.5 6h13M10 19a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2z" }), cartCount > 0 && /* @__PURE__ */ React.createElement("span", { className: "nav-badge" }, cartCount)), "Savat"), /* @__PURE__ */ React.createElement("button", { type: "button", className: tab === "orders" ? "active" : "", onClick: () => {
    setTab("orders");
    onOrders();
  } }, /* @__PURE__ */ React.createElement("span", { className: "nav-icon-wrap" }, /* @__PURE__ */ React.createElement(Icon, { d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" })), "Buyurtmalar"), /* @__PURE__ */ React.createElement("button", { type: "button", className: tab === "aloqa" ? "active" : "", onClick: () => setTab("aloqa") }, /* @__PURE__ */ React.createElement("span", { className: "nav-icon-wrap" }, /* @__PURE__ */ React.createElement(Icon, { d: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" })), "Aloqa"));
}
function App() {
  const [tab, setTab] = useState("catalog");
  const [katalog, setKatalog] = useState([]);
  const [settings, setSettings] = useState({
    bulk_discount: "3000",
    bulk_min_qty: "500",
    customer_phone: "998880090506",
    customer_telegram: "https://t.me/briketkumir"
  });
  const [cart, setCart] = useState(() => loadCart());
  const [user, setUser] = useState({ name: "Mijoz", phone: "" });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [tipOpen, setTipOpen] = useState(localStorage.getItem(storageKey("bd_tip_closed")) !== "1");
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const msgTimer = useRef(null);
  useEffect(() => {
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const showMsg = useCallback((text, err) => {
    setMsg({ text, err: !!err });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), err ? 6e3 : 2500);
  }, []);
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const auth = await api("/api/customer/auth/telegram", { method: "POST", body: { initData: getInitData() } });
        setUser({ name: auth.data.name || "Mijoz", phone: auth.data.phone || "" });
        setCart(loadCart());
      } catch (e) {
      }
      const cat = await api("/api/customer/catalog");
      setKatalog(cat.data || []);
      try {
        const st = await api("/api/customer/settings");
        setSettings((s) => Object.assign({}, s, st.data || {}));
      } catch (e) {
      }
    } catch (e) {
      showMsg(e.message, true);
    }
    setLoading(false);
  }, [showMsg]);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
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
    showMsg("Savatga qo\u2018shildi", false);
  };
  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const r = await api("/api/customer/orders");
      setOrders(r.data || []);
    } catch (e) {
      showMsg(e.message, true);
    }
    setOrdersLoading(false);
  };
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, !online && /* @__PURE__ */ React.createElement("div", { className: "offline-banner" }, "Internet aloqasi yo'q \u2014 oxirgi ko'rilgan ma'lumotlar ko'rsatilmoqda", /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", style: { marginLeft: 8, padding: "4px 8px", width: "auto" }, onClick: loadCatalog }, "Qayta urinish")), tab === "catalog" && !detail && /* @__PURE__ */ React.createElement(
    Catalog,
    {
      katalog,
      settings,
      loading,
      onAdd: addToCart,
      onDetail: setDetail,
      onLightbox: (imgs, i) => setLightbox({ images: imgs, index: i }),
      tipOpen,
      setTipOpen,
      onRefresh: loadCatalog,
      showMsg
    }
  ), tab === "cart" && !detail && /* @__PURE__ */ React.createElement(
    Savat,
    {
      cart,
      katalog,
      settings,
      user,
      setCart,
      showMsg,
      onOrdered: (o) => {
        setOrderSuccess(o);
        setTab("orders");
      },
      onGoCatalog: () => setTab("catalog")
    }
  ), tab === "orders" && !detail && /* @__PURE__ */ React.createElement(
    Buyurtmalar,
    {
      orders,
      loading: ordersLoading,
      onReload: loadOrders,
      orderSuccess,
      onClearSuccess: () => setOrderSuccess(null),
      onGoCatalog: () => setTab("catalog"),
      showMsg
    }
  ), tab === "aloqa" && !detail && /* @__PURE__ */ React.createElement(Aloqa, { user, settings }), detail && /* @__PURE__ */ React.createElement(
    DetailPage,
    {
      p: detail,
      settings,
      onClose: () => setDetail(null),
      onAdd: addToCart,
      showMsg
    }
  ), lightbox && /* @__PURE__ */ React.createElement(Lightbox, { images: lightbox.images, index: lightbox.index, onClose: () => setLightbox(null) }), !detail && /* @__PURE__ */ React.createElement(Nav, { tab, setTab, cartCount, onOrders: loadOrders }), /* @__PURE__ */ React.createElement(Toast, { msg }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
