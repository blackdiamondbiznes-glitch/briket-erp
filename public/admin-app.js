const { useState, useEffect, useCallback, useRef } = React;
const DEFAULT_API = window.location.origin;
function money(n) {
  var v = Math.round(Number(n || 0));
  var body = Math.abs(v).toLocaleString("uz-UZ");
  return (v < 0 ? "\u2212" : "") + body;
}
function qtyText(n) {
  var v = Number(n) || 0;
  return (v < 0 ? "\u2212" : "") + String(Math.abs(v));
}
function stockLine(p) {
  const sale = Math.round(Number(p.sell_price != null ? p.sell_price : p.price) || 0);
  const qty = Number(p.balance_qty) || 0;
  const cost = Math.round(Number(p.unitCost != null ? p.unitCost : p.unit_cost != null ? p.unit_cost : p.cost_price) || 0);
  const prof = Math.round(sale - cost);
  return {
    sale,
    qty,
    cost,
    prof,
    cval: Math.round(qty * cost),
    pval: Math.round(qty * prof),
    sval: Math.round(qty * sale)
  };
}
function mijozNarx(optom, disc) {
  return Math.round((Number(optom) || 0) + (Number(disc) || 3e3));
}
function tashkentTime(d) {
  try {
    return new Intl.DateTimeFormat("uz-UZ", {
      timeZone: "Asia/Tashkent",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(d || /* @__PURE__ */ new Date());
  } catch (e) {
    return (d || /* @__PURE__ */ new Date()).toLocaleTimeString("uz-UZ");
  }
}
const STATUS_UZ = {
  pending: "Kutilmoqda",
  confirmed: "Tasdiqlangan",
  paid: "To'langan",
  partial: "Qisman",
  closed: "Yopilgan",
  cancelled: "Bekor",
  rejected: "Rad"
};
function statusLabel(s) {
  return STATUS_UZ[String(s || "").toLowerCase()] || s || "-";
}
function statusMark(s) {
  const k = String(s || "").toLowerCase();
  if (k === "confirmed" || k === "paid" || k === "active" || k === "success") return "\u2713";
  if (k === "closed") return "\u25A0";
  if (k === "pending" || k === "partial" || k === "warning") return "\u23F3";
  if (k === "rejected" || k === "cancelled" || k === "danger") return "\u2715";
  return "\u2022";
}
function StatusBadge(props) {
  const raw = String(props.status || "").toLowerCase();
  const cls = props.className || raw;
  return /* @__PURE__ */ React.createElement("span", { className: "badge " + cls }, /* @__PURE__ */ React.createElement("span", { className: "mark", "aria-hidden": "true" }, statusMark(raw)), props.children || statusLabel(raw));
}
function FieldErr(props) {
  if (!props.text) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "field-error" }, props.text);
}
function matchQ(q, parts) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  return parts.some(function(p) {
    return String(p == null ? "" : p).toLowerCase().indexOf(s) !== -1;
  });
}
function ymdTashkent(d) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(d));
  } catch (e) {
    return String(d).slice(0, 10);
  }
}
function inDateRange(val, from, to) {
  if (!from && !to) return true;
  const y = ymdTashkent(val);
  if (!y) return false;
  if (from && y < from) return false;
  if (to && y > to) return false;
  return true;
}
function downloadCsv(filename, rows, cols) {
  const esc = function(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [cols.map(function(c) {
    return esc(c.label);
  }).join(",")];
  rows.forEach(function(r) {
    lines.push(cols.map(function(c) {
      return esc(typeof c.get === "function" ? c.get(r) : r[c.key]);
    }).join(","));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function() {
    URL.revokeObjectURL(a.href);
  }, 1500);
}
function Ico(props) {
  const n = props.name;
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };
  if (n === "layout") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "3", width: "7", height: "9", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "3", width: "7", height: "5", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "12", width: "7", height: "9", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "16", width: "7", height: "5", rx: "1" }));
  if (n === "factory") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M3 21h18" }), /* @__PURE__ */ React.createElement("path", { d: "M5 21V10l4 3V10l4 3V7l4 3v11" }));
  if (n === "cart") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "20", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "17", cy: "20", r: "1" }), /* @__PURE__ */ React.createElement("path", { d: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7" }));
  if (n === "users") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "9.5", cy: "7", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }), /* @__PURE__ */ React.createElement("path", { d: "M16 3.13a3 3 0 0 1 0 5.74" }));
  if (n === "catalog") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M4 6h16" }), /* @__PURE__ */ React.createElement("path", { d: "M4 12h16" }), /* @__PURE__ */ React.createElement("path", { d: "M4 18h10" }));
  if (n === "box") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }), /* @__PURE__ */ React.createElement("path", { d: "M3.3 7L12 12l8.7-5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 22V12" }));
  if (n === "coin") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7v10M9.5 9.5c.6-.8 1.5-1.2 2.5-1.2 1.7 0 3 1 3 2.6 0 3.1-6 1.6-6 4.6 0 1.6 1.4 2.6 3.1 2.6 1.1 0 2-.5 2.6-1.3" }));
  if (n === "truck") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("path", { d: "M3 7h11v10H3z" }), /* @__PURE__ */ React.createElement("path", { d: "M14 10h4l3 3v4h-7z" }), /* @__PURE__ */ React.createElement("circle", { cx: "7", cy: "18", r: "2" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "18", r: "2" }));
  if (n === "search") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7" }), /* @__PURE__ */ React.createElement("path", { d: "M20 20l-3-3" }));
  if (n === "more") return /* @__PURE__ */ React.createElement("svg", { ...common }, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" }));
  return null;
}
function useFocusForm(pageFilter, key) {
  useEffect(function() {
    if (!pageFilter || pageFilter.focusForm !== key) return;
    var el = document.getElementById("form-" + key);
    if (!el) return;
    el.classList.add("form-focus");
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
    }
    var t = setTimeout(function() {
      el.classList.remove("form-focus");
    }, 2600);
    return function() {
      clearTimeout(t);
    };
  }, [pageFilter, key]);
}
function tashkentNowLabel() {
  try {
    return new Intl.DateTimeFormat("uz-UZ", {
      timeZone: "Asia/Tashkent",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(/* @__PURE__ */ new Date());
  } catch (e) {
    return (/* @__PURE__ */ new Date()).toLocaleString("uz-UZ");
  }
}
function EmptyState(props) {
  return /* @__PURE__ */ React.createElement("div", { className: "empty-state empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: props.icon || "box" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, props.title || "Ro'yxat bo'sh"), props.sub ? /* @__PURE__ */ React.createElement("div", null, props.sub) : null);
}
function PageHead(props) {
  return /* @__PURE__ */ React.createElement("div", { className: "page-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, props.title), props.sub ? /* @__PURE__ */ React.createElement("div", { className: "sub" }, props.sub) : null), /* @__PURE__ */ React.createElement("div", { className: "page-actions" }, props.children));
}
function formKeyDown(e, onEsc) {
  if (e.key === "Escape" && typeof onEsc === "function") {
    e.preventDefault();
    onEsc();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    const form = e.currentTarget;
    if (form && typeof form.requestSubmit === "function") form.requestSubmit();
  }
}
const SESSION_MS = 12 * 60 * 60 * 1e3;
const SESSION_LONG_MS = 7 * 24 * 60 * 60 * 1e3;
const SS = (function() {
  try {
    var s = window.sessionStorage;
    s.setItem("__bd", "1");
    s.removeItem("__bd");
    return s;
  } catch (e) {
    var mem = {};
    return {
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function(k, v) {
        mem[k] = String(v);
      },
      removeItem: function(k) {
        delete mem[k];
      }
    };
  }
})();
try {
  if (localStorage.getItem("erp_persist") !== "1") {
    localStorage.removeItem("erp_key");
    localStorage.removeItem("erp_key_at");
    localStorage.removeItem("erp_operator");
  }
} catch (e0) {
}
function useApi() {
  const [apiBase, setApiBase] = useState(function() {
    return localStorage.getItem("erp_api") || DEFAULT_API;
  });
  const [adminKey, setAdminKey] = useState(function() {
    const key = SS.getItem("erp_key") || "";
    const at = Number(SS.getItem("erp_key_at") || 0);
    if (key && at && Date.now() - at > SESSION_MS) {
      SS.removeItem("erp_key");
      SS.removeItem("erp_key_at");
      SS.removeItem("erp_operator");
      return "";
    }
    return key;
  });
  const [operatorName, setOperatorName] = useState(function() {
    return SS.getItem("erp_operator") || "Admin";
  });
  function saveSettings(base, key, operator, remember) {
    setApiBase(base);
    setAdminKey(key);
    const op = operator || "Admin";
    setOperatorName(op);
    try {
      localStorage.setItem("erp_api", base);
    } catch (e1) {
    }
    SS.setItem("erp_key", key);
    SS.setItem("erp_key_at", String(Date.now()));
    SS.setItem("erp_operator", op);
    try {
      if (remember) {
        localStorage.setItem("erp_persist", "1");
        localStorage.setItem("erp_key", key);
        localStorage.setItem("erp_key_at", String(Date.now()));
        localStorage.setItem("erp_operator", op);
      } else {
        localStorage.removeItem("erp_persist");
        localStorage.removeItem("erp_key");
        localStorage.removeItem("erp_key_at");
        localStorage.removeItem("erp_operator");
      }
    } catch (e2) {
    }
  }
  const api = useCallback(async function(path, opts) {
    opts = opts || {};
    const at = Number(SS.getItem("erp_key_at") || 0);
    if (adminKey && at && Date.now() - at > SESSION_MS) {
      setAdminKey("");
      SS.removeItem("erp_key");
      SS.removeItem("erp_key_at");
      const err = new Error("Sessiya muddati tugadi - qayta kiring");
      err.code = 401;
      throw err;
    }
    const headers = { "Content-Type": "application/json", ...opts.headers || {} };
    if (adminKey) headers["x-admin-key"] = adminKey;
    const op = operatorName || SS.getItem("erp_operator") || "";
    if (op) headers["x-operator-name"] = op;
    const res = await fetch(apiBase.replace(/\/$/, "") + path, { ...opts, headers });
    const data = await res.json().catch(function() {
      return {};
    });
    if (res.status === 401) {
      setAdminKey("");
      SS.removeItem("erp_key");
      SS.removeItem("erp_key_at");
      const err = new Error(data.error || "Unauthorized");
      err.code = 401;
      throw err;
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || res.statusText || "Xato");
    }
    return data;
  }, [apiBase, adminKey, operatorName]);
  function logout() {
    setAdminKey("");
    setOperatorName("Admin");
    SS.removeItem("erp_key");
    SS.removeItem("erp_key_at");
    SS.removeItem("erp_ui_role");
  }
  return {
    api,
    apiBase,
    adminKey,
    operatorName,
    saveSettings,
    logout
  };
}
function LoginScreen(props) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!key.trim()) {
      setErr("Parolni kiriting");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const base = (props.apiBase || window.location.origin).replace(/\/$/, "");
      const res = await fetch(base + "/api/dashboard", {
        headers: {
          "x-admin-key": key.trim(),
          "x-operator-name": "Admin"
        }
      });
      const data = await res.json().catch(function() {
        return {};
      });
      if (!res.ok) {
        setErr(data.error || "Parol noto'g'ri");
        setBusy(false);
        return;
      }
      props.onLogin(key.trim(), remember);
    } catch (ex) {
      setErr(ex.message || "Ulanish xatosi");
    }
    setBusy(false);
  }
  return /* @__PURE__ */ React.createElement("div", { className: "login-wrap" }, /* @__PURE__ */ React.createElement("form", { className: "login-card", onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("img", { src: "/bd_logo.jpg", alt: "Black Diamond", style: { width: 40, height: 40, borderRadius: 8, objectFit: "cover" } }), /* @__PURE__ */ React.createElement("h1", { style: { margin: 0 } }, "Black Diamond OPS")), /* @__PURE__ */ React.createElement("p", null, "Kirish uchun parolni yozing"), err ? /* @__PURE__ */ React.createElement("div", { className: "err" }, err) : null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-1" }, "Parol"), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", marginBottom: 14 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "f-1",
      type: showKey ? "text" : "password",
      value: key,
      onChange: function(e) {
        setKey(e.target.value);
      },
      placeholder: "Parol",
      autoComplete: "current-password",
      autoFocus: true,
      className: err ? "invalid" : "",
      style: { marginBottom: 0, paddingRight: 44 }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn-ghost btn-sm",
      onClick: function() {
        setShowKey(function(v) {
          return !v;
        });
      },
      style: { position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" },
      "aria-label": showKey ? "Yashirish" : "Ko'rsatish"
    },
    showKey ? "Yashir" : "Ko'r"
  )), /* @__PURE__ */ React.createElement("label", { className: "remember" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: remember, onChange: function(e) {
    setRemember(e.target.checked);
  } }), "Meni eslab qol (7 kun)"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Tekshirilmoqda..." : "Kirish")));
}
function ConfirmModal(props) {
  useEffect(function() {
    if (!props.open) return void 0;
    function onKey(e) {
      if (e.key === "Escape") props.onCancel();
    }
    if (props.money) {
      window.addEventListener("keydown", onKey);
      return function() {
        window.removeEventListener("keydown", onKey);
      };
    }
    var tg2 = window.Telegram && window.Telegram.WebApp;
    var platform2 = tg2 ? String(tg2.platform || "") : "";
    var inside2 = !!(tg2 && (tg2.initData || platform2 && platform2 !== "unknown"));
    if (!inside2 || typeof tg2.showConfirm !== "function") {
      window.addEventListener("keydown", onKey);
      return function() {
        window.removeEventListener("keydown", onKey);
      };
    }
    var settled = false;
    try {
      tg2.showConfirm(props.text || "", function(ok) {
        if (settled) return;
        settled = true;
        if (ok) props.onConfirm();
        else props.onCancel();
      });
    } catch (e) {
      window.addEventListener("keydown", onKey);
      return function() {
        window.removeEventListener("keydown", onKey);
      };
    }
    return function() {
      settled = true;
    };
  }, [props.open, props.money, props.text]);
  if (!props.open) return null;
  var tg = window.Telegram && window.Telegram.WebApp;
  var platform = tg ? String(tg.platform || "") : "";
  var inside = !!(tg && (tg.initData || platform && platform !== "unknown") && typeof tg.showConfirm === "function");
  if (!props.money && inside) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "bd-sheet-back", role: "presentation", onClick: props.onCancel }, /* @__PURE__ */ React.createElement("div", { className: "bd-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "confirm-sheet-title", onClick: function(e) {
    e.stopPropagation();
  } }, /* @__PURE__ */ React.createElement("h2", { id: "confirm-sheet-title" }, props.title || (props.money ? "Pul amali" : "Tasdiqlash")), /* @__PURE__ */ React.createElement("p", { className: "bd-sheet-text" }, props.text), props.detail ? /* @__PURE__ */ React.createElement("p", { className: "bd-sheet-detail" }, props.detail) : null, /* @__PURE__ */ React.createElement("div", { className: "bd-sheet-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost", type: "button", onClick: props.onCancel }, "Bekor"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: props.onConfirm }, "Tasdiqlash"))));
}
function useAutoMsg() {
  const [msg, setMsgRaw] = useState({});
  function setMsg(m) {
    setMsgRaw(m || {});
    if (m && m.text) {
      const ms = m.type === "err" ? 6e3 : 2500;
      setTimeout(function() {
        setMsgRaw(function(cur) {
          return cur && cur.text === m.text ? {} : cur;
        });
      }, ms);
    }
  }
  return [msg, setMsg];
}
function Msg(props) {
  if (!props.text) return null;
  const typ = props.type || "ok";
  const mark = typ === "err" ? "\u2715" : "\u2713";
  return /* @__PURE__ */ React.createElement("div", { className: "msg toast " + typ, role: "status" }, /* @__PURE__ */ React.createElement("span", { className: "mark", "aria-hidden": "true" }, mark), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, props.text), /* @__PURE__ */ React.createElement("button", { type: "button", className: "msg-x", "aria-label": "Yopish", onClick: props.onClose }, "\xD7"));
}
function Dashboard(props) {
  const api = props.api;
  const onNavigate = props.onNavigate;
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [period, setPeriod] = useState("today");
  const [dashMore, setDashMore] = useState({ sku: false, mat: false, batch: false, order: false });
  const DASH_LIMIT = 5;
  function dashSlice(arr, key) {
    if (!arr || !arr.length) return [];
    return dashMore[key] ? arr : arr.slice(0, DASH_LIMIT);
  }
  function DashMoreBtn(props2) {
    const arr = props2.arr || [];
    const k = props2.k;
    if (arr.length <= DASH_LIMIT) return null;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "btn-ghost btn-sm dash-more",
        onClick: function() {
          setDashMore(function(prev) {
            var next = Object.assign({}, prev);
            next[k] = !prev[k];
            return next;
          });
        }
      },
      dashMore[k] ? "Kamroq" : "Ko\u2018proq \xB7 " + (arr.length - DASH_LIMIT)
    );
  }
  function load() {
    api("/api/dashboard").then(function(r) {
      setData(r.data);
      setErr("");
      setLastUpdated(/* @__PURE__ */ new Date());
    }).catch(function(e) {
      setErr(e.message);
    });
  }
  useEffect(function() {
    load();
    const interval = setInterval(load, 6e4);
    return function() {
      clearInterval(interval);
    };
  }, [api]);
  function QuickActions() {
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Tez amallar"), /* @__PURE__ */ React.createElement("div", { className: "quick-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: function() {
      if (onNavigate) onNavigate("orders", { focusForm: "order" });
    } }, /* @__PURE__ */ React.createElement("span", { className: "qa-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "cart" })), /* @__PURE__ */ React.createElement("span", { className: "qa-title" }, "Sotuv"), /* @__PURE__ */ React.createElement("span", { className: "qa-sub" }, "Yangi buyurtma")), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: function() {
      if (onNavigate) onNavigate("payments", { focusForm: "payment" });
    } }, /* @__PURE__ */ React.createElement("span", { className: "qa-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "coin" })), /* @__PURE__ */ React.createElement("span", { className: "qa-title" }, "To'lov"), /* @__PURE__ */ React.createElement("span", { className: "qa-sub" }, "Naqd yoki karta")), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: function() {
      if (onNavigate) onNavigate("expenses", { focusForm: "expense" });
    } }, /* @__PURE__ */ React.createElement("span", { className: "qa-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "coin" })), /* @__PURE__ */ React.createElement("span", { className: "qa-title" }, "Xarajat"), /* @__PURE__ */ React.createElement("span", { className: "qa-sub" }, "Press, qadoq, boshqa")), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: function() {
      if (onNavigate) onNavigate("batches", { focusForm: "batch" });
    } }, /* @__PURE__ */ React.createElement("span", { className: "qa-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "factory" })), /* @__PURE__ */ React.createElement("span", { className: "qa-title" }, "Partiya"), /* @__PURE__ */ React.createElement("span", { className: "qa-sub" }, "Ishlab chiqarish"))));
  }
  if (err) return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Bugun", sub: "Kunlik ko'rsatkichlar" }), /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err), /* @__PURE__ */ React.createElement(QuickActions, null));
  if (!data) return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Bugun", sub: "Ma'lumot yuklanmoqda..." }), /* @__PURE__ */ React.createElement("div", { className: "dash-kpis cols-5" }, [1, 2, 3, 4, 5].map(function(i) {
    return /* @__PURE__ */ React.createElement("div", { key: i, className: "dash-kpi", style: { opacity: 0.4 } }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "\xA0"), /* @__PURE__ */ React.createElement("div", { className: "value" }, "..."));
  })));
  const alerts = data.alerts || [];
  const skuStock = data.sku_stock || [];
  const mats = data.material_stock || [];
  const batches = data.active_batches || [];
  const orders = data.recent_orders || [];
  const isMonth = period === "month";
  const savdo = Number(isMonth ? data.oylik_savdo : data.bugungi_savdo || 0);
  const xarajat = Number(isMonth ? data.oylik_xarajat : data.bugungi_xarajat || 0);
  const foyda = Number(isMonth ? data.oylik_foyda : data.bugungi_foyda || 0);
  const naqd = Number(isMonth ? data.oylik_naqd_tushum : data.bugungi_naqd_tushum || 0);
  const qadoqKg = Number(isMonth ? data.oylik_qadoq_kg : data.bugungi_qadoq_kg || 0);
  function shortCode(code) {
    if (!code) return "-";
    const s = String(code);
    if (s.length <= 14) return s;
    return s.slice(0, 6) + "-" + s.slice(-4);
  }
  const omborQiymat = skuStock.reduce(function(s, x) {
    return s + Number(x.value || 0);
  }, 0);
  const kunlar = data.kunlar || [];
  const topMahsulot = data.top_mahsulot || [];
  const stockBars = skuStock.slice().sort(function(a, b) {
    return Math.abs(Number(b.balance_qty) || 0) - Math.abs(Number(a.balance_qty) || 0);
  }).slice(0, 6);
  function deltaPct(cur, prev) {
    if (prev === void 0 || prev === null || cur === void 0 || cur === null) return null;
    var c = Number(cur) || 0;
    var p = Number(prev) || 0;
    if (p === 0 && c === 0) return { dir: "flat", label: "0%" };
    if (p === 0) return { dir: c > 0 ? "up" : "down", label: "yangi" };
    var pct = (c - p) / Math.abs(p) * 100;
    var dir = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
    var sign = pct > 0 ? "+" : pct < 0 ? "\u2212" : "";
    return { dir, label: sign + Math.abs(Math.round(pct)) + "%" };
  }
  function Delta(props2) {
    var d = props2.delta;
    if (!d) return null;
    var cls = "kpi-delta " + d.dir;
    if (props2.invert && d.dir === "up") cls += " bad-up";
    if (props2.invert && d.dir === "down") cls += " good-down";
    var arrow = d.dir === "up" ? "\u2191" : d.dir === "down" ? "\u2193" : "\xB7";
    return /* @__PURE__ */ React.createElement("div", { className: cls }, arrow, " ", d.label, " ", /* @__PURE__ */ React.createElement("span", { className: "kpi-delta-vs" }, props2.vs));
  }
  function grouped(n) {
    var v = Math.round(Number(n || 0));
    var body = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (v < 0 ? "\u2212" : "") + body;
  }
  function Amount(props2) {
    return /* @__PURE__ */ React.createElement("div", { className: "value" }, /* @__PURE__ */ React.createElement("span", { className: props2.neg ? "neg" : "" }, grouped(props2.n)), /* @__PURE__ */ React.createElement("span", { className: "kpi-unit" }, "so'm"));
  }
  const vsLabel = isMonth ? "o'tgan oyga" : "kechaga";
  const prevSavdo = isMonth ? data.oldingi_oy_savdo : data.kecha_savdo;
  const prevXarajat = isMonth ? data.oldingi_oy_xarajat : data.kecha_xarajat;
  const prevFoyda = isMonth ? data.oldingi_oy_foyda : data.kecha_foyda;
  const prevNaqd = isMonth ? data.oldingi_oy_naqd : data.kecha_naqd;
  function DualBars() {
    var rows = kunlar;
    var max = 1;
    rows.forEach(function(r) {
      max = Math.max(max, Math.abs(Number(r.savdo) || 0), Math.abs(Number(r.foyda) || 0));
    });
    var w = 640;
    var h = 168;
    var pad = 8;
    var n = Math.max(rows.length, 1);
    var gap = 10;
    var bw = (w - pad * 2 - gap * (n - 1)) / n;
    return /* @__PURE__ */ React.createElement("svg", { className: "chart-svg", viewBox: "0 0 " + w + " " + h, role: "img", "aria-label": "7 kunlik savdo va foyda" }, rows.map(function(r, i) {
      var x = pad + i * (bw + gap);
      var sh = Math.max(2, Math.abs(Number(r.savdo) || 0) / max * (h - 28));
      var fh = Math.abs(Number(r.foyda) || 0) / max * (h - 28);
      var base = h - 20;
      var day = String(r.sana || "").slice(8);
      return /* @__PURE__ */ React.createElement("g", { key: r.sana || i }, /* @__PURE__ */ React.createElement("rect", { x, y: base - sh, width: Math.max(4, bw * 0.42), height: sh, rx: "3", fill: "var(--accent-fill)" }, /* @__PURE__ */ React.createElement("title", null, "Savdo " + grouped(r.savdo) + " so'm")), /* @__PURE__ */ React.createElement("rect", { x: x + bw * 0.5, y: base - Math.max(fh, Number(r.foyda) ? 2 : 0), width: Math.max(4, bw * 0.42), height: Math.max(fh, 0), rx: "3", fill: Number(r.foyda) < 0 ? "var(--danger)" : "var(--success)" }, /* @__PURE__ */ React.createElement("title", null, "Foyda " + grouped(r.foyda) + " so'm")), /* @__PURE__ */ React.createElement("text", { x: x + bw / 2, y: h - 4, textAnchor: "middle", fontSize: "12", fill: "var(--hint)" }, day));
    }));
  }
  function HBars(props2) {
    var rows = props2.rows || [];
    if (!rows.length) return /* @__PURE__ */ React.createElement("div", { className: "empty" }, "Ma'lumot yo'q");
    var max = 1;
    rows.forEach(function(r) {
      max = Math.max(max, Math.abs(Number(r.value) || 0));
    });
    return /* @__PURE__ */ React.createElement("div", null, rows.map(function(r) {
      var pct = Math.max(4, Math.abs(Number(r.value) || 0) / max * 100);
      return /* @__PURE__ */ React.createElement("div", { className: "hbar", key: r.name }, /* @__PURE__ */ React.createElement("div", { className: "hbar-name", title: r.name }, r.name), /* @__PURE__ */ React.createElement("div", { className: "hbar-track" }, /* @__PURE__ */ React.createElement("div", { className: "hbar-fill", style: { width: pct + "%" } })), /* @__PURE__ */ React.createElement("div", { className: "hbar-val" }, r.caption));
    }));
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    PageHead,
    {
      title: "Bugun",
      sub: (data.business_date || "") + " \xB7 Toshkent vaqti \xB7 ombor " + money(omborQiymat) + " so'm"
    },
    /* @__PURE__ */ React.createElement("span", { className: "tz-chip" }, tashkentNowLabel()),
    /* @__PURE__ */ React.createElement("div", { className: "period-toggle" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: !isMonth ? "on" : "", onClick: function() {
      setPeriod("today");
    } }, "Bugun"), /* @__PURE__ */ React.createElement("button", { type: "button", className: isMonth ? "on" : "", onClick: function() {
      setPeriod("month");
    } }, "Shu oy")),
    /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-sm", type: "button", onClick: load, title: "Yangilash" }, "\u21BB")
  ), /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Diqqat / ogohlantirish"), /* @__PURE__ */ React.createElement("div", { className: "dash-alerts-sticky" }, alerts.length > 0 ? /* @__PURE__ */ React.createElement("div", null, alerts.map(function(a, i) {
    return /* @__PURE__ */ React.createElement("div", { key: i, className: "dash-alert " + (a.type === "danger" ? "danger" : "warn") }, a.text);
  })) : /* @__PURE__ */ React.createElement("div", { className: "dash-alert", style: { background: "var(--success-bg)", color: "var(--success)" } }, "Ogohlantirish yo'q \u2014 zaxira va qarz normal.")), /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Asosiy ko'rsatkichlar"), /* @__PURE__ */ React.createElement("div", { className: "dash-kpis cols-5" }, /* @__PURE__ */ React.createElement("div", { className: "dash-kpi kpi-hero" }, /* @__PURE__ */ React.createElement("div", { className: "kpi-top" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "coin" })), /* @__PURE__ */ React.createElement("div", { className: "label" }, isMonth ? "Oylik foyda" : "Bugungi foyda")), /* @__PURE__ */ React.createElement(Amount, { n: foyda, neg: foyda < 0 }), /* @__PURE__ */ React.createElement(Delta, { delta: deltaPct(foyda, prevFoyda), vs: vsLabel }), /* @__PURE__ */ React.createElement("div", { className: "trend" }, "savdo \u2212 xarajat")), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi kpi-click", role: "button", tabIndex: "0", onClick: function() {
    if (onNavigate) onNavigate("orders");
  } }, /* @__PURE__ */ React.createElement("div", { className: "kpi-top" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "cart" })), /* @__PURE__ */ React.createElement("div", { className: "label" }, "Savdo")), /* @__PURE__ */ React.createElement(Amount, { n: savdo }), /* @__PURE__ */ React.createElement(Delta, { delta: deltaPct(savdo, prevSavdo), vs: vsLabel })), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi kpi-click", role: "button", tabIndex: "0", onClick: function() {
    if (onNavigate) onNavigate("payments");
  } }, /* @__PURE__ */ React.createElement("div", { className: "kpi-top" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "coin" })), /* @__PURE__ */ React.createElement("div", { className: "label" }, "Naqd tushum")), /* @__PURE__ */ React.createElement(Amount, { n: naqd }), /* @__PURE__ */ React.createElement(Delta, { delta: deltaPct(naqd, prevNaqd), vs: vsLabel })), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi kpi-click", role: "button", tabIndex: "0", onClick: function() {
    if (onNavigate) onNavigate("expenses");
  } }, /* @__PURE__ */ React.createElement("div", { className: "kpi-top" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "box" })), /* @__PURE__ */ React.createElement("div", { className: "label" }, "Xarajat")), /* @__PURE__ */ React.createElement(Amount, { n: xarajat }), /* @__PURE__ */ React.createElement(Delta, { delta: deltaPct(xarajat, prevXarajat), vs: vsLabel, invert: true })), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi kpi-click" + (Number(data.jami_qarz) > 3e6 ? " dash-kpi-danger" : ""), role: "button", tabIndex: "0", onClick: function() {
    if (onNavigate) onNavigate("people-debt");
  } }, /* @__PURE__ */ React.createElement("div", { className: "kpi-top" }, /* @__PURE__ */ React.createElement("span", { className: "kpi-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "users" })), /* @__PURE__ */ React.createElement("div", { className: "label" }, "Qarz")), /* @__PURE__ */ React.createElement(Amount, { n: data.jami_qarz, neg: Number(data.jami_qarz) > 3e6 }), /* @__PURE__ */ React.createElement("div", { className: "trend" }, "joriy balans"))), /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Grafiklar"), /* @__PURE__ */ React.createElement("div", { className: "dash-charts" }, /* @__PURE__ */ React.createElement("div", { className: "chart-card wide" }, /* @__PURE__ */ React.createElement("h2", null, "7 kun \u2014 savdo va foyda"), /* @__PURE__ */ React.createElement("div", { className: "chart-legend" }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "chart-swatch", style: { background: "var(--accent-fill)" } }), " Savdo"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "chart-swatch", style: { background: "var(--success)" } }), " Foyda"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "chart-swatch", style: { background: "var(--danger)" } }), " Zarar")), kunlar.length ? /* @__PURE__ */ React.createElement(DualBars, null) : /* @__PURE__ */ React.createElement("div", { className: "empty" }, "Ma'lumot yo'q")), /* @__PURE__ */ React.createElement("div", { className: "chart-card" }, /* @__PURE__ */ React.createElement("h2", null, "Top 5 mahsulot"), /* @__PURE__ */ React.createElement("div", { className: "trend" }, "so'nggi 7 kun, summa"), /* @__PURE__ */ React.createElement(HBars, { rows: topMahsulot.map(function(p) {
    return { name: p.name, value: p.summa, caption: grouped(p.summa) };
  }) })), /* @__PURE__ */ React.createElement("div", { className: "chart-card" }, /* @__PURE__ */ React.createElement("h2", null, "Ombor qoldig'i"), /* @__PURE__ */ React.createElement("div", { className: "trend" }, "tayyor mahsulot, dona"), /* @__PURE__ */ React.createElement(HBars, { rows: stockBars.map(function(s) {
    return { name: s.sku, value: s.balance_qty, caption: qtyText(s.balance_qty) };
  }) }))), /* @__PURE__ */ React.createElement(QuickActions, null), /* @__PURE__ */ React.createElement("div", { className: "dash-meta" }, /* @__PURE__ */ React.createElement("span", null, "Qadoqlangan: ", /* @__PURE__ */ React.createElement("strong", null, qadoqKg.toFixed(1), " kg")), /* @__PURE__ */ React.createElement("span", null, "Partiya: ", /* @__PURE__ */ React.createElement("strong", null, data.faol_partiya)), /* @__PURE__ */ React.createElement("span", null, "Quruq: ", /* @__PURE__ */ React.createElement("strong", null, Number(data.quruq_qoldiq_kg || 0).toFixed(1), " kg")), /* @__PURE__ */ React.createElement("span", null, "Mahsulot: ", /* @__PURE__ */ React.createElement("strong", null, data.faol_sku)), lastUpdated ? /* @__PURE__ */ React.createElement("span", null, "Yangilangan: ", /* @__PURE__ */ React.createElement("strong", null, tashkentTime(lastUpdated))) : null), /* @__PURE__ */ React.createElement("details", { className: "dash-details" }, /* @__PURE__ */ React.createElement("summary", null, "Batafsil ko'rsatkichlar"), /* @__PURE__ */ React.createElement("div", { className: "dash-grid" }, /* @__PURE__ */ React.createElement("div", { className: "card tight" }, /* @__PURE__ */ React.createElement("h2", null, "Tayyor mahsulot (zavod)"), skuStock.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "box" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Tayyor mahsulot yo'q"), "Avval qadoqlash qiling \u2014 Ishlab chiqarish bo'limida") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap dash-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Qadoqlangan"), /* @__PURE__ */ React.createElement("th", null, "Sotuv"), /* @__PURE__ */ React.createElement("th", null, "Diler"), /* @__PURE__ */ React.createElement("th", null, "Yo'lda"), /* @__PURE__ */ React.createElement("th", null, "Qoldiq"), /* @__PURE__ */ React.createElement("th", null, "Qiymat"))), /* @__PURE__ */ React.createElement("tbody", null, dashSlice(skuStock, "sku").map(function(s) {
    const bal = Number(s.balance_qty);
    return /* @__PURE__ */ React.createElement("tr", { key: s.id, className: bal <= 0 ? "row-zero" : "" }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, s.sku), /* @__PURE__ */ React.createElement("td", { "data-label": "Qadoqlangan" }, Number(s.packed_qty)), /* @__PURE__ */ React.createElement("td", { "data-label": "Sotuv" }, Number(s.sold_qty)), /* @__PURE__ */ React.createElement("td", { "data-label": "Diler" }, Number(s.shipped_qty || 0)), /* @__PURE__ */ React.createElement("td", { "data-label": "Yo'lda" }, Number(s.yolda_qty || 0)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq", className: bal <= 0 ? "neg" : "" }, /* @__PURE__ */ React.createElement("strong", null, qtyText(bal))), /* @__PURE__ */ React.createElement("td", { "data-label": "Qiymat" }, money(s.value)));
  }))), /* @__PURE__ */ React.createElement(DashMoreBtn, { arr: skuStock, k: "sku" }))), /* @__PURE__ */ React.createElement("div", { className: "card tight" }, /* @__PURE__ */ React.createElement("h2", null, "Material"), mats.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "catalog" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Xomashyo yo'q"), "Sozlamalar \u2192 Xomashyo va retseptlar") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap dash-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Nomi"), /* @__PURE__ */ React.createElement("th", null, "Birlik"), /* @__PURE__ */ React.createElement("th", null, "Qoldiq"), /* @__PURE__ */ React.createElement("th", null, "Qiymat"))), /* @__PURE__ */ React.createElement("tbody", null, dashSlice(mats, "mat").map(function(m) {
    const bal = Number(m.balance);
    return /* @__PURE__ */ React.createElement("tr", { key: m.id, className: bal <= 0 ? "row-zero" : "" }, /* @__PURE__ */ React.createElement("td", { "data-label": "Nomi" }, m.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Birlik" }, m.unit), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq", className: bal < 0 ? "neg" : "" }, /* @__PURE__ */ React.createElement("strong", null, qtyText(bal))), /* @__PURE__ */ React.createElement("td", { "data-label": "Qiymat" }, money(m.value)));
  }))), /* @__PURE__ */ React.createElement(DashMoreBtn, { arr: mats, k: "mat" })))), /* @__PURE__ */ React.createElement("div", { className: "split-2" }, /* @__PURE__ */ React.createElement("div", { className: "card tight" }, /* @__PURE__ */ React.createElement("h2", null, "Faol partiyalar"), batches.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "factory" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Faol partiya yo'q"), "Ishlab chiqarish \u2192 Partiyalar") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap dash-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Quruq"), /* @__PURE__ */ React.createElement("th", null, "Qadoqlangan"), /* @__PURE__ */ React.createElement("th", null, "Qoldiq"))), /* @__PURE__ */ React.createElement("tbody", null, dashSlice(batches, "batch").map(function(b) {
    const rem = Number(b.remaining_kg);
    const dry = Number(b.dry_kg) || 1;
    return /* @__PURE__ */ React.createElement("tr", { key: b.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, b.batch_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Quruq" }, Number(b.dry_kg).toFixed(1)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qadoqlangan" }, Number(b.packed_kg).toFixed(1)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq" }, rem.toFixed(1), /* @__PURE__ */ React.createElement("div", { className: "bar-track" }, /* @__PURE__ */ React.createElement("div", { className: "bar-fill", style: { width: Math.min(100, rem / dry * 100) + "%" } }))));
  }))), /* @__PURE__ */ React.createElement(DashMoreBtn, { arr: batches, k: "batch" }))), /* @__PURE__ */ React.createElement("div", { className: "card tight" }, /* @__PURE__ */ React.createElement("h2", null, "So'nggi buyurtmalar"), orders.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "cart" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Buyurtma yo'q"), "Sotuv bo'limidan yoki mijoz ilovasidan keladi") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap dash-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Holat"))), /* @__PURE__ */ React.createElement("tbody", null, dashSlice(orders, "order").map(function(o) {
    return /* @__PURE__ */ React.createElement("tr", { key: o.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod", title: o.order_code }, shortCode(o.order_code)), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, o.customer_name || "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(o.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: o.status })));
  }))), /* @__PURE__ */ React.createElement(DashMoreBtn, { arr: orders, k: "order" }))), /* @__PURE__ */ React.createElement("div", { className: "card tight" }, /* @__PURE__ */ React.createElement("h2", null, "Yuk tarqatish"), (data.recent_field_sales || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-ico" }, /* @__PURE__ */ React.createElement(Ico, { name: "box" })), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Yuk xati yo'q"), "Sotuv \u2192 Yuk tarqatish dan yoziladi. Buyurtmalar ro'yxatiga tushmaydi.") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap dash-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Qarz"))), /* @__PURE__ */ React.createElement("tbody", null, dashSlice(data.recent_field_sales, "field").map(function(w) {
    return /* @__PURE__ */ React.createElement("tr", { key: w.id, onClick: function() {
      if (onNavigate) onNavigate("yukxati");
    }, style: { cursor: "pointer" } }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, w.waybill_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, w.customer_name || "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(w.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(w.debt_amount)));
  }))))))));
}
function Stock(props) {
  const api = props.api;
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(function() {
    setLoading(true);
    Promise.all([api("/api/stock/materials"), api("/api/stock/products")]).then(function(arr) {
      setMaterials(arr[0].data || []);
      setProducts(arr[1].data || []);
    }).catch(function(e) {
      setErr(e.message);
    }).finally(function() {
      setLoading(false);
    });
  }, [api]);
  if (err) return /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Yuklanmoqda...");
  const part = props.part || "all";
  const showMat = part === "all" || part === "materials";
  const showProd = part === "all" || part === "products";
  const headTitle = part === "products" ? "Tayyor mahsulot qoldig'i" : part === "materials" ? "Xomashyo qoldig'i" : "Ombor";
  const headSub = part === "products" ? "Qadoqlangan va sotilmagan dona. Narx va foyda shu yerda." : part === "materials" ? "Xomashyo qancha qolgani. Kirim shu bo'limning pastida." : "Tayyor mahsulot va xomashyo qoldig'i.";
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: headTitle, sub: headSub }), showMat ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Xomashyo qoldig'i"), materials.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Xomashyo qoldig'i yo'q"), "Sozlamalar \u2192 Xomashyo va retseptlar dan qo'shing") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Nomi"), /* @__PURE__ */ React.createElement("th", null, "Birlik"), /* @__PURE__ */ React.createElement("th", null, "Kirim"), /* @__PURE__ */ React.createElement("th", null, "Chiqim"), /* @__PURE__ */ React.createElement("th", null, "Qoldiq"))), /* @__PURE__ */ React.createElement("tbody", null, materials.map(function(m) {
    return /* @__PURE__ */ React.createElement("tr", { key: m.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Nomi" }, m.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Birlik" }, m.unit), /* @__PURE__ */ React.createElement("td", { "data-label": "Kirim" }, Number(m.total_in)), /* @__PURE__ */ React.createElement("td", { "data-label": "Chiqim" }, Number(m.total_out)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq" }, /* @__PURE__ */ React.createElement("strong", null, Number(m.balance))));
  }))))) : null, showProd ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Tayyor mahsulot qoldig'i"), products.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "box", title: "Mahsulot qoldiq yo'q", sub: "Avval qadoqlash qiling" }) : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Qoldiq"), /* @__PURE__ */ React.createElement("th", null, "Yo'lda"), /* @__PURE__ */ React.createElement("th", null, "Tannarx"), /* @__PURE__ */ React.createElement("th", null, "Sotish"), /* @__PURE__ */ React.createElement("th", null, "Foyda/dona"), /* @__PURE__ */ React.createElement("th", null, "Ombor tannarx"), /* @__PURE__ */ React.createElement("th", null, "Ombor savdo"), /* @__PURE__ */ React.createElement("th", null, "Kutilgan foyda"))), /* @__PURE__ */ React.createElement("tbody", null, products.map(function(p) {
    const line = stockLine(p);
    const cost = line.cost;
    const prof = line.prof;
    const cval = line.cval;
    const pval = line.pval;
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, p.sku, p.cost_override ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.7rem" } }, "qo'lda") : null), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq", className: Number(p.balance_qty) < 0 ? "neg" : "" }, /* @__PURE__ */ React.createElement("strong", null, qtyText(p.balance_qty))), /* @__PURE__ */ React.createElement("td", { "data-label": "Yo'lda" }, Number(p.yolda_qty || 0)), /* @__PURE__ */ React.createElement("td", { "data-label": "Tannarx" }, money(cost)), /* @__PURE__ */ React.createElement("td", { "data-label": "Sotish" }, money(line.sale)), /* @__PURE__ */ React.createElement("td", { "data-label": "Foyda/dona" }, money(prof)), /* @__PURE__ */ React.createElement("td", { "data-label": "Ombor tannarx" }, money(cval)), /* @__PURE__ */ React.createElement("td", { "data-label": "Ombor savdo" }, money(line.sval)), /* @__PURE__ */ React.createElement("td", { "data-label": "Kutilgan foyda", className: Number(pval) < 0 ? "neg" : "" }, money(pval)));
  })), /* @__PURE__ */ React.createElement("tfoot", null, /* @__PURE__ */ React.createElement("tr", { className: "row-total" }, /* @__PURE__ */ React.createElement("td", { "data-label": "Jami" }, "Jami"), /* @__PURE__ */ React.createElement("td", { "data-label": "Qoldiq" }, /* @__PURE__ */ React.createElement("strong", null, products.reduce(function(a, p) {
    return a + Number(p.balance_qty || 0);
  }, 0))), /* @__PURE__ */ React.createElement("td", { "data-label": "Yo'lda" }, /* @__PURE__ */ React.createElement("strong", null, products.reduce(function(a, p) {
    return a + Number(p.yolda_qty || 0);
  }, 0))), /* @__PURE__ */ React.createElement("td", { className: "desk-only", colSpan: "3" }), /* @__PURE__ */ React.createElement("td", { "data-label": "Ombor tannarx" }, /* @__PURE__ */ React.createElement("strong", null, money(products.reduce(function(a, p) {
    return a + stockLine(p).cval;
  }, 0)))), /* @__PURE__ */ React.createElement("td", { "data-label": "Ombor savdo" }, /* @__PURE__ */ React.createElement("strong", null, money(products.reduce(function(a, p) {
    return a + stockLine(p).sval;
  }, 0)))), /* @__PURE__ */ React.createElement("td", { "data-label": "Kutilgan foyda" }, /* @__PURE__ */ React.createElement("strong", null, money(products.reduce(function(a, p) {
    return a + stockLine(p).pval;
  }, 0))))))))) : null);
}
function Products(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const emptyForm = { sku: "", weight_kg: "", price: "", cost_price: "", description: "", img1: "", img2: "", img3: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ sku: "", weight_kg: "", price: "", cost_price: "", description: "", is_active: true, img1: "", img2: "", img3: "" });
  const [materials, setMaterials] = useState([]);
  const [recipeRows, setRecipeRows] = useState([]);
  const [q, setQ] = useState("");
  const [ferr, setFerr] = useState({});
  const [inlineId, setInlineId] = useState(null);
  const [inlineVal, setInlineVal] = useState("");
  function urlsFrom(f) {
    return [f.img1, f.img2, f.img3].map(function(s) {
      return String(s || "").trim();
    }).filter(Boolean);
  }
  function urlsTo(arr) {
    const a = Array.isArray(arr) ? arr : [];
    return { img1: a[0] || "", img2: a[1] || "", img3: a[2] || "" };
  }
  const [msg, setMsg] = useAutoMsg();
  const load = useCallback(function() {
    Promise.all([api("/api/products?active=0"), api("/api/materials?active=0")]).then(function(arr) {
      setList(arr[0].data || []);
      setMaterials(arr[1].data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!String(form.sku || "").trim()) next.sku = "Mahsulot kodi majburiy";
    if (form.price !== "" && Number(form.price) < 0) next.price = "Narx manfiy bo'lmasin";
    setFerr(next);
    if (next.sku || next.price) return;
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          sku: form.sku,
          weight_kg: Number(form.weight_kg) || 0,
          price: Math.round(Number(form.price) || 0),
          cost_price: Math.round(Number(form.cost_price) || 0),
          description: form.description || null,
          image_urls: urlsFrom(form)
        })
      });
      setMsg({ text: "Mahsulot qo'shildi", type: "ok" });
      setForm(emptyForm);
      setFerr({});
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function startEdit(p) {
    setEditId(p.id);
    const imgs = urlsTo(p.image_urls);
    setEditForm({
      sku: p.sku || "",
      weight_kg: String(p.weight_kg != null ? p.weight_kg : ""),
      price: String(p.price != null ? p.price : ""),
      cost_price: String(Math.round(Number(p.cost_price) || 0)),
      description: p.description || "",
      is_active: p.is_active !== false,
      img1: imgs.img1,
      img2: imgs.img2,
      img3: imgs.img3
    });
    setRecipeRows([]);
    api("/api/products/" + p.id + "/recipes").then(function(r) {
      setRecipeRows((r.data || []).map(function(x) {
        return {
          material_id: String(x.material_id),
          qty: String(x.qty != null ? x.qty : ""),
          line_amount: String(x.line_amount != null ? Math.round(Number(x.line_amount)) : "")
        };
      }));
    }).catch(function() {
      setRecipeRows([]);
    });
  }
  function cancelEdit() {
    setEditId(null);
    setRecipeRows([]);
  }
  function matPrice(id) {
    const m = materials.filter(function(x) {
      return String(x.id) === String(id);
    })[0];
    return m ? Number(m.price || 0) : 0;
  }
  function rowAmount(row) {
    if (row.line_amount !== "" && row.line_amount != null) return Math.round(Number(row.line_amount) || 0);
    return Math.round((Number(row.qty) || 0) * matPrice(row.material_id));
  }
  function recipeTotal() {
    return recipeRows.reduce(function(s, row) {
      return s + rowAmount(row);
    }, 0);
  }
  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api("/api/products/" + editId, {
        method: "PUT",
        body: JSON.stringify({
          sku: editForm.sku,
          weight_kg: Number(editForm.weight_kg) || 0,
          price: Math.round(Number(editForm.price) || 0),
          cost_price: Math.round(Number(editForm.cost_price) || 0),
          description: editForm.description || null,
          is_active: !!editForm.is_active,
          image_urls: urlsFrom(editForm)
        })
      });
      await api("/api/products/" + editId + "/recipes", {
        method: "PUT",
        body: JSON.stringify({
          lines: recipeRows.filter(function(x) {
            return x.material_id;
          }).map(function(x) {
            return {
              material_id: Number(x.material_id),
              qty: Number(x.qty) || 0,
              line_amount: x.line_amount === "" ? null : Math.round(Number(x.line_amount) || 0)
            };
          })
        })
      });
      setMsg({ text: "Mahsulot va narx saqlandi", type: "ok" });
      setEditId(null);
      setRecipeRows([]);
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  async function saveInlinePrice(p) {
    const next = Math.round(Number(inlineVal));
    setInlineId(null);
    if (!Number.isFinite(next) || next < 0) {
      setMsg({ text: "Narx noto'g'ri", type: "err" });
      return;
    }
    if (next === Math.round(Number(p.price || 0))) return;
    try {
      await api("/api/products/" + p.id, {
        method: "PUT",
        body: JSON.stringify({
          sku: p.sku,
          weight_kg: Number(p.weight_kg) || 0,
          price: next,
          cost_price: Math.round(Number(p.cost_price) || 0),
          description: p.description || null,
          is_active: p.is_active !== false,
          image_urls: Array.isArray(p.image_urls) ? p.image_urls : []
        })
      });
      setMsg({ text: "Narx saqlandi", type: "ok" });
      load();
    } catch (e) {
      setMsg({ text: e.message, type: "err" });
    }
  }
  async function softDelete(id) {
    setConfirmState({
      open: true,
      text: "Mahsulotni nofaol qilish?",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          await api("/api/products/" + id, { method: "DELETE" });
          setMsg({ text: "Mahsulot nofaol qilindi", type: "ok" });
          load();
        } catch (e) {
          setMsg({ text: e.message, type: "err" });
        }
      }
    });
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(PageHead, { title: "Mahsulotlar va narxlar", sub: "Bazadagi narx = optom. Kichik xaridga qo'shimcha chegirma Sozlamada." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Yangi mahsulot"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-2" }, "Mahsulot kodi *"), /* @__PURE__ */ React.createElement("input", { id: "f-2", value: form.sku, onChange: function(e) {
    setForm({ ...form, sku: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.sku })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-3" }, "Ogirlik (kg)"), /* @__PURE__ */ React.createElement("input", { id: "f-3", type: "number", step: "0.1", value: form.weight_kg, onChange: function(e) {
    setForm({ ...form, weight_kg: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-4" }, "Optom narx (so'm)"), /* @__PURE__ */ React.createElement("input", { id: "f-4", type: "number", min: "0", step: "1", value: form.price, onChange: function(e) {
    setForm({ ...form, price: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.price }), form.price ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "Mijoz: ", money(mijozNarx(form.price)), " so'm") : null), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-cost" }, "Tannarx qo'lda (0 = avto)"), /* @__PURE__ */ React.createElement("input", { id: "f-cost", type: "number", min: "0", step: "1", value: form.cost_price, onChange: function(e) {
    setForm({ ...form, cost_price: e.target.value });
  } }), form.price && Number(form.cost_price) > 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "Foyda: ", money(Math.round(Number(form.price) - Number(form.cost_price))), " so'm") : /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "0 = avto tannarx. Foyda = sotish \u2212 tannarx."))), /* @__PURE__ */ React.createElement("details", { className: "dash-details" }, /* @__PURE__ */ React.createElement("summary", null, "Qo'shimcha"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-5" }, "Batafsil (mijozga)"), /* @__PURE__ */ React.createElement("textarea", { id: "f-5", rows: 4, placeholder: "Mahsulot haqida matn \u2014 mijoz Batafsilida chiqadi", value: form.description, onChange: function(e) {
    setForm({ ...form, description: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-img1" }, "Rasm 1 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-img1", value: form.img1, onChange: function(e) {
    setForm({ ...form, img1: e.target.value });
  }, placeholder: "https://lh3.googleusercontent.com/d/..." })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-img2" }, "Rasm 2 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-img2", value: form.img2, onChange: function(e) {
    setForm({ ...form, img2: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-img3" }, "Rasm 3 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-img3", value: form.img3, onChange: function(e) {
    setForm({ ...form, img3: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4 } }, "Drive fayl ID: https://lh3.googleusercontent.com/d/FILE_ID \u2014 bot galereyasida shu tartibda chiqadi.")), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Qo'shish"))), editId ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Mahsulotni tahrirlash"), /* @__PURE__ */ React.createElement("form", { onSubmit: saveEdit, onKeyDown: function(e) {
    formKeyDown(e, cancelEdit);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-6" }, "Mahsulot kodi *"), /* @__PURE__ */ React.createElement("input", { id: "f-6", value: editForm.sku, onChange: function(e) {
    setEditForm({ ...editForm, sku: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-7" }, "Ogirlik (kg)"), /* @__PURE__ */ React.createElement("input", { id: "f-7", type: "number", step: "0.1", value: editForm.weight_kg, onChange: function(e) {
    setEditForm({ ...editForm, weight_kg: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-8" }, "Optom narx (so'm)"), /* @__PURE__ */ React.createElement("input", { id: "f-8", type: "number", min: "0", step: "1", value: editForm.price, onChange: function(e) {
    setEditForm({ ...editForm, price: e.target.value });
  } }), editForm.price ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "Mijoz: ", money(mijozNarx(editForm.price)), " so'm") : null), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-ecost" }, "Tannarx qo'lda (0 = avto)"), /* @__PURE__ */ React.createElement("input", { id: "f-ecost", type: "number", min: "0", step: "1", value: editForm.cost_price, onChange: function(e) {
    setEditForm({ ...editForm, cost_price: e.target.value });
  } }), editForm.price && Number(editForm.cost_price) > 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "Foyda: ", money(Math.round(Number(editForm.price) - Number(editForm.cost_price))), " so'm") : /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.72rem", marginTop: -4, marginBottom: 8 } }, "0 = avto tannarx. Foyda = sotish \u2212 tannarx.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-10" }, "Holat"), /* @__PURE__ */ React.createElement("select", { id: "f-10", value: editForm.is_active ? "1" : "0", onChange: function(e) {
    setEditForm({ ...editForm, is_active: e.target.value === "1" });
  } }, /* @__PURE__ */ React.createElement("option", { value: "1" }, "Faol"), /* @__PURE__ */ React.createElement("option", { value: "0" }, "Nofaol")))), /* @__PURE__ */ React.createElement("details", { className: "dash-details" }, /* @__PURE__ */ React.createElement("summary", null, "Qo'shimcha"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-9" }, "Batafsil (mijozga)"), /* @__PURE__ */ React.createElement("textarea", { id: "f-9", rows: 4, placeholder: "Mahsulot haqida matn \u2014 mijoz Batafsilida chiqadi", value: editForm.description, onChange: function(e) {
    setEditForm({ ...editForm, description: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-eimg1" }, "Rasm 1 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-eimg1", value: editForm.img1, onChange: function(e) {
    setEditForm({ ...editForm, img1: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-eimg2" }, "Rasm 2 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-eimg2", value: editForm.img2, onChange: function(e) {
    setEditForm({ ...editForm, img2: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-eimg3" }, "Rasm 3 URL"), /* @__PURE__ */ React.createElement("input", { id: "f-eimg3", value: editForm.img3, onChange: function(e) {
    setEditForm({ ...editForm, img3: e.target.value });
  } })))), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.85rem", margin: "12px 0 8px" } }, "Retsept \u2014 1 dona uchun xomashyo"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { fontSize: "0.72rem", marginTop: 0 } }, "Miqdor va summani qo'lda yozing. Summa bo'sh qolsa: miqdor \xD7 material narxi. Tan narx = qatorlar yig'indisi."), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Xomashyo"), /* @__PURE__ */ React.createElement("th", null, "Miqdor"), /* @__PURE__ */ React.createElement("th", null, "Summa (so'm)"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, recipeRows.map(function(row, idx) {
    return /* @__PURE__ */ React.createElement("tr", { key: idx }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("select", { value: row.material_id, onChange: function(e) {
      const next = recipeRows.slice();
      next[idx] = { ...row, material_id: e.target.value };
      setRecipeRows(next);
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 tanlang \u2014"), materials.map(function(m) {
      return /* @__PURE__ */ React.createElement("option", { key: m.id, value: m.id }, m.name, " (", m.unit, ")");
    }))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("input", { type: "number", step: "0.0001", value: row.qty, onChange: function(e) {
      const next = recipeRows.slice();
      next[idx] = { ...row, qty: e.target.value };
      setRecipeRows(next);
    } })), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", step: "1", value: row.line_amount, placeholder: String(Math.round((Number(row.qty) || 0) * matPrice(row.material_id))), onChange: function(e) {
      const next = recipeRows.slice();
      next[idx] = { ...row, line_amount: e.target.value };
      setRecipeRows(next);
    } })), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setRecipeRows(recipeRows.filter(function(_, i) {
        return i !== idx;
      }));
    } }, "O'chirish")));
  })))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px" } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
    setRecipeRows(recipeRows.concat([{ material_id: "", qty: "", line_amount: "" }]));
  } }, "+ qator"), /* @__PURE__ */ React.createElement("span", { className: "muted" }, "Tan narx: ", /* @__PURE__ */ React.createElement("strong", null, money(recipeTotal())), " so'm")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Saqlash"), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost", type: "button", onClick: cancelEdit }, "Bekor")))) : null, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Mahsulotlar (", list.filter(function(p) {
    return matchQ(q, [p.sku, p.description]);
  }).length, ")"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Qidiruv: mahsulot...", value: q, onChange: function(e) {
    setQ(e.target.value);
  } })), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "kg"), /* @__PURE__ */ React.createElement("th", null, "Tannarx"), /* @__PURE__ */ React.createElement("th", null, "Optom"), /* @__PURE__ */ React.createElement("th", null, "Foyda"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Rasm"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, list.filter(function(p) {
    return matchQ(q, [p.sku, p.description]);
  }).map(function(p) {
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, p.sku), /* @__PURE__ */ React.createElement("td", { "data-label": "kg" }, p.weight_kg), /* @__PURE__ */ React.createElement("td", { "data-label": "Tannarx" }, money(p.unit_cost != null ? p.unit_cost : p.cost_price)), /* @__PURE__ */ React.createElement("td", { "data-label": "Optom" }, inlineId === p.id ? /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inline-edit",
        type: "number",
        autoFocus: true,
        value: inlineVal,
        onChange: function(e) {
          setInlineVal(e.target.value);
        },
        onBlur: function() {
          saveInlinePrice(p);
        },
        onKeyDown: function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            saveInlinePrice(p);
          }
          if (e.key === "Escape") setInlineId(null);
        }
      }
    ) : /* @__PURE__ */ React.createElement("span", { className: "price-edit" }, /* @__PURE__ */ React.createElement("span", { className: "price-cell" }, money(p.price)), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Narxni tahrirlash", onClick: function() {
      setInlineId(p.id);
      setInlineVal(String(Math.round(Number(p.price) || 0)));
    } }, "\u270E"))), /* @__PURE__ */ React.createElement("td", { "data-label": "Foyda" }, money(Math.round(Number(p.price || 0) - Number(p.unit_cost != null ? p.unit_cost : p.cost_price || 0)))), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, money(mijozNarx(p.price))), /* @__PURE__ */ React.createElement("td", null, p.image_urls && p.image_urls.length ? p.image_urls.length : 0), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(StatusBadge, { status: p.is_active ? "active" : "closed" }, p.is_active ? "faol" : "nofaol")), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      startEdit(p);
    } }, "Tahrir"), " ", p.is_active ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-danger btn-sm", onClick: function() {
      softDelete(p.id);
    } }, "O'chirish") : null));
  }))))));
}
function Materials(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", unit: "kg", price: "", initial_stock: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", unit: "kg", price: "", is_active: true });
  const [mov, setMov] = useState({ material_id: "", qty: "", unit_price: "", note: "" });
  const [msg, setMsg] = useAutoMsg();
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const [q, setQ] = useState("");
  const [ferr, setFerr] = useState({});
  const [inlineId, setInlineId] = useState(null);
  const [inlineVal, setInlineVal] = useState("");
  const load = useCallback(function() {
    api("/api/materials?active=0").then(function(r) {
      setList(r.data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  const part = props.part || "all";
  const showCreate = part === "all" || part === "catalog";
  const showIn = part === "all" || part === "inbound";
  const showList = part === "all" || part === "catalog";
  async function saveInlinePrice(m) {
    const next = Number(inlineVal);
    setInlineId(null);
    if (!Number.isFinite(next) || next < 0) {
      setMsg({ text: "Narx noto'g'ri", type: "err" });
      return;
    }
    if (next === Number(m.price || 0)) return;
    try {
      await api("/api/materials/" + m.id, {
        method: "PUT",
        body: JSON.stringify({
          name: m.name,
          unit: m.unit || "kg",
          price: next,
          is_active: m.is_active !== false
        })
      });
      setMsg({ text: "Narx saqlandi", type: "ok" });
      load();
    } catch (e) {
      setMsg({ text: e.message, type: "err" });
    }
  }
  async function submitMat(e) {
    e.preventDefault();
    const next = {};
    if (!String(form.name || "").trim()) next.name = "Nomi majburiy";
    setFerr(next);
    if (next.name) return;
    try {
      await api("/api/materials", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          unit: form.unit || "kg",
          price: Number(form.price) || 0,
          initial_stock: Number(form.initial_stock) || 0
        })
      });
      setMsg({ text: "Material qo'shildi", type: "ok" });
      setForm({ name: "", unit: "kg", price: "", initial_stock: "" });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function startEdit(m) {
    setEditId(m.id);
    setEditForm({
      name: m.name || "",
      unit: m.unit || "kg",
      price: String(m.price != null ? m.price : ""),
      is_active: m.is_active !== false
    });
  }
  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api("/api/materials/" + editId, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          unit: editForm.unit || "kg",
          price: Number(editForm.price) || 0,
          is_active: !!editForm.is_active
        })
      });
      setMsg({ text: "Material yangilandi", type: "ok" });
      setEditId(null);
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function softDelete(id) {
    setConfirmState({
      open: true,
      text: "Materialni nofaol qilish?",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          await api("/api/materials/" + id, { method: "DELETE" });
          setMsg({ text: "Material nofaol qilindi", type: "ok" });
          load();
        } catch (err) {
          setMsg({ text: err.message, type: "err" });
        }
      }
    });
  }
  async function submitIn(e) {
    e.preventDefault();
    try {
      await api("/api/material-movements", {
        method: "POST",
        body: JSON.stringify({
          material_id: Number(mov.material_id),
          movement_type: "in",
          qty: Number(mov.qty),
          unit_price: Number(mov.unit_price) || 0,
          note: mov.note || "Kirim"
        })
      });
      setMsg({ text: "Kirim yozildi", type: "ok" });
      setMov({ material_id: "", qty: "", unit_price: "", note: "" });
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), showCreate ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Yangi xomashyo"), /* @__PURE__ */ React.createElement("form", { onSubmit: submitMat }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-11" }, "Nomi"), /* @__PURE__ */ React.createElement("input", { id: "f-11", value: form.name, onChange: function(e) {
    setForm({ ...form, name: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.name })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-12" }, "Birlik"), /* @__PURE__ */ React.createElement("input", { id: "f-12", value: form.unit, onChange: function(e) {
    setForm({ ...form, unit: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-13" }, "Narx"), /* @__PURE__ */ React.createElement("input", { id: "f-13", type: "number", value: form.price, onChange: function(e) {
    setForm({ ...form, price: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-14" }, "Boshlang'ich zaxira"), /* @__PURE__ */ React.createElement("input", { id: "f-14", type: "number", value: form.initial_stock, onChange: function(e) {
    setForm({ ...form, initial_stock: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Qo'shish"))) : null, showIn ? /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-material-in" }, /* @__PURE__ */ React.createElement("h2", null, "Xomashyo kirim"), /* @__PURE__ */ React.createElement("form", { onSubmit: submitIn }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-15" }, "Material"), /* @__PURE__ */ React.createElement("select", { id: "f-15", value: mov.material_id, onChange: function(e) {
    setMov({ ...mov, material_id: e.target.value });
  }, required: true }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), list.filter(function(m) {
    return m.is_active;
  }).map(function(m) {
    return /* @__PURE__ */ React.createElement("option", { key: m.id, value: m.id }, m.name);
  }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-16" }, "Miqdor"), /* @__PURE__ */ React.createElement("input", { id: "f-16", type: "number", step: "0.01", value: mov.qty, onChange: function(e) {
    setMov({ ...mov, qty: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-17" }, "Birlik narx"), /* @__PURE__ */ React.createElement("input", { id: "f-17", type: "number", value: mov.unit_price, onChange: function(e) {
    setMov({ ...mov, unit_price: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-18" }, "Izoh"), /* @__PURE__ */ React.createElement("input", { id: "f-18", value: mov.note, onChange: function(e) {
    setMov({ ...mov, note: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Kirim"))) : null, editId && showCreate ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Tahrirlash #", editId), /* @__PURE__ */ React.createElement("form", { onSubmit: saveEdit, onKeyDown: function(e) {
    formKeyDown(e, function() {
      setEditId(null);
    });
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Nomi"), /* @__PURE__ */ React.createElement("input", { value: editForm.name, onChange: function(e) {
    setEditForm({ ...editForm, name: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Birlik"), /* @__PURE__ */ React.createElement("input", { value: editForm.unit, onChange: function(e) {
    setEditForm({ ...editForm, unit: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Narx"), /* @__PURE__ */ React.createElement("input", { type: "number", value: editForm.price, onChange: function(e) {
    setEditForm({ ...editForm, price: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Faol"), /* @__PURE__ */ React.createElement("select", { value: editForm.is_active ? "1" : "0", onChange: function(e) {
    setEditForm({ ...editForm, is_active: e.target.value === "1" });
  } }, /* @__PURE__ */ React.createElement("option", { value: "1" }, "Ha"), /* @__PURE__ */ React.createElement("option", { value: "0" }, "Yo'q")))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Saqlash"), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost", type: "button", onClick: function() {
    setEditId(null);
  } }, "Bekor"))) : null, showList ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Xomashyo ro'yxati (", list.filter(function(m) {
    return matchQ(q, [m.name, m.unit]);
  }).length, ")"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Qidiruv: nomi...", value: q, onChange: function(e) {
    setQ(e.target.value);
  } })), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ID"), /* @__PURE__ */ React.createElement("th", null, "Nomi"), /* @__PURE__ */ React.createElement("th", null, "Birlik"), /* @__PURE__ */ React.createElement("th", null, "Narx"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", { className: "sticky-actions" }, "Amallar"))), /* @__PURE__ */ React.createElement("tbody", null, list.filter(function(m) {
    return matchQ(q, [m.name, m.unit]);
  }).map(function(m) {
    return /* @__PURE__ */ React.createElement("tr", { key: m.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "ID" }, m.id), /* @__PURE__ */ React.createElement("td", { "data-label": "Nomi" }, m.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Birlik" }, m.unit), /* @__PURE__ */ React.createElement("td", null, inlineId === m.id ? /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "inline-edit",
        type: "number",
        autoFocus: true,
        value: inlineVal,
        onChange: function(e) {
          setInlineVal(e.target.value);
        },
        onBlur: function() {
          saveInlinePrice(m);
        },
        onKeyDown: function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            saveInlinePrice(m);
          }
          if (e.key === "Escape") setInlineId(null);
        }
      }
    ) : /* @__PURE__ */ React.createElement("span", { className: "price-edit" }, /* @__PURE__ */ React.createElement("span", { className: "price-cell" }, money(m.price)), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Narxni tahrirlash", onClick: function() {
      setInlineId(m.id);
      setInlineVal(String(m.price != null ? m.price : ""));
    } }, "\u270E"))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(StatusBadge, { status: m.is_active ? "active" : "closed" }, m.is_active ? "faol" : "nofaol")), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      startEdit(m);
    } }, "Tahrir"), m.is_active && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-danger btn-sm", onClick: function() {
      softDelete(m.id);
    } }, "O'chirish")));
  }))))) : null);
}
function Batches(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    bags_count: "",
    bag_price: "",
    dry_kg: "",
    workers_count: "",
    press_wage: "",
    note: "",
    material_id: ""
  });
  const [materials, setMaterials] = useState([]);
  const [msg, setMsg] = useAutoMsg();
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const [ferr, setFerr] = useState({});
  const [busy, setBusy] = useState(false);
  function copyBatch(b) {
    setForm({
      bags_count: String(b.bags_count != null ? b.bags_count : ""),
      bag_price: String(b.bag_price != null ? b.bag_price : ""),
      dry_kg: String(b.dry_kg != null ? b.dry_kg : ""),
      workers_count: String(b.workers_count != null ? b.workers_count : ""),
      press_wage: String(b.press_wage != null ? b.press_wage : ""),
      note: b.note ? "Nusxa: " + b.note : "Nusxa"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteBatch(id) {
    setConfirmState({
      open: true,
      text: "Partiyani o'chirish? (faqat qadoqlanmagan)",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          await api("/api/batches/" + id, { method: "DELETE" });
          setMsg({ text: "Partiya o'chirildi", type: "ok" });
          load();
        } catch (err) {
          setMsg({ text: err.message, type: "err" });
        }
      }
    });
  }
  const load = useCallback(function() {
    Promise.all([api("/api/batches"), api("/api/materials")]).then(function(arr) {
      setList(arr[0].data || []);
      setMaterials(arr[1].data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  useFocusForm(props.pageFilter, "batch");
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!(Number(form.bags_count) > 0)) next.bags_count = "Qop soni musbat bo'lsin";
    if (!(Number(form.bag_price) > 0)) next.bag_price = "Qop narxi musbat bo'lsin";
    if (!(Number(form.dry_kg) > 0)) next.dry_kg = "Quruq kg musbat bo'lsin";
    setFerr(next);
    if (Object.keys(next).length) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await api("/api/batches", {
        method: "POST",
        body: JSON.stringify({
          bags_count: Number(form.bags_count),
          bag_price: Number(form.bag_price),
          dry_kg: Number(form.dry_kg),
          workers_count: Number(form.workers_count) || 0,
          press_wage: Number(form.press_wage) || 0,
          note: form.note || null,
          material_id: form.material_id ? Number(form.material_id) : null
        })
      });
      setMsg({ text: r && r.warning ? "Partiya yaratildi. " + r.warning : "Partiya yaratildi", type: r && r.warning ? "err" : "ok" });
      setForm({ bags_count: "", bag_price: "", dry_kg: "", workers_count: "", press_wage: "", note: "", material_id: form.material_id || "" });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
    setBusy(false);
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(PageHead, { title: "Partiyalar", sub: "Avval partiya, keyin shu bo'limdagi Qadoqlash qadami." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-batch" }, /* @__PURE__ */ React.createElement("h2", null, "Yangi partiya"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-19" }, "Qop soni *"), /* @__PURE__ */ React.createElement("input", { id: "f-19", type: "number", value: form.bags_count, onChange: function(e) {
    setForm({ ...form, bags_count: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.bags_count })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-20" }, "1 qop narxi *"), /* @__PURE__ */ React.createElement("input", { id: "f-20", type: "number", value: form.bag_price, onChange: function(e) {
    setForm({ ...form, bag_price: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.bag_price })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-21" }, "Quruq kg *"), /* @__PURE__ */ React.createElement("input", { id: "f-21", type: "number", step: "0.1", value: form.dry_kg, onChange: function(e) {
    setForm({ ...form, dry_kg: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.dry_kg })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-22" }, "Ishchilar"), /* @__PURE__ */ React.createElement("input", { id: "f-22", type: "number", value: form.workers_count, onChange: function(e) {
    setForm({ ...form, workers_count: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-23" }, "Press ish haqi"), /* @__PURE__ */ React.createElement("input", { id: "f-23", type: "number", value: form.press_wage, onChange: function(e) {
    setForm({ ...form, press_wage: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-24m" }, "Material"), /* @__PURE__ */ React.createElement("select", { id: "f-24m", value: form.material_id, onChange: function(e) {
    setForm({ ...form, material_id: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Avto (ko'mir)"), materials.map(function(m) {
    return /* @__PURE__ */ React.createElement("option", { key: m.id, value: m.id }, m.name);
  }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-24" }, "Izoh"), /* @__PURE__ */ React.createElement("input", { id: "f-24", value: form.note, onChange: function(e) {
    setForm({ ...form, note: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : "Partiya yaratish"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Partiyalar (", list.length, ")"), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null, "Qop"), /* @__PURE__ */ React.createElement("th", null, "Quruq"), /* @__PURE__ */ React.createElement("th", null, "Qadoqlangan"), /* @__PURE__ */ React.createElement("th", null, "Qolgan"), /* @__PURE__ */ React.createElement("th", null, "Yoqotish %"), /* @__PURE__ */ React.createElement("th", { className: "sticky-actions" }, "Amallar"))), /* @__PURE__ */ React.createElement("tbody", null, list.map(function(b) {
    const canDel = Number(b.packed_kg) === 0 || Number(b.packed_kg) === 0;
    return /* @__PURE__ */ React.createElement("tr", { key: b.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, b.batch_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: b.status })), /* @__PURE__ */ React.createElement("td", { "data-label": "Qop" }, b.bags_count), /* @__PURE__ */ React.createElement("td", { "data-label": "Quruq" }, b.dry_kg), /* @__PURE__ */ React.createElement("td", { "data-label": "Qadoqlangan" }, b.packed_kg), /* @__PURE__ */ React.createElement("td", { "data-label": "Qolgan" }, /* @__PURE__ */ React.createElement("strong", null, b.remaining_kg)), /* @__PURE__ */ React.createElement("td", { "data-label": "Yoqotish %" }, b.loss_percent, "%"), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      copyBatch(b);
    } }, "Nusxa"), canDel ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-danger btn-sm", onClick: function() {
      deleteBatch(b.id);
    } }, "O'chirish") : null));
  }))))));
}
function Packaging(props) {
  const api = props.api;
  const PAGE = 40;
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({
    product_id: "",
    qty: "",
    unit_wage: "700",
    workers_count: "1",
    batch_id: ""
  });
  const [msg, setMsg] = useAutoMsg();
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const [ferr, setFerr] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [busyPack, setBusyPack] = useState(false);
  function deleteBatch(id) {
    setConfirmState({
      open: true,
      text: "Partiyani o'chirish? (faqat qadoqlanmagan)",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          await api("/api/batches/" + id, { method: "DELETE" });
          setMsg({ text: "Partiya o'chirildi", type: "ok" });
          load();
        } catch (err) {
          setMsg({ text: err.message, type: "err" });
        }
      }
    });
  }
  const load = useCallback(function() {
    setLoading(true);
    setOffset(0);
    Promise.all([
      api("/api/packaging?limit=" + PAGE + "&offset=0"),
      api("/api/products"),
      api("/api/batches?status=active")
    ]).then(function(arr) {
      const rows = arr[0].data || [];
      setList(rows);
      setHasMore(rows.length >= PAGE);
      setProducts(arr[1].data || []);
      setBatches(arr[2].data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    }).finally(function() {
      setLoading(false);
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = offset + PAGE;
    try {
      const r = await api("/api/packaging?limit=" + PAGE + "&offset=" + next);
      const rows = r.data || [];
      setList(function(prev) {
        return prev.concat(rows);
      });
      setOffset(next);
      setHasMore(rows.length >= PAGE);
    } catch (e) {
      setMsg({ text: e.message, type: "err" });
    }
    setLoadingMore(false);
  }
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!form.product_id) next.product_id = "Mahsulot majburiy";
    if (!(Number(form.qty) > 0)) next.qty = "Dona musbat bo'lsin";
    setFerr(next);
    if (next.product_id || next.qty) return;
    if (busyPack) return;
    setBusyPack(true);
    try {
      await api("/api/packaging", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(form.product_id),
          qty: Number(form.qty),
          unit_wage: Number(form.unit_wage) || 700,
          workers_count: Number(form.workers_count) || 1,
          batch_id: form.batch_id ? Number(form.batch_id) : null
        })
      });
      setMsg({ text: "Qadoqlandi", type: "ok" });
      setForm({ ...form, qty: "" });
      setFerr({});
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
    setBusyPack(false);
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Qadoqlash", sub: "Partiyadagi quruq mahsulotni donalarga ajratish qadami." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-pack" }, /* @__PURE__ */ React.createElement("h2", null, "Qadoqlash"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-25" }, "Mahsulot *"), /* @__PURE__ */ React.createElement("select", { id: "f-25", value: form.product_id, onChange: function(e) {
    setForm({ ...form, product_id: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), products.map(function(p) {
    return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.sku, " (", p.weight_kg, " kg)");
  })), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.product_id })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-26" }, "Dona *"), /* @__PURE__ */ React.createElement("input", { id: "f-26", type: "number", value: form.qty, onChange: function(e) {
    setForm({ ...form, qty: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.qty })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-27" }, "1 dona ish haqi"), /* @__PURE__ */ React.createElement("input", { id: "f-27", type: "number", value: form.unit_wage, onChange: function(e) {
    setForm({ ...form, unit_wage: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-28" }, "Ishchilar"), /* @__PURE__ */ React.createElement("input", { id: "f-28", type: "number", value: form.workers_count, onChange: function(e) {
    setForm({ ...form, workers_count: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-29" }, "Partiya (bosh = FIFO)"), /* @__PURE__ */ React.createElement("select", { id: "f-29", value: form.batch_id, onChange: function(e) {
    setForm({ ...form, batch_id: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Avto (FIFO)"), batches.map(function(b) {
    return /* @__PURE__ */ React.createElement("option", { key: b.id, value: b.id }, b.batch_code, " - ", b.remaining_kg, " kg");
  })))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busyPack }, busyPack ? "Saqlanmoqda..." : "Qadoqlash"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "So'nggi qadoqlash"), loading ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Yuklanmoqda...") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Dona"), /* @__PURE__ */ React.createElement("th", null, "kg"), /* @__PURE__ */ React.createElement("th", null, "Partiya"), /* @__PURE__ */ React.createElement("th", null, "Ish haqi"))), /* @__PURE__ */ React.createElement("tbody", null, list.map(function(p) {
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, p.sku), /* @__PURE__ */ React.createElement("td", { "data-label": "Dona" }, p.qty), /* @__PURE__ */ React.createElement("td", { "data-label": "kg" }, p.kg), /* @__PURE__ */ React.createElement("td", { "data-label": "Partiya" }, p.batch_code || "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Ish haqi" }, money(p.total_wage)));
  })))), !loading && hasMore ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost", disabled: loadingMore, onClick: loadMore }, loadingMore ? "Yuklanmoqda..." : "Yana yuklash")) : null));
}
function Customers(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", address: "", credit_limit: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", address: "", credit_limit: "", is_active: true });
  const [msg, setMsg] = useAutoMsg();
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const [q, setQ] = useState("");
  const [ferr, setFerr] = useState({});
  const includeInactive = !!props.includeInactive;
  const load = useCallback(function() {
    api("/api/customers" + (includeInactive ? "?active=0" : "")).then(function(r) {
      setList(r.data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api, includeInactive]);
  useEffect(function() {
    load();
  }, [load]);
  const editBoot = useRef(null);
  useEffect(function() {
    if (!props.initialEditId || !list.length) return;
    if (editBoot.current === String(props.initialEditId)) return;
    var c = list.find(function(x) {
      return String(x.id) === String(props.initialEditId);
    });
    if (!c) return;
    editBoot.current = String(props.initialEditId);
    startEdit(c);
  }, [list, props.initialEditId]);
  function phoneSoftOk(ph) {
    if (!ph) return true;
    return /^\+?\d{9,13}$/.test(String(ph).replace(/[\s\-()]/g, ""));
  }
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!String(form.name || "").trim()) next.name = "Ism majburiy";
    if (form.phone && !phoneSoftOk(form.phone)) next.phone = "Telefon formati shubhali (+998...)";
    setFerr(next);
    if (next.name || next.phone) return;
    try {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || null,
          address: form.address || null,
          credit_limit: Number(form.credit_limit) || 0
        })
      });
      if (typeof props.onSaved === "function") props.onSaved("Mijoz qo'shildi");
      else setMsg({ text: "Mijoz qo'shildi", type: "ok" });
      setForm({ name: "", phone: "", address: "", credit_limit: "" });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function startEdit(c) {
    setEditId(c.id);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      address: c.address || "",
      credit_limit: String(c.credit_limit != null ? c.credit_limit : ""),
      is_active: c.is_active !== false
    });
  }
  async function saveEdit(e) {
    e.preventDefault();
    if (editForm.phone && !phoneSoftOk(editForm.phone)) {
      setMsg({ text: "Telefon formati shubhali", type: "err" });
      return;
    }
    try {
      await api("/api/customers/" + editId, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone || null,
          address: editForm.address || null,
          credit_limit: Number(editForm.credit_limit) || 0,
          is_active: !!editForm.is_active
        })
      });
      if (typeof props.onSaved === "function") props.onSaved("Mijoz yangilandi");
      else setMsg({ text: "Mijoz yangilandi", type: "ok" });
      setEditId(null);
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function softDelete(id) {
    setConfirmState({
      open: true,
      text: "Mijozni nofaol qilish?",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          await api("/api/customers/" + id, { method: "DELETE" });
          setMsg({ text: "Mijoz nofaol qilindi", type: "ok" });
          load();
        } catch (err) {
          setMsg({ text: err.message, type: "err" });
        }
      }
    });
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), props.hideCreate ? null : /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-customer" }, /* @__PURE__ */ React.createElement("h2", null, "Yangi chakana mijoz"), /* @__PURE__ */ React.createElement("div", { className: "hint-box" }, "Chakana mijoz buyurtmada tanlanadi. Diler va hamkor shu bo'limdagi filtrda, alohida jadvalda qoladi."), /* @__PURE__ */ React.createElement("form", { onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-30" }, "Ism"), /* @__PURE__ */ React.createElement("input", { id: "f-30", value: form.name, onChange: function(e) {
    setForm({ ...form, name: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.name })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-31" }, "Telefon"), /* @__PURE__ */ React.createElement("input", { id: "f-31", value: form.phone, onChange: function(e) {
    setForm({ ...form, phone: e.target.value });
  }, placeholder: "+998..." }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.phone })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-32" }, "Manzil"), /* @__PURE__ */ React.createElement("input", { id: "f-32", value: form.address, onChange: function(e) {
    setForm({ ...form, address: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-33" }, "Kredit limiti"), /* @__PURE__ */ React.createElement("input", { id: "f-33", type: "number", value: form.credit_limit, onChange: function(e) {
    setForm({ ...form, credit_limit: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Qo'shish"))), editId && /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Tahrirlash #", editId), /* @__PURE__ */ React.createElement("form", { onSubmit: saveEdit, onKeyDown: function(e) {
    formKeyDown(e, function() {
      setEditId(null);
    });
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Ism"), /* @__PURE__ */ React.createElement("input", { value: editForm.name, onChange: function(e) {
    setEditForm({ ...editForm, name: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Telefon"), /* @__PURE__ */ React.createElement("input", { value: editForm.phone, onChange: function(e) {
    setEditForm({ ...editForm, phone: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Manzil"), /* @__PURE__ */ React.createElement("input", { value: editForm.address, onChange: function(e) {
    setEditForm({ ...editForm, address: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kredit limiti"), /* @__PURE__ */ React.createElement("input", { type: "number", value: editForm.credit_limit, onChange: function(e) {
    setEditForm({ ...editForm, credit_limit: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Faol"), /* @__PURE__ */ React.createElement("select", { value: editForm.is_active ? "1" : "0", onChange: function(e) {
    setEditForm({ ...editForm, is_active: e.target.value === "1" });
  } }, /* @__PURE__ */ React.createElement("option", { value: "1" }, "Ha"), /* @__PURE__ */ React.createElement("option", { value: "0" }, "Yo'q")))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Saqlash"), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost", type: "button", onClick: function() {
    setEditId(null);
  } }, "Bekor"))), props.hideList ? null : /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Mijozlar ro'yxati"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Qidiruv: ism, telefon...", value: q, onChange: function(e) {
    setQ(e.target.value);
  } })), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "ID"), /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Telefon"), /* @__PURE__ */ React.createElement("th", null, "Limit"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", { className: "sticky-actions" }, "Amallar"))), /* @__PURE__ */ React.createElement("tbody", null, list.filter(function(c) {
    return matchQ(q, [c.name, c.phone, c.address]);
  }).map(function(c) {
    return /* @__PURE__ */ React.createElement("tr", { key: c.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "ID" }, c.id), /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, c.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Telefon" }, c.phone || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Limit" }, money(c.credit_limit)), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: c.is_active === false ? "closed" : "active" }, c.is_active === false ? "nofaol" : "faol")), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      startEdit(c);
    } }, "Tahrir"), c.is_active !== false && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-danger btn-sm", onClick: function() {
      softDelete(c.id);
    } }, "O'chirish")));
  }))))));
}
function Orders(props) {
  const api = props.api;
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: "",
    customer_name: "",
    phone: "",
    paid_amount: "",
    note: ""
  });
  const [lines, setLines] = useState([{ product_id: "", qty: "", unit_price: "" }]);
  const [priceCfg, setPriceCfg] = useState({ bulk_discount: 3e3, bulk_min_qty: 500, bulk_min_kg: 1e3 });
  const [msg, setMsg] = useAutoMsg();
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ferr, setFerr] = useState({});
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const debtOnlyInit = !!(props.pageFilter && props.pageFilter.debtOnly);
  const [debtOnly, setDebtOnly] = useState(debtOnlyInit);
  useEffect(function() {
    setDebtOnly(!!(props.pageFilter && props.pageFilter.debtOnly));
  }, [props.pageFilter]);
  useFocusForm(props.pageFilter, "order");
  function unitForProduct(p, qty) {
    if (!p) return 0;
    const optom = Math.round(Number(p.price) || 0);
    const disc = Number(priceCfg.bulk_discount) || 3e3;
    const minQty = Number(priceCfg.bulk_min_qty) || 500;
    const minKg = Number(priceCfg.bulk_min_kg) || 1e3;
    const q2 = Number(qty) || 0;
    const kg = q2 * (Number(p.weight_kg) || 0);
    const isBulk = q2 >= minQty || kg >= minKg;
    return isBulk ? optom : optom + disc;
  }
  const load = useCallback(function() {
    Promise.all([
      api("/api/orders?limit=50"),
      api("/api/products"),
      api("/api/customers"),
      api("/api/settings")
    ]).then(function(arr) {
      setList(arr[0].data || []);
      setProducts(arr[1].data || []);
      setCustomers(arr[2].data || []);
      const map = arr[3] && arr[3].data || {};
      setPriceCfg({
        bulk_discount: Number(map.bulk_discount) || 3e3,
        bulk_min_qty: Number(map.bulk_min_qty) || 500,
        bulk_min_kg: Number(map.bulk_min_kg) || 1e3
      });
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  function onCustomer(id) {
    const c = customers.find(function(x) {
      return String(x.id) === String(id);
    });
    setForm(function(f) {
      return Object.assign({}, f, {
        customer_id: id,
        customer_name: c ? c.name : f.customer_name,
        phone: c && c.phone ? c.phone : f.phone
      });
    });
  }
  function setLine(i, field, val) {
    setLines(function(prev) {
      const next = prev.slice();
      next[i] = Object.assign({}, next[i], { [field]: val });
      if (field === "product_id" || field === "qty") {
        const p = products.find(function(x) {
          return String(x.id) === String(next[i].product_id);
        });
        if (p) next[i].unit_price = String(unitForProduct(p, next[i].qty));
      }
      return next;
    });
  }
  const total = lines.reduce(function(s, l) {
    return s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
  }, 0);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const items = lines.filter(function(l) {
      return l.product_id && Number(l.qty) > 0;
    }).map(function(l) {
      return {
        product_id: Number(l.product_id),
        qty: Number(l.qty),
        unit_price: Number(l.unit_price) || 0
      };
    });
    const next = {};
    if (!String(form.customer_name || "").trim()) next.customer_name = "Ism majburiy";
    if (!items.length) next.items = "Kamida 1 ta mahsulot kiriting";
    setFerr(next);
    if (next.customer_name || next.items) return;
    setBusy(true);
    try {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          customer_name: form.customer_name,
          phone: form.phone || null,
          paid_amount: Number(form.paid_amount) || 0,
          note: form.note || null,
          items
        })
      });
      setMsg({ text: "Buyurtma yaratildi", type: "ok" });
      setForm({ customer_id: "", customer_name: "", phone: "", paid_amount: "", note: "" });
      setLines([{ product_id: "", qty: "", unit_price: "" }]);
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
    setBusy(false);
  }
  async function setStatus(id, status) {
    try {
      await api("/api/orders/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function copyOrder(o) {
    setForm({
      customer_id: o.customer_id ? String(o.customer_id) : "",
      customer_name: o.customer_name || "",
      phone: o.phone || "",
      paid_amount: "",
      note: o.note ? "Nusxa: " + o.note : "Nusxa"
    });
    const its = o.items && o.items.length ? o.items.map(function(it) {
      return {
        product_id: it.product_id ? String(it.product_id) : "",
        qty: String(it.qty != null ? it.qty : ""),
        unit_price: String(it.unit_price != null ? it.unit_price : "")
      };
    }) : [{ product_id: "", qty: "", unit_price: "" }];
    setLines(its);
    setFerr({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const shown = list.filter(function(o) {
    if (debtOnly && !(Number(o.debt_amount) > 0)) return false;
    if (!inDateRange(o.ordered_at || o.created_at, dateFrom, dateTo)) return false;
    return matchQ(q, [
      o.order_code,
      o.customer_name,
      o.phone,
      o.status,
      statusLabel(o.status),
      o.note,
      o.admin_note,
      o.source
    ]);
  });
  const pendingIds = shown.filter(function(o) {
    return o.status === "pending";
  }).map(function(o) {
    return o.id;
  });
  const selectedPending = pendingIds.filter(function(id) {
    return !!selected[id];
  });
  async function bulkConfirm() {
    if (!selectedPending.length) return;
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < selectedPending.length; i++) {
      try {
        await api("/api/orders/" + selectedPending[i] + "/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "confirmed" })
        });
        ok += 1;
      } catch (e) {
        fail += 1;
      }
    }
    setSelected({});
    setMsg({
      text: fail ? ok + " tasdiqlandi, " + fail + " xato" : ok + " buyurtma tasdiqlandi",
      type: fail ? "err" : "ok"
    });
    load();
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(PageHead, { title: "Buyurtmalar", sub: "Kutilayotgan buyurtma omborga tegmaydi. " + priceCfg.bulk_min_qty + " donagacha mijoz = optom + " + money(priceCfg.bulk_discount) + " so'm." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-order" }, /* @__PURE__ */ React.createElement("h2", null, "Yangi sotuv"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-34" }, "Mijoz (ro'yxat)"), /* @__PURE__ */ React.createElement("select", { id: "f-34", value: form.customer_id, onChange: function(e) {
    onCustomer(e.target.value);
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-"), customers.map(function(c) {
    return /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.name);
  }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-35" }, "Ism *"), /* @__PURE__ */ React.createElement("input", { id: "f-35", value: form.customer_name, onChange: function(e) {
    setForm({ ...form, customer_name: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.customer_name })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-36" }, "Telefon"), /* @__PURE__ */ React.createElement("input", { id: "f-36", value: form.phone, onChange: function(e) {
    setForm({ ...form, phone: e.target.value });
  } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-37" }, "To'langan"), /* @__PURE__ */ React.createElement("input", { id: "f-37", type: "number", value: form.paid_amount, onChange: function(e) {
    setForm({ ...form, paid_amount: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("div", { className: "line-items" }, /* @__PURE__ */ React.createElement("label", { style: { marginBottom: 8 } }, "Mahsulotlar"), lines.map(function(l, i) {
    return /* @__PURE__ */ React.createElement("div", { className: "line-row", key: i }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "sku-" + i }, "Mahsulot"), /* @__PURE__ */ React.createElement("select", { id: "sku-" + i, value: l.product_id, onChange: function(e) {
      setLine(i, "product_id", e.target.value);
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), products.map(function(p) {
      return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.sku, " \xB7 optom ", money(p.price));
    }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "qty-" + i }, "Dona"), /* @__PURE__ */ React.createElement("input", { id: "qty-" + i, type: "number", min: "1", step: "1", value: l.qty, onChange: function(e) {
      setLine(i, "qty", e.target.value);
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "price-" + i }, "Birlik narx"), /* @__PURE__ */ React.createElement("input", { id: "price-" + i, type: "number", min: "0", step: "1", value: l.unit_price, onChange: function(e) {
      setLine(i, "unit_price", e.target.value);
    } })), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "btn-ghost btn-sm",
        disabled: lines.length === 1,
        onClick: function() {
          setLines(function(prev) {
            return prev.filter(function(_, j) {
              return j !== i;
            });
          });
        }
      },
      "x"
    ));
  }), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn-ghost",
      onClick: function() {
        setLines(function(p) {
          return p.concat([{ product_id: "", qty: "", unit_price: "" }]);
        });
      }
    },
    "+ qator"
  ), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { fontSize: "0.75rem", marginTop: 8 } }, "Miqdor ", priceCfg.bulk_min_qty, "+ dona yoki ", priceCfg.bulk_min_kg, " kg dan \u2014 optom. Undan kam \u2014 optom + ", money(priceCfg.bulk_discount), " so'm. Qo'lda o'zgartirish mumkin."), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.items })), /* @__PURE__ */ React.createElement("div", { className: "total-box" }, /* @__PURE__ */ React.createElement("span", null, "Jami"), /* @__PURE__ */ React.createElement("span", null, money(total), " so'm")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-41" }, "Izoh"), /* @__PURE__ */ React.createElement("input", { id: "f-41", value: form.note, onChange: function(e) {
    setForm({ ...form, note: e.target.value });
  } })), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : "Buyurtma yaratish"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Buyurtmalar (", shown.length, ")"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginBottom: 10, fontSize: "0.78rem" } }, "Telegram/PWA buyurtmalari ", /* @__PURE__ */ React.createElement("b", null, "pending"), " - Tasdiq yoki Rad."), /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "search",
      placeholder: "Qidiruv: kod, mijoz, tel...",
      value: q,
      onChange: function(e) {
        setQ(e.target.value);
      }
    }
  ), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateFrom, onChange: function(e) {
    setDateFrom(e.target.value);
  }, title: "Dan" }), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateTo, onChange: function(e) {
    setDateTo(e.target.value);
  }, title: "Gacha" }), /* @__PURE__ */ React.createElement("label", { className: "stat-mini", style: { display: "inline-flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: debtOnly,
      onChange: function(e) {
        setDebtOnly(e.target.checked);
      },
      style: { width: "auto", margin: 0 }
    }
  ), "Faqat qarz"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn-ghost btn-sm",
      onClick: function() {
        downloadCsv("buyurtmalar.csv", shown, [
          { label: "Kod", get: function(r) {
            return r.order_code;
          } },
          { label: "Mijoz", get: function(r) {
            return r.customer_name;
          } },
          { label: "Tel", get: function(r) {
            return r.phone;
          } },
          { label: "Holat", get: function(r) {
            return statusLabel(r.status);
          } },
          { label: "Summa", get: function(r) {
            return Math.round(Number(r.total_amount) || 0);
          } },
          { label: "Qarz", get: function(r) {
            return Math.round(Number(r.debt_amount) || 0);
          } },
          { label: "Sana", get: function(r) {
            return ymdTashkent(r.ordered_at || r.created_at);
          } }
        ]);
      }
    },
    "CSV"
  )), selectedPending.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "bulk-bar" }, /* @__PURE__ */ React.createElement("strong", null, selectedPending.length, " ta tanlandi"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: bulkConfirm }, "Tasdiqlash"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
    setSelected({});
  } }, "Bekor")) : null, /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      style: { width: "auto", margin: 0 },
      checked: pendingIds.length > 0 && selectedPending.length === pendingIds.length,
      onChange: function(e) {
        const on = e.target.checked;
        const next = Object.assign({}, selected);
        pendingIds.forEach(function(id) {
          next[id] = on;
        });
        setSelected(next);
      },
      "aria-label": "Barcha pending"
    }
  )), /* @__PURE__ */ React.createElement("th", null, "Buyurtma"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Izoh"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", { className: "sticky-actions" }, "Amallar"))), /* @__PURE__ */ React.createElement("tbody", null, shown.map(function(o) {
    var src = o.source || "admin";
    var srcLabel = src === "telegram" ? "TG" : src === "pwa" ? "PWA" : "Admin";
    var itemsLine = o.items && o.items.length ? o.items.map(function(i) {
      return i.sku + " x " + i.qty;
    }).join(", ") : "";
    var trail = o.admin_note || o.updated_by || o.operator_name || "";
    return /* @__PURE__ */ React.createElement(
      "tr",
      {
        key: o.id,
        style: o.status === "pending" && (src === "telegram" || src === "pwa") ? { background: "rgba(201,162,39,0.08)" } : void 0
      },
      /* @__PURE__ */ React.createElement("td", { "data-label": "" }, o.status === "pending" ? /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          style: { width: "auto", margin: 0 },
          checked: !!selected[o.id],
          onChange: function(e) {
            setSelected(Object.assign({}, selected, { [o.id]: e.target.checked }));
          },
          "aria-label": "Tanlash " + (o.order_code || o.id)
        }
      ) : null),
      /* @__PURE__ */ React.createElement("td", { "data-label": "Buyurtma" }, /* @__PURE__ */ React.createElement("span", { className: "badge", style: { marginRight: 4 } }, srcLabel), /* @__PURE__ */ React.createElement("span", { className: "order-row-code", title: o.order_code }, o.order_code && o.order_code.length > 16 ? o.order_code.slice(0, 8) + "-" + o.order_code.slice(-4) : o.order_code), itemsLine ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.7rem", marginTop: 2 } }, itemsLine) : null),
      /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz", className: "cell-stack order-customer-cell" }, /* @__PURE__ */ React.createElement("div", { className: "order-customer-name" }, o.customer_name || "-"), o.phone ? /* @__PURE__ */ React.createElement("div", { className: "order-phone muted" }, o.phone) : null, trail ? /* @__PURE__ */ React.createElement("div", { className: "muted order-trail" }, "Oxirgi: ", trail) : null),
      /* @__PURE__ */ React.createElement("td", { className: "cell-note", "data-label": "Izoh" }, o.note ? /* @__PURE__ */ React.createElement("div", { className: "note-text muted", style: { fontSize: "0.78rem" } }, o.note) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, "\u2014")),
      /* @__PURE__ */ React.createElement("td", { "data-label": "Summa", className: "order-summa-cell" }, /* @__PURE__ */ React.createElement("span", { className: "order-summa" }, money(o.total_amount)), Number(o.debt_amount) > 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted order-debt" }, "qarz ", money(o.debt_amount)) : null),
      /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: o.status }), Number(o.paid_amount) > 0 && String(o.status) === "pending" ? /* @__PURE__ */ React.createElement("div", { className: "muted", style: { fontSize: "0.68rem" } }, "niyat ", money(o.paid_amount)) : null),
      /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-sm", type: "button", onClick: function() {
        copyOrder(o);
      } }, "Nusxa"), " ", o.status === "pending" ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn btn-sm",
          type: "button",
          onClick: function() {
            setStatus(o.id, "confirmed");
          }
        },
        "Tasdiq"
      ), " ", /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn-danger btn-sm",
          type: "button",
          onClick: function() {
            setConfirmState({
              open: true,
              text: "Buyurtmani rad etasizmi?",
              onConfirm: function() {
                setConfirmState({ open: false, text: "", onConfirm: null });
                setStatus(o.id, "rejected");
              }
            });
          }
        },
        "Rad"
      )) : null, o.status === "confirmed" ? /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn-ghost btn-sm",
          type: "button",
          onClick: function() {
            setStatus(o.id, "closed");
          }
        },
        "Yopish"
      ) : null)
    );
  }))))));
}
function Payments(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({
    customer_id: "",
    order_id: "",
    amount: "",
    method: "cash",
    note: ""
  });
  const [msg, setMsg] = useAutoMsg();
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ferr, setFerr] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(function() {
    Promise.all([
      api("/api/payments?limit=30"),
      api("/api/customers"),
      api("/api/orders?limit=50")
    ]).then(function(arr) {
      setList(arr[0].data || []);
      setCustomers(arr[1].data || []);
      setOrders((arr[2].data || []).filter(function(x) {
        return Number(x.debt_amount) > 0;
      }));
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  useFocusForm(props.pageFilter, "payment");
  useEffect(function() {
    const id = props.pageFilter && props.pageFilter.customerId;
    if (!id) return;
    setForm(function(f) {
      return Object.assign({}, f, { customer_id: String(id), order_id: "" });
    });
  }, [props.pageFilter]);
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!(Number(form.amount) > 0)) next.amount = "Summa musbat bo'lsin";
    setFerr(next);
    if (next.amount) return;
    if (busy) return;
    setBusy(true);
    try {
      const r = await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          order_id: form.order_id ? Number(form.order_id) : null,
          amount: Number(form.amount),
          method: form.method || "cash",
          note: form.note || null
        })
      });
      setMsg({
        text: "Tolov qabul qilindi. Qollandi: " + money(r.applied) + (r.leftover > 0 ? ", qoldi: " + money(r.leftover) : ""),
        type: "ok"
      });
      setForm({ customer_id: "", order_id: "", amount: "", method: "cash", note: "" });
      setFerr({});
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
    setBusy(false);
  }
  const shown = list.filter(function(p) {
    if (!inDateRange(p.paid_at || p.created_at, dateFrom, dateTo)) return false;
    return matchQ(q, [p.customer_name, p.order_code, p.method, p.note, p.amount]);
  });
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "To'lovlar", sub: "Qarz yozuvi. Kutilayotgan buyurtma to'lov bilan o'zi tasdiqlanmaydi." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-payment" }, /* @__PURE__ */ React.createElement("h2", null, "To'lov olish"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e);
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-42" }, "Mijoz"), /* @__PURE__ */ React.createElement(
    "select",
    {
      id: "f-42",
      value: form.customer_id,
      onChange: function(e) {
        setForm({ ...form, customer_id: e.target.value, order_id: "" });
      }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "-"),
    customers.map(function(c) {
      return /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.name);
    })
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-43" }, "Buyurtma (ixtiyoriy)"), /* @__PURE__ */ React.createElement("select", { id: "f-43", value: form.order_id, onChange: function(e) {
    setForm({ ...form, order_id: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Barcha qarzlarga (FIFO)"), orders.filter(function(o) {
    return !form.customer_id || String(o.customer_id) === String(form.customer_id);
  }).map(function(o) {
    return /* @__PURE__ */ React.createElement("option", { key: o.id, value: o.id }, o.order_code, " - qarz ", money(o.debt_amount));
  }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-44" }, "Summa *"), /* @__PURE__ */ React.createElement("input", { id: "f-44", type: "number", value: form.amount, onChange: function(e) {
    setForm({ ...form, amount: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.amount })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-45" }, "Usul"), /* @__PURE__ */ React.createElement("select", { id: "f-45", value: form.method, onChange: function(e) {
    setForm({ ...form, method: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "cash" }, "Naqd"), /* @__PURE__ */ React.createElement("option", { value: "card" }, "Karta"), /* @__PURE__ */ React.createElement("option", { value: "transfer" }, "O'tkazma"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-46" }, "Izoh"), /* @__PURE__ */ React.createElement("input", { id: "f-46", value: form.note, onChange: function(e) {
    setForm({ ...form, note: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : "Tolov qabul qilish"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "So'nggi to'lovlar (", shown.length, ")"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Qidiruv: mijoz, kod...", value: q, onChange: function(e) {
    setQ(e.target.value);
  } }), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateFrom, onChange: function(e) {
    setDateFrom(e.target.value);
  } }), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateTo, onChange: function(e) {
    setDateTo(e.target.value);
  } }), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn-ghost btn-sm",
      onClick: function() {
        downloadCsv("tolovlar.csv", shown, [
          { label: "Sana", get: function(r) {
            return ymdTashkent(r.paid_at || r.created_at);
          } },
          { label: "Mijoz", get: function(r) {
            return r.customer_name;
          } },
          { label: "Buyurtma", get: function(r) {
            return r.order_code;
          } },
          { label: "Summa", get: function(r) {
            return Math.round(Number(r.amount) || 0);
          } },
          { label: "Usul", get: function(r) {
            return r.method;
          } }
        ]);
      }
    },
    "CSV"
  )), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Sana"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Buyurtma"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Usul"))), /* @__PURE__ */ React.createElement("tbody", null, shown.map(function(p) {
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", null, p.paid_at ? new Date(p.paid_at).toLocaleString("uz-UZ") : "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, p.customer_name || "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Buyurtma" }, p.order_code || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, money(p.amount))), /* @__PURE__ */ React.createElement("td", null, p.method));
  }))))));
}
function Expenses(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ category: "", amount: "", payment_method: "cash", note: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ category: "", amount: "", payment_method: "cash", note: "" });
  const [msg, setMsg] = useAutoMsg();
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ferr, setFerr] = useState({});
  const cats = ["Elektr", "Transport", "Ijara", "Ish haqi", "Tamirlash", "Boshqa"];
  const load = useCallback(function() {
    api("/api/expenses?limit=40").then(function(r) {
      setList(r.data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  useFocusForm(props.pageFilter, "expense");
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!String(form.category || "").trim()) next.category = "Kategoriya majburiy";
    if (!(Number(form.amount) > 0)) next.amount = "Summa musbat bo'lsin";
    setFerr(next);
    if (next.category || next.amount) return;
    try {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          category: form.category,
          amount: Number(form.amount),
          payment_method: form.payment_method || "cash",
          note: form.note || null
        })
      });
      setMsg({ text: "Xarajat yozildi", type: "ok" });
      setForm({ category: "", amount: "", payment_method: "cash", note: "" });
      setFerr({});
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  function startEdit(x) {
    setEditId(x.id);
    setEditForm({
      category: x.category || "",
      amount: String(Math.round(Number(x.amount || 0))),
      payment_method: x.payment_method || "cash",
      note: x.note || ""
    });
  }
  async function saveEdit(e) {
    e.preventDefault();
    try {
      await api("/api/expenses/" + editId, {
        method: "PUT",
        body: JSON.stringify({
          category: editForm.category,
          amount: Math.round(Number(editForm.amount) || 0),
          payment_method: editForm.payment_method || "cash",
          note: editForm.note || null
        })
      });
      setMsg({ text: "Xarajat yangilandi", type: "ok" });
      setEditId(null);
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }
  const shown = list.filter(function(x) {
    if (!inDateRange(x.expense_date || x.created_at, dateFrom, dateTo)) return false;
    return matchQ(q, [x.category, x.payment_method, x.note, x.amount]);
  });
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Xarajatlar", sub: "Pul chiqimini yozing. Mahsulot tannarxi Sozlamada, bu yerga aralashmaydi." }), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("div", { className: "card", id: "form-expense" }, /* @__PURE__ */ React.createElement("h2", null, "Xarajat yozish"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit, onKeyDown: function(e) {
    formKeyDown(e, function() {
      setFerr({});
    });
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-47" }, "Kategoriya *"), /* @__PURE__ */ React.createElement("input", { id: "f-47", list: "exp-cats", value: form.category, onChange: function(e) {
    setForm({ ...form, category: e.target.value });
  } }), /* @__PURE__ */ React.createElement("datalist", { id: "exp-cats" }, cats.map(function(c) {
    return /* @__PURE__ */ React.createElement("option", { key: c, value: c });
  })), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.category })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-48" }, "Summa *"), /* @__PURE__ */ React.createElement("input", { id: "f-48", type: "number", value: form.amount, onChange: function(e) {
    setForm({ ...form, amount: e.target.value });
  } }), /* @__PURE__ */ React.createElement(FieldErr, { text: ferr.amount })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-49" }, "Usul"), /* @__PURE__ */ React.createElement("select", { id: "f-49", value: form.payment_method, onChange: function(e) {
    setForm({ ...form, payment_method: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "cash" }, "Naqd"), /* @__PURE__ */ React.createElement("option", { value: "card" }, "Karta"), /* @__PURE__ */ React.createElement("option", { value: "transfer" }, "O'tkazma"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "f-50" }, "Izoh"), /* @__PURE__ */ React.createElement("input", { id: "f-50", value: form.note, onChange: function(e) {
    setForm({ ...form, note: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Saqlash"))), editId ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Xarajatni tuzatish"), /* @__PURE__ */ React.createElement("form", { onSubmit: saveEdit, onKeyDown: function(e) {
    formKeyDown(e, function() {
      setEditId(null);
    });
  } }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kategoriya"), /* @__PURE__ */ React.createElement("input", { value: editForm.category, onChange: function(e) {
    setEditForm({ ...editForm, category: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Summa"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", step: "1", value: editForm.amount, onChange: function(e) {
    setEditForm({ ...editForm, amount: e.target.value });
  }, required: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Usul"), /* @__PURE__ */ React.createElement("select", { value: editForm.payment_method, onChange: function(e) {
    setEditForm({ ...editForm, payment_method: e.target.value });
  } }, /* @__PURE__ */ React.createElement("option", { value: "cash" }, "Naqd"), /* @__PURE__ */ React.createElement("option", { value: "card" }, "Karta"), /* @__PURE__ */ React.createElement("option", { value: "transfer" }, "O'tkazma"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Izoh"), /* @__PURE__ */ React.createElement("input", { value: editForm.note, onChange: function(e) {
    setEditForm({ ...editForm, note: e.target.value });
  } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Saqlash"), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost", type: "button", onClick: function() {
    setEditId(null);
  } }, "Bekor")))) : null, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Xarajatlar (", shown.length, ")"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Qidiruv: kategoriya, izoh...", value: q, onChange: function(e) {
    setQ(e.target.value);
  } }), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateFrom, onChange: function(e) {
    setDateFrom(e.target.value);
  } }), /* @__PURE__ */ React.createElement("input", { type: "date", value: dateTo, onChange: function(e) {
    setDateTo(e.target.value);
  } }), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "btn-ghost btn-sm",
      onClick: function() {
        downloadCsv("xarajatlar.csv", shown, [
          { label: "Sana", get: function(r) {
            return ymdTashkent(r.expense_date || r.created_at);
          } },
          { label: "Kategoriya", get: function(r) {
            return r.category;
          } },
          { label: "Summa", get: function(r) {
            return Math.round(Number(r.amount) || 0);
          } },
          { label: "Usul", get: function(r) {
            return r.payment_method;
          } },
          { label: "Izoh", get: function(r) {
            return r.note;
          } }
        ]);
      }
    },
    "CSV"
  )), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Sana"), /* @__PURE__ */ React.createElement("th", null, "Kategoriya"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Usul"), /* @__PURE__ */ React.createElement("th", null, "Izoh"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, shown.map(function(x) {
    return /* @__PURE__ */ React.createElement("tr", { key: x.id }, /* @__PURE__ */ React.createElement("td", null, x.expense_date ? new Date(x.expense_date).toLocaleDateString("uz-UZ") : "-"), /* @__PURE__ */ React.createElement("td", null, x.category), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, money(x.amount))), /* @__PURE__ */ React.createElement("td", null, x.payment_method), /* @__PURE__ */ React.createElement("td", null, x.note || "-"), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      startEdit(x);
    } }, "Tahrir")));
  }))))));
}
function RecipePanel(props) {
  const api = props.api;
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [lines, setLines] = useState([]);
  const [msg, setMsg] = useAutoMsg();
  useEffect(function() {
    Promise.all([api("/api/products?active=0"), api("/api/materials?active=0")]).then(function(arr) {
      setProducts(arr[0].data || []);
      setMaterials(arr[1].data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }, [api]);
  function matName(id) {
    const m = materials.filter(function(x) {
      return String(x.id) === String(id);
    })[0];
    return m ? m.name : "#" + id;
  }
  function openRecipe(id) {
    if (String(openId) === String(id)) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLines([]);
    api("/api/products/" + id + "/recipes").then(function(r) {
      setLines(r.data || []);
    }).catch(function(e) {
      setMsg({ text: e.message, type: "err" });
    });
  }
  return /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), /* @__PURE__ */ React.createElement("h2", null, "Retseptlar"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginBottom: 10 } }, "Har bir mahsulotning 1 donasiga ketadigan xomashyo. O'zgartirish: Mahsulotlar va narxlar \u2192 Tahrir."), products.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "Mahsulot yo'q") : /* @__PURE__ */ React.createElement("div", null, products.map(function(p) {
    const open = String(openId) === String(p.id);
    return /* @__PURE__ */ React.createElement("div", { key: p.id, style: { borderTop: "1px solid var(--border-subtle)", padding: "8px 0" } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost", onClick: function() {
      openRecipe(p.id);
    } }, open ? "Yopish" : "Ko'rish", " \xB7 ", p.sku), open ? lines.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Retsept yozilmagan") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Xomashyo"), /* @__PURE__ */ React.createElement("th", null, "Miqdor"), /* @__PURE__ */ React.createElement("th", null, "Summa"))), /* @__PURE__ */ React.createElement("tbody", null, lines.map(function(ln, i) {
      return /* @__PURE__ */ React.createElement("tr", { key: i }, /* @__PURE__ */ React.createElement("td", { "data-label": "Xomashyo" }, matName(ln.material_id)), /* @__PURE__ */ React.createElement("td", { "data-label": "Miqdor" }, ln.qty), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(ln.line_amount)));
    })))) : null);
  })));
}
function MoneyReports(props) {
  const api = props.api;
  const [dash, setDash] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [err, setErr] = useState("");
  useEffect(function() {
    Promise.all([
      api("/api/dashboard"),
      api("/api/expenses?limit=200")
    ]).then(function(arr) {
      setDash(arr[0].data || {});
      setExpenses(arr[1].data || []);
      setErr("");
    }).catch(function(e) {
      setErr(e.message);
    });
  }, [api]);
  if (err) return /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err);
  if (!dash) return /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Hisobot yuklanmoqda...");
  const byCat = {};
  expenses.forEach(function(x) {
    const k = x.category || "Boshqa";
    byCat[k] = (byCat[k] || 0) + Number(x.amount || 0);
  });
  const cats = Object.keys(byCat);
  function Kpi(props2) {
    return /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, props2.label), /* @__PURE__ */ React.createElement("div", { className: "value" + (props2.neg ? " neg" : "") }, money(props2.value)));
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Hisobot", sub: "Bugungi va shu oydagi pul. Raqamlar mavjud hisob-kitobdan." }), /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Bugun"), /* @__PURE__ */ React.createElement("div", { className: "dash-kpis cols-5" }, /* @__PURE__ */ React.createElement(Kpi, { label: "Savdo", value: dash.bugungi_savdo }), /* @__PURE__ */ React.createElement(Kpi, { label: "Tushum", value: dash.bugungi_naqd_tushum }), /* @__PURE__ */ React.createElement(Kpi, { label: "Xarajat", value: dash.bugungi_xarajat }), /* @__PURE__ */ React.createElement(Kpi, { label: "Qolgan", value: dash.bugungi_foyda, neg: Number(dash.bugungi_foyda) < 0 })), /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, "Shu oy"), /* @__PURE__ */ React.createElement("div", { className: "dash-kpis cols-5" }, /* @__PURE__ */ React.createElement(Kpi, { label: "Savdo", value: dash.oylik_savdo }), /* @__PURE__ */ React.createElement(Kpi, { label: "Tushum", value: dash.oylik_naqd_tushum }), /* @__PURE__ */ React.createElement(Kpi, { label: "Xarajat", value: dash.oylik_xarajat }), /* @__PURE__ */ React.createElement(Kpi, { label: "Qolgan", value: dash.oylik_foyda, neg: Number(dash.oylik_foyda) < 0 })), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Jami qarz"), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "value" }, money(dash.jami_qarz))), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Kim qarzdor \u2014 Mijozlar \u2192 Qarzdorlar.")), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Xarajat turlari"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "So'nggi yozuvlar bo'yicha."), cats.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "Xarajat yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Tur"), /* @__PURE__ */ React.createElement("th", null, "Summa"))), /* @__PURE__ */ React.createElement("tbody", null, cats.map(function(c) {
    return /* @__PURE__ */ React.createElement("tr", { key: c }, /* @__PURE__ */ React.createElement("td", { "data-label": "Tur" }, c), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, /* @__PURE__ */ React.createElement("strong", null, money(byCat[c]))));
  }))))));
}
function DiscountLimits(props) {
  const api = props.api;
  const onNavigate = props.onNavigate;
  const [partners, setPartners] = useState([]);
  const [err, setErr] = useState("");
  useEffect(function() {
    api("/api/partners?active=0").then(function(r) {
      setPartners(r.data || []);
    }).catch(function(e) {
      setErr(e.message);
    });
  }, [api]);
  const typeLabel = { customer: "Hamkor", dealer: "Diler", agent: "Hamkor" };
  const discLabel = { none: "Yo'q", bulk: "Yirik xarid", fixed_amount: "Doimiy so'm", fixed_percent: "Doimiy %" };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Chegirma va limitlar", sub: "Umumiy qoida shu yerda. Har bir diler yoki hamkorning o'z chegirmasi jadvalda." }), err ? /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err) : null, window.BizSettings ? React.createElement(window.BizSettings, { api }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Sozlama moduli yuklanmadi \u2014 sahifani yangilang."), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Kimda qanday chegirma"), /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Tur"), /* @__PURE__ */ React.createElement("th", null, "Chegirma"), /* @__PURE__ */ React.createElement("th", null, "Limit"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, partners.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "5" }, "Hamkor yo'q")) : partners.map(function(p) {
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, p.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Tur" }, typeLabel[p.type] || p.type), /* @__PURE__ */ React.createElement("td", { "data-label": "Chegirma" }, discLabel[p.discount_type] || p.discount_type, Number(p.discount_value) > 0 ? " \xB7 " + money(p.discount_value) : ""), /* @__PURE__ */ React.createElement("td", { "data-label": "Limit" }, money(p.credit_limit)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      if (onNavigate) onNavigate("people", { editPartnerId: p.id, openKey: "p-" + p.id });
    } }, "Tahrir")));
  }))))));
}
function PeopleHub(props) {
  const api = props.api;
  const mode = props.mode || "list";
  const onNavigate = props.onNavigate;
  const [customers, setCustomers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [fieldSales, setFieldSales] = useState([]);
  const [partnerDebt, setPartnerDebt] = useState({});
  const [tur, setTur] = useState("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useAutoMsg();
  const [editor, setEditor] = useState(null);
  const [openKey, setOpenKey] = useState("");
  const [err, setErr] = useState("");
  const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
  const pfBoot = useRef("");
  const load = useCallback(function() {
    Promise.all([
      api("/api/customers?active=0"),
      api("/api/partners?active=0"),
      api("/api/orders?limit=100"),
      api("/api/payments?limit=200"),
      api("/api/shipments?limit=100"),
      api("/api/agent/admin/waybills?scope=admin").catch(function() {
        return { data: [] };
      })
    ]).then(function(arr) {
      const parts = arr[1].data || [];
      setCustomers(arr[0].data || []);
      setPartners(parts);
      setOrders(arr[2].data || []);
      setPayments(arr[3].data || []);
      setShipments(arr[4].data || []);
      setFieldSales(arr[5].data || []);
      setErr("");
      return Promise.all(parts.map(function(p) {
        return api("/api/partners/" + p.id + "/debt").then(function(r) {
          return { id: p.id, debt: r.data || null };
        }).catch(function() {
          return { id: p.id, debt: null };
        });
      }));
    }).then(function(rows2) {
      const map = {};
      (rows2 || []).forEach(function(x) {
        map[x.id] = x.debt;
      });
      setPartnerDebt(map);
    }).catch(function(e) {
      setErr(e.message);
    });
  }, [api]);
  useEffect(function() {
    load();
  }, [load]);
  useEffect(function() {
    const pf = props.pageFilter || {};
    const key = [pf.editCustomerId || "", pf.editPartnerId || "", pf.openKey || ""].join("|");
    if (!pf.editCustomerId && !pf.editPartnerId && !pf.openKey) return;
    if (pf.editPartnerId && !partners.length) return;
    if (pfBoot.current === key) return;
    pfBoot.current = key;
    if (pf.editCustomerId) setEditor({ kind: "customer", id: pf.editCustomerId });
    if (pf.editPartnerId) {
      const p = partners.find(function(x) {
        return String(x.id) === String(pf.editPartnerId);
      });
      setEditor({ kind: "partner", id: pf.editPartnerId, presetType: p ? p.type : "dealer" });
    }
    if (pf.openKey) setOpenKey(String(pf.openKey));
  }, [props.pageFilter, partners]);
  function debtForCustomer(c) {
    const fromOrders = orders.reduce(function(s, o) {
      if (String(o.customer_id || "") !== String(c.id)) return s;
      return s + Number(o.debt_amount || 0);
    }, 0);
    const fromField = fieldSales.reduce(function(s, w) {
      if (String(w.customer_id || "") !== String(c.id)) return s;
      return s + Number(w.debt_amount || 0);
    }, 0);
    return fromOrders + fromField;
  }
  const rows = [];
  customers.forEach(function(c) {
    rows.push({
      key: "c-" + c.id,
      kind: "customer",
      id: c.id,
      tur: "chakana",
      turLabel: "Chakana",
      name: c.name || "",
      phone: c.phone || "",
      address: c.address || "",
      active: c.is_active !== false,
      debt: debtForCustomer(c),
      limit: c.credit_limit
    });
  });
  partners.forEach(function(p) {
    const isDealer = p.type === "dealer";
    const d = partnerDebt[p.id];
    rows.push({
      key: "p-" + p.id,
      kind: "partner",
      id: p.id,
      tur: isDealer ? "diler" : "hamkor",
      turLabel: isDealer ? "Diler" : "Hamkor",
      name: p.name || "",
      phone: p.phone || "",
      address: p.address || "",
      active: p.is_active !== false,
      debt: d ? Number(d.estimated_balance || 0) : 0,
      debtInfo: d,
      limit: p.credit_limit,
      partnerType: p.type
    });
  });
  const shown = rows.filter(function(r) {
    if (tur !== "all" && r.tur !== tur) return false;
    if (mode === "debtors" && !(Number(r.debt) > 0)) return false;
    return matchQ(q, [r.name, r.phone, r.turLabel, r.address]);
  }).sort(function(a, b) {
    return Number(b.debt) - Number(a.debt) || String(a.name).localeCompare(String(b.name), "uz");
  });
  const opened = rows.filter(function(r) {
    return r.key === openKey;
  })[0] || null;
  const cardOrders = opened ? orders.filter(function(o) {
    if (opened.kind === "customer") return String(o.customer_id || "") === String(opened.id);
    return String(o.partner_id || "") === String(opened.id);
  }) : [];
  const cardPays = opened ? payments.filter(function(p) {
    if (opened.kind === "customer") return String(p.customer_id || "") === String(opened.id);
    return String(p.partner_id || "") === String(opened.id);
  }) : [];
  const cardShips = opened && opened.kind === "partner" ? shipments.filter(function(s) {
    return String(s.to_partner_id || "") === String(opened.id);
  }) : [];
  function askOff(row) {
    setConfirmState({
      open: true,
      text: row.name + " ni nofaol qilish? Ma'lumot o'chmaydi, ro'yxatdan yashirinadi.",
      onConfirm: async function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
        try {
          const path = row.kind === "customer" ? "/api/customers/" : "/api/partners/";
          await api(path + row.id, { method: "DELETE" });
          setMsg({ text: "Nofaol qilindi", type: "ok" });
          setOpenKey("");
          load();
        } catch (e) {
          setMsg({ text: e.message, type: "err" });
        }
      }
    });
  }
  function saved(text) {
    setMsg({ text: text || "Saqlandi", type: "ok" });
    setEditor(null);
    load();
  }
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    ConfirmModal,
    {
      open: confirmState.open,
      text: confirmState.text,
      onCancel: function() {
        setConfirmState({ open: false, text: "", onConfirm: null });
      },
      onConfirm: function() {
        if (confirmState.onConfirm) confirmState.onConfirm();
      }
    }
  ), /* @__PURE__ */ React.createElement(
    PageHead,
    {
      title: mode === "debtors" ? "Qarzdorlar" : "Mijozlar va qarzlar",
      sub: "Chakana, diler va hamkor bitta ro'yxatda. Jadvallar alohida qoladi."
    }
  ), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
    setMsg({});
  } }), err ? /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err) : null, /* @__PURE__ */ React.createElement("div", { className: "chip-row", role: "tablist" }, [["all", "Hammasi"], ["chakana", "Chakana"], ["diler", "Diler"], ["hamkor", "Hamkor"]].map(function(pair) {
    return /* @__PURE__ */ React.createElement("button", { key: pair[0], type: "button", className: tur === pair[0] ? "on" : "", onClick: function() {
      setTur(pair[0]);
    } }, pair[1]);
  })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: function() {
    setEditor({ kind: "customer" });
  } }, "+ Chakana"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: function() {
    setEditor({ kind: "partner", presetType: "dealer" });
  } }, "+ Diler"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: function() {
    setEditor({ kind: "partner", presetType: "agent" });
  } }, "+ Hamkor")), editor && editor.kind === "customer" ? /* @__PURE__ */ React.createElement(Customers, { api, hideList: true, includeInactive: true, initialEditId: editor.id || null, hideCreate: !!editor.id, onSaved: saved }) : null, editor && editor.kind === "partner" ? window.Partners ? React.createElement(window.Partners, {
    api,
    hideList: true,
    includeInactive: true,
    presetType: editor.presetType || "dealer",
    initialEditId: editor.id || null,
    onSaved: saved
  }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Hamkor moduli yuklanmadi \u2014 sahifani yangilang.") : null, /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, mode === "debtors" ? "Qarzi borlar" : "Ro'yxat", " (", shown.length, ")"), /* @__PURE__ */ React.createElement("input", { type: "search", placeholder: "Ism yoki telefon", value: q, onChange: function(e) {
    setQ(e.target.value);
  } })), shown.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "users", title: "Hech kim yo'q", sub: mode === "debtors" ? "Qarzdor topilmadi" : "Yuqoridan qo'shing" }) : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Tur"), /* @__PURE__ */ React.createElement("th", null, "Telefon"), /* @__PURE__ */ React.createElement("th", null, "Qarz"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, shown.map(function(r) {
    return /* @__PURE__ */ React.createElement("tr", { key: r.key }, /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setOpenKey(openKey === r.key ? "" : r.key);
    } }, r.name)), /* @__PURE__ */ React.createElement("td", { "data-label": "Tur" }, r.turLabel), /* @__PURE__ */ React.createElement("td", { "data-label": "Telefon" }, r.phone || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, /* @__PURE__ */ React.createElement("strong", { className: Number(r.debt) > 0 ? "neg" : "" }, money(r.debt))), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, r.active ? "faol" : "nofaol"), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setOpenKey(r.key);
    } }, "Karta"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setEditor(r.kind === "customer" ? { kind: "customer", id: r.id } : { kind: "partner", id: r.id, presetType: r.partnerType || "agent" });
    } }, "Tahrir")));
  }))))), opened ? /* @__PURE__ */ React.createElement("div", { className: "card person-card" }, /* @__PURE__ */ React.createElement("h2", null, opened.name), /* @__PURE__ */ React.createElement("p", { className: "muted" }, opened.turLabel, opened.phone ? " \xB7 " + opened.phone : "", opened.address ? " \xB7 " + opened.address : ""), /* @__PURE__ */ React.createElement("div", { className: "dash-kpis" }, /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "Qarz"), /* @__PURE__ */ React.createElement("div", { className: "value" + (Number(opened.debt) > 0 ? " neg" : "") }, money(opened.debt))), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "Limit"), /* @__PURE__ */ React.createElement("div", { className: "value" }, money(opened.limit)))), opened.debtInfo ? /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Buyurtma qarzi ", money(opened.debtInfo.order_debt), " \xB7 berilgan tovar ", money(opened.debtInfo.shipped_amount), " \xB7 to'langan ", money(opened.debtInfo.paid_amount)) : null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 12px" } }, opened.kind === "customer" ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", onClick: function() {
    if (onNavigate) onNavigate("payments", { focusForm: "payment", customerId: opened.id });
  } }, "To'lov olish") : null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost", onClick: function() {
    askOff(opened);
  } }, "Nofaol qilish")), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem", margin: "8px 0" } }, "Buyurtmalar"), cardOrders.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Buyurtma yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Qarz"), /* @__PURE__ */ React.createElement("th", null, "Holat"))), /* @__PURE__ */ React.createElement("tbody", null, cardOrders.map(function(o) {
    return /* @__PURE__ */ React.createElement("tr", { key: o.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, o.order_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(o.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(o.debt_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: o.status })));
  })))), opened.kind === "customer" ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem", margin: "12px 0 8px" } }, "Yuk tarqatish"), fieldSales.filter(function(w) {
    return String(w.customer_id || "") === String(opened.id);
  }).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Yuk xati yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Qarz"))), /* @__PURE__ */ React.createElement("tbody", null, fieldSales.filter(function(w) {
    return String(w.customer_id || "") === String(opened.id);
  }).map(function(w) {
    return /* @__PURE__ */ React.createElement("tr", { key: w.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, w.waybill_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(w.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(w.debt_amount)));
  }))))) : null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem", margin: "12px 0 8px" } }, "To'lovlar"), cardPays.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "To'lov yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Sana"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Usul"))), /* @__PURE__ */ React.createElement("tbody", null, cardPays.map(function(p) {
    return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Sana" }, p.paid_at ? new Date(p.paid_at).toLocaleDateString("uz-UZ") : "-"), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(p.amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Usul" }, p.method));
  })))), opened.kind === "partner" ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem", margin: "12px 0 8px" } }, "Dilerlarga berilgan tovar"), cardShips.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Berilgan tovar yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Dona"), /* @__PURE__ */ React.createElement("th", null, "Summa"))), /* @__PURE__ */ React.createElement("tbody", null, cardShips.map(function(s) {
    return /* @__PURE__ */ React.createElement("tr", { key: s.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, s.shipment_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, s.sku), /* @__PURE__ */ React.createElement("td", { "data-label": "Dona" }, s.qty), /* @__PURE__ */ React.createElement("td", { "data-label": "Summa" }, money(s.total_amount)));
  }))))) : null) : null);
}
function App() {
  const apiHook = useApi();
  const api = apiHook.api;
  const apiBase = apiHook.apiBase;
  const adminKey = apiHook.adminKey;
  const saveSettings = apiHook.saveSettings;
  const logout = apiHook.logout;
  const operatorName = apiHook.operatorName || "Admin";
  const [pageFilter, setPageFilter] = useState({});
  const [moduleId, setModuleId] = useState("bugun");
  const [tab, setTab] = useState("dashboard");
  const [moreOpen, setMoreOpen] = useState(false);
  const [agentsUi, setAgentsUi] = useState(false);
  useEffect(function() {
    if (!adminKey) return;
    api("/api/settings").then(function(r) {
      const v = String(r.data && r.data.agents_ui_enabled || "").toLowerCase();
      setAgentsUi(v === "1" || v === "true" || v === "yes");
    }).catch(function() {
      setAgentsUi(false);
    });
  }, [adminKey, api, tab]);
  useEffect(function() {
    if (!agentsUi && tab === "agents") {
      setModuleId("mijozlar");
      setTab("people");
    }
  }, [agentsUi, tab]);
  if (!adminKey) {
    return /* @__PURE__ */ React.createElement(
      LoginScreen,
      {
        apiBase,
        onLogin: function(k, remember) {
          saveSettings(apiBase || window.location.origin, k, "Admin", remember);
        }
      }
    );
  }
  function NavIcon(props) {
    return /* @__PURE__ */ React.createElement(Ico, { name: props.name });
  }
  const modules = [
    {
      id: "bugun",
      label: "Bugun",
      short: "Bugun",
      ico: "layout",
      bottom: true,
      tabs: [{ id: "dashboard", label: "Bugun" }]
    },
    {
      id: "sotuv",
      label: "Sotuv",
      short: "Sotuv",
      ico: "cart",
      bottom: true,
      tabs: [
        { id: "orders", label: "Buyurtmalar" },
        { id: "yuk-open", label: "Yuk tarqatish", href: "/yuk" },
        { id: "yukxati", label: "Tarix", sub: true },
        { id: "shipments", label: "Dilerlarga berilgan tovar" }
      ]
    },
    {
      id: "ishlab",
      label: "Ishlab chiqarish",
      short: "Ishlab chiqarish",
      ico: "factory",
      bottom: true,
      tabs: [
        { id: "batches", label: "Partiyalar" },
        { id: "packaging", label: "Qadoqlash" }
      ]
    },
    {
      id: "ombor",
      label: "Ombor",
      short: "Ombor",
      ico: "box",
      bottom: true,
      tabs: [
        { id: "stock-ready", label: "Tayyor mahsulot" },
        { id: "stock-raw", label: "Xomashyo" }
      ]
    },
    {
      id: "mijozlar",
      label: "Mijozlar va qarzlar",
      short: "Mijozlar",
      ico: "users",
      bottom: true,
      tabs: [
        { id: "people", label: "Ro'yxat" },
        { id: "people-debt", label: "Qarzdorlar" },
        { id: "payments", label: "To'lovlar" },
        { id: "agents", label: "Agentlar" }
      ]
    },
    {
      id: "pul",
      label: "Pul va hisobotlar",
      short: "Pul",
      ico: "coin",
      bottom: false,
      tabs: [
        { id: "expenses", label: "Xarajatlar" },
        { id: "reports", label: "Hisobot" }
      ]
    },
    {
      id: "sozlama",
      label: "Sozlamalar",
      short: "Sozlama",
      ico: "catalog",
      bottom: false,
      tabs: [
        { id: "products", label: "Mahsulotlar va narxlar" },
        { id: "materials", label: "Xomashyo va retseptlar" },
        { id: "limits", label: "Chegirma va limitlar" },
        { id: "settings", label: "Sozlama" }
      ]
    }
  ];
  const visModules = modules.map(function(m) {
    if (m.id !== "mijozlar" || agentsUi) return m;
    return Object.assign({}, m, {
      tabs: m.tabs.filter(function(t) {
        return t.id !== "agents";
      })
    });
  });
  const currentModule = visModules.find(function(m) {
    return m.id === moduleId;
  }) || visModules[0] || modules[0];
  const currentTab = (currentModule && currentModule.tabs || []).find(function(x) {
    return x.id === tab;
  }) || currentModule && currentModule.tabs[0] || { id: tab, label: tab };
  function openModule(id) {
    const m = visModules.find(function(x) {
      return x.id === id;
    });
    if (!m) return;
    setModuleId(id);
    setTab(m.tabs[0].id);
    setPageFilter({});
  }
  function openSub(id) {
    setTab(id);
    setPageFilter({});
  }
  function goTo(tabId, extra) {
    const alias = {
      stock: "stock-ready",
      customers: "people",
      partners: "people"
    };
    const want = alias[tabId] || tabId;
    let found = null;
    visModules.forEach(function(m) {
      m.tabs.forEach(function(t) {
        if (t.id === want) found = { mid: m.id, tid: t.id };
      });
    });
    if (!found) return;
    setModuleId(found.mid);
    setTab(found.tid);
    setPageFilter(extra || {});
    setMoreOpen(false);
  }
  const TAB_ICO = {
    dashboard: "layout",
    batches: "factory",
    packaging: "box",
    "stock-ready": "box",
    "stock-raw": "catalog",
    orders: "cart",
    payments: "coin",
    shipments: "truck",
    materials: "catalog",
    expenses: "coin",
    products: "box",
    people: "users",
    "people-debt": "users",
    agents: "users",
    yukxati: "box",
    "yuk-open": "box",
    reports: "coin",
    limits: "catalog",
    settings: "catalog"
  };
  const bottomModules = visModules.filter(function(m) {
    return m.bottom;
  });
  const moreModules = visModules.filter(function(m) {
    return !m.bottom;
  });
  const moreActive = moreModules.some(function(m) {
    return m.id === moduleId;
  });
  let content = null;
  if (tab === "dashboard") content = /* @__PURE__ */ React.createElement(Dashboard, { api, onNavigate: goTo });
  else if (tab === "stock" || tab === "stock-ready") content = /* @__PURE__ */ React.createElement(Stock, { api, part: "products" });
  else if (tab === "stock-raw") content = /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Stock, { api, part: "materials" }), /* @__PURE__ */ React.createElement(Materials, { api, part: "inbound" }));
  else if (tab === "batches") content = /* @__PURE__ */ React.createElement(Batches, { api, pageFilter });
  else if (tab === "packaging") content = /* @__PURE__ */ React.createElement(Packaging, { api });
  else if (tab === "orders") content = /* @__PURE__ */ React.createElement(Orders, { api, pageFilter });
  else if (tab === "payments") content = /* @__PURE__ */ React.createElement(Payments, { api, pageFilter });
  else if (tab === "expenses") content = /* @__PURE__ */ React.createElement(Expenses, { api, pageFilter });
  else if (tab === "reports") content = /* @__PURE__ */ React.createElement(MoneyReports, { api });
  else if (tab === "products") content = /* @__PURE__ */ React.createElement(Products, { api });
  else if (tab === "materials") content = /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(PageHead, { title: "Xomashyo va retseptlar", sub: "Xomashyo nomlari shu yerda. Kirim Ombor \u2192 Xomashyo da." }), /* @__PURE__ */ React.createElement(Materials, { api, part: "catalog" }), /* @__PURE__ */ React.createElement(RecipePanel, { api }));
  else if (tab === "limits") content = /* @__PURE__ */ React.createElement(DiscountLimits, { api, onNavigate: goTo });
  else if (tab === "yukxati") content = window.YukXatiPanel ? React.createElement(window.YukXatiPanel, { api, apiBase, adminKey }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Yuk xati moduli yuklanmadi \u2014 sahifani yangilang.");
  else if (tab === "agents") content = window.AgentsPanel ? React.createElement(window.AgentsPanel, { api }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Agentlar moduli yuklanmadi \u2014 sahifani yangilang.");
  else if (tab === "people" || tab === "people-debt" || tab === "customers" || tab === "partners") content = /* @__PURE__ */ React.createElement(PeopleHub, { api, mode: tab === "people-debt" ? "debtors" : "list", pageFilter, onNavigate: goTo });
  else if (tab === "shipments") content = window.Shipments ? React.createElement(window.Shipments, { api }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Diler moduli yuklanmadi \u2014 sahifani yangilang.");
  else if (tab === "settings") content = window.BizSettings ? React.createElement(window.BizSettings, { api }) : /* @__PURE__ */ React.createElement("div", { className: "card" }, "Sozlama moduli yuklanmadi \u2014 sahifani yangilang.");
  return /* @__PURE__ */ React.createElement("div", { className: "shell" }, /* @__PURE__ */ React.createElement("aside", { className: "sidebar", "aria-label": "Sahifalar" }, /* @__PURE__ */ React.createElement("div", { className: "sidebar-brand" }, "Black Diamond"), visModules.map(function(m) {
    return /* @__PURE__ */ React.createElement("div", { key: m.id }, /* @__PURE__ */ React.createElement("div", { className: "sidebar-group" }, m.short), m.tabs.map(function(t) {
      var cls = (tab === t.id ? "active" : "") + (t.sub ? " sub" : "");
      if (t.href) {
        return /* @__PURE__ */ React.createElement("a", { key: t.id, href: t.href, className: cls }, /* @__PURE__ */ React.createElement("span", { className: "nav-ico" }, /* @__PURE__ */ React.createElement(NavIcon, { name: TAB_ICO[t.id] || m.ico })), t.label);
      }
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: t.id,
          type: "button",
          className: cls,
          onClick: function() {
            setModuleId(m.id);
            setTab(t.id);
            setPageFilter({});
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "nav-ico" }, /* @__PURE__ */ React.createElement(NavIcon, { name: TAB_ICO[t.id] || m.ico })),
        t.label
      );
    }));
  })), /* @__PURE__ */ React.createElement("div", { className: "header" }, /* @__PURE__ */ React.createElement("div", { className: "header-inner" }, /* @__PURE__ */ React.createElement("div", { className: "header-mark" }, /* @__PURE__ */ React.createElement("img", { src: "/bd_logo.jpg", alt: "" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", null, "Black Diamond OPS", currentTab ? " \xB7 " + currentTab.label : ""), /* @__PURE__ */ React.createElement("p", { className: "crumb" }, currentModule ? currentModule.label : "", currentTab && currentModule && currentTab.label !== currentModule.label ? " \u2192 " : "", currentTab && currentModule && currentTab.label !== currentModule.label ? /* @__PURE__ */ React.createElement("b", null, currentTab.label) : null, operatorName ? " \xB7 " + operatorName : "")), /* @__PURE__ */ React.createElement("div", { className: "header-right" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "logout-btn", onClick: logout }, "Chiqish")))), /* @__PURE__ */ React.createElement("div", { className: "main" }, currentModule && currentModule.tabs.length > 1 ? /* @__PURE__ */ React.createElement("div", { className: "segment mobile-only" }, currentModule.tabs.map(function(t) {
    if (t.href) {
      return /* @__PURE__ */ React.createElement("a", { key: t.id, href: t.href }, t.label);
    }
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        type: "button",
        className: tab === t.id ? "active" : "",
        onClick: function() {
          openSub(t.id);
        }
      },
      t.label
    );
  })) : null, content), /* @__PURE__ */ React.createElement("nav", { className: "bottom-nav", "aria-label": "Asosiy menyu" }, bottomModules.map(function(m) {
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: m.id,
        type: "button",
        className: moduleId === m.id ? "active" : "",
        onClick: function() {
          setMoreOpen(false);
          openModule(m.id);
        },
        "aria-current": moduleId === m.id ? "page" : void 0
      },
      /* @__PURE__ */ React.createElement("span", { className: "nav-ico" }, /* @__PURE__ */ React.createElement(NavIcon, { name: m.ico })),
      /* @__PURE__ */ React.createElement("span", { className: "nav-label" }, m.short)
    );
  }), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: moreActive || moreOpen ? "active" : "",
      onClick: function() {
        setMoreOpen(function(v) {
          return !v;
        });
      },
      "aria-expanded": moreOpen ? "true" : "false"
    },
    /* @__PURE__ */ React.createElement("span", { className: "nav-ico" }, /* @__PURE__ */ React.createElement(NavIcon, { name: "more" })),
    /* @__PURE__ */ React.createElement("span", { className: "nav-label" }, "Yana")
  )), /* @__PURE__ */ React.createElement("div", { className: "more-backdrop" + (moreOpen ? " open" : ""), onClick: function() {
    setMoreOpen(false);
  } }, /* @__PURE__ */ React.createElement("div", { className: "more-sheet", role: "dialog", "aria-label": "Yana", onClick: function(e) {
    e.stopPropagation();
  } }, /* @__PURE__ */ React.createElement("h2", null, "Yana"), moreModules.map(function(m) {
    return /* @__PURE__ */ React.createElement("div", { key: m.id }, m.tabs.map(function(t) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: t.id,
          type: "button",
          className: "more-item",
          onClick: function() {
            setModuleId(m.id);
            setTab(t.id);
            setPageFilter({});
            setMoreOpen(false);
          }
        },
        m.label,
        " \xB7 ",
        t.label
      );
    }));
  }))));
}
function labelTables() {
  try {
    document.querySelectorAll(".table-wrap table").forEach(function(table) {
      var headers = Array.prototype.map.call(
        table.querySelectorAll("thead th"),
        function(th) {
          return (th.textContent || "").trim();
        }
      );
      if (!headers.length) return;
      table.querySelectorAll("tbody tr").forEach(function(tr) {
        var cells = tr.querySelectorAll("td");
        var hi = 0;
        for (var i = 0; i < cells.length; i++) {
          var cell = cells[i];
          if (cell.getAttribute("data-label")) {
            hi++;
            continue;
          }
          var span = Number(cell.getAttribute("colSpan") || cell.getAttribute("colspan") || 1);
          if (headers[hi]) cell.setAttribute("data-label", headers[hi]);
          hi += span;
        }
      });
    });
  } catch (e) {
  }
}
var _labelTimer = null;
function scheduleLabelTables() {
  if (_labelTimer) clearTimeout(_labelTimer);
  _labelTimer = setTimeout(function() {
    labelTables();
  }, 30);
}
function armLabelTables() {
  try {
    var root = document.getElementById("root");
    if (root && typeof MutationObserver !== "undefined") {
      if (!window.__bdTblObs) {
        window.__bdTblObs = new MutationObserver(function() {
          scheduleLabelTables();
        });
        window.__bdTblObs.observe(root, { childList: true, subtree: true });
      }
    }
    scheduleLabelTables();
    setTimeout(labelTables, 120);
    setTimeout(labelTables, 600);
  } catch (e2) {
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", armLabelTables);
} else {
  armLabelTables();
}
(function bootAdmin() {
  if (!window.React || !window.ReactDOM) {
    setTimeout(bootAdmin, 40);
    return;
  }
  var el = document.getElementById("root");
  if (!el) {
    setTimeout(bootAdmin, 40);
    return;
  }
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.ready();
      if (tg.expand) tg.expand();
    }
  } catch (e1) {
  }
  const root = ReactDOM.createRoot(el);
  root.render(/* @__PURE__ */ React.createElement(App, null));
  armLabelTables();
})();
