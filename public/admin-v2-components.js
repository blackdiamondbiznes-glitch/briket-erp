(function() {
  "use strict";
  const { useState, useEffect, useCallback, useRef } = React;
  function money(n) {
    var v = Math.round(Number(n || 0));
    var body = Math.abs(v).toLocaleString("uz-UZ");
    return (v < 0 ? "\u2212" : "") + body;
  }
  function Msg(props) {
    useEffect(function() {
      if (!props.text || !props.onClose) return;
      var ms = props.type === "err" ? 6e3 : 2500;
      var id = setTimeout(props.onClose, ms);
      return function() {
        clearTimeout(id);
      };
    }, [props.text, props.type, props.onClose]);
    if (!props.text) return null;
    return /* @__PURE__ */ React.createElement("div", { className: "msg toast " + (props.type || "ok"), onClick: props.onClose, role: "status" }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, props.text), /* @__PURE__ */ React.createElement("button", { type: "button", className: "msg-x", "aria-label": "Yopish", onClick: props.onClose }, "\xD7"));
  }
  function V2Empty(props) {
    return /* @__PURE__ */ React.createElement("div", { className: "empty-state empty" }, /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, props.title || "Ro'yxat bo'sh"), props.sub ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, props.sub) : null);
  }
  function V2ConfirmModal(props) {
    useEffect(function() {
      if (!props.open || props.money) return void 0;
      var tg2 = window.Telegram && window.Telegram.WebApp;
      var platform2 = tg2 ? String(tg2.platform || "") : "";
      var inside2 = !!(tg2 && (tg2.initData || platform2 && platform2 !== "unknown"));
      if (!inside2 || typeof tg2.showConfirm !== "function") return void 0;
      var settled = false;
      try {
        tg2.showConfirm(props.text || "", function(ok) {
          if (settled) return;
          settled = true;
          if (ok) props.onConfirm();
          else props.onCancel();
        });
      } catch (e) {
        return void 0;
      }
      return function() {
        settled = true;
      };
    }, [props.open, props.money, props.text, props.onConfirm, props.onCancel]);
    if (!props.open) return null;
    var tg = window.Telegram && window.Telegram.WebApp;
    var platform = tg ? String(tg.platform || "") : "";
    var inside = !!(tg && (tg.initData || platform && platform !== "unknown") && typeof tg.showConfirm === "function");
    if (!props.money && inside) return null;
    return /* @__PURE__ */ React.createElement("div", { className: "bd-sheet-back", role: "presentation", onClick: props.onCancel }, /* @__PURE__ */ React.createElement("div", { className: "bd-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "v2-confirm-title", onClick: function(e) {
      e.stopPropagation();
    } }, /* @__PURE__ */ React.createElement("h2", { id: "v2-confirm-title" }, props.title || (props.money ? "Pul amali" : "Tasdiqlash")), /* @__PURE__ */ React.createElement("p", { className: "bd-sheet-text" }, props.text), props.detail ? /* @__PURE__ */ React.createElement("p", { className: "bd-sheet-detail" }, props.detail) : null, /* @__PURE__ */ React.createElement("div", { className: "bd-sheet-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost", type: "button", onClick: props.onCancel }, "Bekor"), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "button", onClick: props.onConfirm }, "Tasdiqlash"))));
  }
  function matchQ(q, parts) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return true;
    return parts.some(function(p) {
      return String(p == null ? "" : p).toLowerCase().indexOf(s) !== -1;
    });
  }
  window.Partners = function Partners(props) {
    const api = props.api;
    const [list, setList] = useState([]);
    const [filter, setFilter] = useState("");
    const [q, setQ] = useState("");
    const [form, setForm] = useState({
      name: "",
      phone: "",
      address: "",
      type: "customer",
      parent_id: "",
      region: "",
      district: "",
      discount_type: "none",
      discount_value: "",
      credit_limit: "",
      note: ""
    });
    const [editId, setEditId] = useState(null);
    const [msg, setMsg] = useState({});
    const [ferr, setFerr] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirmState, setConfirmState] = useState({ open: false, id: null });
    const [extraOpen, setExtraOpen] = useState(false);
    const load = useCallback(function() {
      const qs = [];
      if (filter) qs.push("type=" + encodeURIComponent(filter));
      if (props.includeInactive) qs.push("active=0");
      api("/api/partners" + (qs.length ? "?" + qs.join("&") : "")).then(function(r) {
        setList(r.data || []);
      }).catch(function(e) {
        setMsg({ text: e.message, type: "err" });
      });
    }, [api, filter, props.includeInactive]);
    useEffect(function() {
      load();
    }, [load]);
    useEffect(function() {
      if (props.initialEditId) return;
      if (!props.presetType) return;
      setForm(function(f) {
        return Object.assign({}, f, { type: props.presetType });
      });
    }, [props.presetType, props.initialEditId]);
    const dealers = list.filter(function(p) {
      return p.type === "dealer";
    });
    function resetForm() {
      setForm({
        name: "",
        phone: "",
        address: "",
        type: "customer",
        parent_id: "",
        region: "",
        district: "",
        discount_type: "none",
        discount_value: "",
        credit_limit: "",
        note: ""
      });
      setEditId(null);
      setFerr({});
      setExtraOpen(false);
    }
    async function submit(e) {
      e.preventDefault();
      const next = {};
      if (!String(form.name || "").trim()) next.name = "Ism majburiy";
      setFerr(next);
      if (next.name) return;
      if (busy) return;
      setBusy(true);
      try {
        const body = {
          name: form.name,
          phone: form.phone || null,
          address: form.address || null,
          type: form.type,
          parent_id: form.parent_id ? Number(form.parent_id) : null,
          region: form.region || null,
          district: form.district || null,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value) || 0,
          credit_limit: Number(form.credit_limit) || 0,
          note: form.note || null
        };
        if (editId) {
          await api("/api/partners/" + editId, { method: "PUT", body: JSON.stringify(body) });
          if (typeof props.onSaved === "function") props.onSaved("Hamkor yangilandi");
          else setMsg({ text: "Hamkor yangilandi", type: "ok" });
        } else {
          await api("/api/partners", { method: "POST", body: JSON.stringify(body) });
          if (typeof props.onSaved === "function") props.onSaved("Hamkor qo'shildi");
          else setMsg({ text: "Hamkor qo'shildi", type: "ok" });
        }
        resetForm();
        load();
      } catch (err) {
        setMsg({ text: err.message, type: "err" });
      }
      setBusy(false);
    }
    function startEdit(p) {
      setEditId(p.id);
      setFerr({});
      setForm({
        name: p.name || "",
        phone: p.phone || "",
        address: p.address || "",
        type: p.type || "customer",
        parent_id: p.parent_id ? String(p.parent_id) : "",
        region: p.region || "",
        district: p.district || "",
        discount_type: p.discount_type || "none",
        discount_value: p.discount_value != null ? String(p.discount_value) : "",
        credit_limit: p.credit_limit != null ? String(p.credit_limit) : "",
        note: p.note || ""
      });
      const hasExtra = !!(p.phone || p.address || p.region || p.district || p.note || p.parent_id || Number(p.discount_value) || Number(p.credit_limit) || p.discount_type && p.discount_type !== "none");
      setExtraOpen(hasExtra);
      setTimeout(function() {
        var el = document.getElementById("v2-partner-form");
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    function askDelete(id) {
      setConfirmState({ open: true, id });
    }
    async function doDelete() {
      const id = confirmState.id;
      setConfirmState({ open: false, id: null });
      if (!id) return;
      try {
        await api("/api/partners/" + id, { method: "DELETE" });
        setMsg({ text: "Nofaol qilindi", type: "ok" });
        load();
      } catch (err) {
        setMsg({ text: err.message, type: "err" });
      }
    }
    const editBoot = useRef(null);
    useEffect(function() {
      if (!props.initialEditId || !list.length) return;
      if (editBoot.current === String(props.initialEditId)) return;
      var p = list.find(function(x) {
        return String(x.id) === String(props.initialEditId);
      });
      if (!p) return;
      editBoot.current = String(props.initialEditId);
      startEdit(p);
    }, [list, props.initialEditId]);
    const typeLabel = { customer: "Hamkor", dealer: "Diler", agent: "Hamkor" };
    const discLabel = { none: "Yoq", bulk: "Bulk (500+)", fixed_amount: "Doimiy som", fixed_percent: "Doimiy %" };
    const shown = list.filter(function(p) {
      return matchQ(q, [p.name, p.phone, p.type, typeLabel[p.type], p.region, p.district, p.parent_name, p.note]);
    });
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
      V2ConfirmModal,
      {
        open: confirmState.open,
        text: "Hamkorni ochirish (nofaol qilish)?",
        onCancel: function() {
          setConfirmState({ open: false, id: null });
        },
        onConfirm: doDelete
      }
    ), /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
      setMsg({});
    } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, editId ? "Tahrirlash" : form.type === "dealer" ? "Yangi diler" : "Yangi hamkor"), /* @__PURE__ */ React.createElement("div", { className: "hint-box" }, "Diler va hamkor alohida jadvalda. Chakana mijoz \u2014 Mijozlar ro'yxatidagi boshqa tugma."), /* @__PURE__ */ React.createElement("form", { id: "v2-partner-form", onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Ism *"), /* @__PURE__ */ React.createElement("input", { value: form.name, onChange: function(e) {
      setForm(Object.assign({}, form, { name: e.target.value }));
    } }), ferr.name ? /* @__PURE__ */ React.createElement("div", { className: "field-error" }, ferr.name) : null), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Tur *"), /* @__PURE__ */ React.createElement("select", { value: form.type, onChange: function(e) {
      setForm(Object.assign({}, form, { type: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "dealer" }, "Diler"), /* @__PURE__ */ React.createElement("option", { value: "agent" }, "Hamkor"), /* @__PURE__ */ React.createElement("option", { value: "customer" }, "Hamkor (oddiy)")))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm extra-toggle", onClick: function() {
      setExtraOpen(!extraOpen);
    } }, extraOpen ? "Qo'shimchani yashirish" : "Qo'shimcha"), extraOpen ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Telefon"), /* @__PURE__ */ React.createElement("input", { value: form.phone, onChange: function(e) {
      setForm(Object.assign({}, form, { phone: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Manzil"), /* @__PURE__ */ React.createElement("input", { value: form.address, onChange: function(e) {
      setForm(Object.assign({}, form, { address: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Chegirma turi"), /* @__PURE__ */ React.createElement("select", { value: form.discount_type, onChange: function(e) {
      setForm(Object.assign({}, form, { discount_type: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "none" }, "Yo'q"), /* @__PURE__ */ React.createElement("option", { value: "bulk" }, "Yirik xarid"), /* @__PURE__ */ React.createElement("option", { value: "fixed_amount" }, "Doimiy (so'm/dona)"), /* @__PURE__ */ React.createElement("option", { value: "fixed_percent" }, "Doimiy (%)"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Chegirma qiymati"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.discount_value, onChange: function(e) {
      setForm(Object.assign({}, form, { discount_value: e.target.value }));
    }, placeholder: "3000 yoki 10" }))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kredit limiti"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.credit_limit, onChange: function(e) {
      setForm(Object.assign({}, form, { credit_limit: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Bog'langan diler"), /* @__PURE__ */ React.createElement("select", { value: form.parent_id, onChange: function(e) {
      setForm(Object.assign({}, form, { parent_id: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014"), dealers.map(function(d) {
      return /* @__PURE__ */ React.createElement("option", { key: d.id, value: d.id }, d.name);
    }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Viloyat"), /* @__PURE__ */ React.createElement("input", { value: form.region, onChange: function(e) {
      setForm(Object.assign({}, form, { region: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Tuman"), /* @__PURE__ */ React.createElement("input", { value: form.district, onChange: function(e) {
      setForm(Object.assign({}, form, { district: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Izoh"), /* @__PURE__ */ React.createElement("input", { value: form.note, onChange: function(e) {
      setForm(Object.assign({}, form, { note: e.target.value }));
    } })))) : null, /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : editId ? "Saqlash" : "Qo'shish"), editId ? /* @__PURE__ */ React.createElement("button", { className: "btn-ghost", type: "button", style: { marginLeft: 8 }, onClick: resetForm }, "Bekor") : null)), props.hideList ? null : /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Hamkorlar (", shown.length, ")"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "search",
        placeholder: "Qidiruv: ism, tel, rol...",
        value: q,
        onChange: function(e) {
          setQ(e.target.value);
        }
      }
    ), /* @__PURE__ */ React.createElement("select", { value: filter, onChange: function(e) {
      setFilter(e.target.value);
    }, style: { maxWidth: 160, margin: 0 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Hammasi"), /* @__PURE__ */ React.createElement("option", { value: "customer" }, "Hamkor (oddiy)"), /* @__PURE__ */ React.createElement("option", { value: "dealer" }, "Diler"), /* @__PURE__ */ React.createElement("option", { value: "agent" }, "Hamkor"))), /* @__PURE__ */ React.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Rol"), /* @__PURE__ */ React.createElement("th", null, "Tel"), /* @__PURE__ */ React.createElement("th", null, "Chegirma"), /* @__PURE__ */ React.createElement("th", null, "Limit"), /* @__PURE__ */ React.createElement("th", null, "Diler"), /* @__PURE__ */ React.createElement("th", { className: "sticky-actions" }, "Amallar"))), /* @__PURE__ */ React.createElement("tbody", null, shown.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "7" }, /* @__PURE__ */ React.createElement(V2Empty, { title: "Hamkor yo'q", sub: "Yuqoridagi forma orqali qo'shing" }))) : shown.map(function(p) {
      return /* @__PURE__ */ React.createElement("tr", { key: p.id }, /* @__PURE__ */ React.createElement("td", null, p.name), /* @__PURE__ */ React.createElement("td", null, typeLabel[p.type] || p.type), /* @__PURE__ */ React.createElement("td", null, p.phone || "-"), /* @__PURE__ */ React.createElement("td", null, discLabel[p.discount_type] || p.discount_type, Number(p.discount_value) > 0 ? " \xB7 " + money(p.discount_value) : ""), /* @__PURE__ */ React.createElement("td", null, money(p.credit_limit)), /* @__PURE__ */ React.createElement("td", null, p.parent_name || "-"), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-sm", type: "button", onClick: function() {
        startEdit(p);
      } }, "Tahrir"), " ", /* @__PURE__ */ React.createElement("button", { className: "btn-danger btn-sm", type: "button", onClick: function() {
        askDelete(p.id);
      } }, "O'chirish")));
    }))))));
  };
  window.Shipments = function Shipments(props) {
    const api = props.api;
    const [list, setList] = useState([]);
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);
    const [q, setQ] = useState("");
    const [form, setForm] = useState({
      from_type: "factory",
      from_partner_id: "",
      to_partner_id: "",
      product_id: "",
      qty: "",
      unit_price: "",
      note: ""
    });
    const [msg, setMsg] = useState({});
    const [ferr, setFerr] = useState({});
    const [busy, setBusy] = useState(false);
    const load = useCallback(function() {
      Promise.all([
        api("/api/shipments?limit=40"),
        api("/api/partners"),
        api("/api/products")
      ]).then(function(arr) {
        setList(arr[0].data || []);
        setPartners(arr[1].data || []);
        setProducts(arr[2].data || []);
      }).catch(function(e) {
        setMsg({ text: e.message, type: "err" });
      });
    }, [api]);
    useEffect(function() {
      load();
    }, [load]);
    const dealers = partners.filter(function(p) {
      return p.type === "dealer";
    });
    const receivers = partners.filter(function(p) {
      return p.type === "dealer" || p.type === "agent";
    });
    async function submit(e) {
      e.preventDefault();
      const next = {};
      if (!form.to_partner_id) next.to_partner_id = "Qabul qiluvchi majburiy";
      if (!form.product_id) next.product_id = "Mahsulot majburiy";
      if (!(Number(form.qty) > 0)) next.qty = "Miqdor musbat bo'lsin";
      setFerr(next);
      if (Object.keys(next).length) return;
      if (busy) return;
      setBusy(true);
      try {
        await api("/api/shipments", {
          method: "POST",
          body: JSON.stringify({
            from_type: form.from_type,
            from_partner_id: form.from_type === "dealer" && form.from_partner_id ? Number(form.from_partner_id) : null,
            to_partner_id: Number(form.to_partner_id),
            product_id: Number(form.product_id),
            qty: Number(form.qty),
            unit_price: form.unit_price !== "" ? Number(form.unit_price) : 0,
            note: form.note || null
          })
        });
        setMsg({ text: "Tovar berildi", type: "ok" });
        setForm({
          from_type: "factory",
          from_partner_id: "",
          to_partner_id: "",
          product_id: "",
          qty: "",
          unit_price: "",
          note: ""
        });
        setFerr({});
        load();
      } catch (err) {
        setMsg({ text: err.message, type: "err" });
      }
      setBusy(false);
    }
    const shown = list.filter(function(s) {
      return matchQ(q, [s.shipment_code, s.from_name, s.to_name, s.to_type, s.sku, s.note]);
    });
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
      setMsg({});
    } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Dilerlarga tovar berish"), /* @__PURE__ */ React.createElement("form", { onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kimdan"), /* @__PURE__ */ React.createElement("select", { value: form.from_type, onChange: function(e) {
      setForm(Object.assign({}, form, { from_type: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "factory" }, "Zavod"), /* @__PURE__ */ React.createElement("option", { value: "dealer" }, "Diler"))), form.from_type === "dealer" ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Diler"), /* @__PURE__ */ React.createElement("select", { value: form.from_partner_id, onChange: function(e) {
      setForm(Object.assign({}, form, { from_partner_id: e.target.value }));
    }, required: true }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang..."), dealers.map(function(d) {
      return /* @__PURE__ */ React.createElement("option", { key: d.id, value: d.id }, d.name);
    }))) : null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kimga *"), /* @__PURE__ */ React.createElement("select", { value: form.to_partner_id, onChange: function(e) {
      setForm(Object.assign({}, form, { to_partner_id: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang..."), receivers.map(function(p) {
      return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.name, " (", p.type, ")");
    })), ferr.to_partner_id ? /* @__PURE__ */ React.createElement("div", { className: "field-error" }, ferr.to_partner_id) : null)), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Mahsulot *"), /* @__PURE__ */ React.createElement("select", { value: form.product_id, onChange: function(e) {
      setForm(Object.assign({}, form, { product_id: e.target.value }));
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang..."), products.map(function(p) {
      return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.sku);
    })), ferr.product_id ? /* @__PURE__ */ React.createElement("div", { className: "field-error" }, ferr.product_id) : null), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Miqdor (dona) *"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.qty, onChange: function(e) {
      setForm(Object.assign({}, form, { qty: e.target.value }));
    } }), ferr.qty ? /* @__PURE__ */ React.createElement("div", { className: "field-error" }, ferr.qty) : null), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Narx (bosh = avto)"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.unit_price, onChange: function(e) {
      setForm(Object.assign({}, form, { unit_price: e.target.value }));
    }, placeholder: "Chegirma bilan" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Izoh"), /* @__PURE__ */ React.createElement("input", { value: form.note, onChange: function(e) {
      setForm(Object.assign({}, form, { note: e.target.value }));
    } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : "Tovar berish"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, "Dilerlarga berilgan tovar (", shown.length, ")"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "search",
        placeholder: "Qidiruv: kod, mahsulot, hamkor...",
        value: q,
        onChange: function(e) {
          setQ(e.target.value);
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Kimdan"), /* @__PURE__ */ React.createElement("th", null, "Kimga"), /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Dona"), /* @__PURE__ */ React.createElement("th", null, "Summa"), /* @__PURE__ */ React.createElement("th", null, "Sana"))), /* @__PURE__ */ React.createElement("tbody", null, shown.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "7" }, /* @__PURE__ */ React.createElement(V2Empty, { title: "Berilgan tovar yo'q", sub: "Yuqoridagi formadan boshlang" }))) : shown.map(function(s) {
      var toRole = s.to_type === "dealer" ? "Diler" : s.to_type === "agent" ? "Agent" : s.to_type || "";
      return /* @__PURE__ */ React.createElement("tr", { key: s.id }, /* @__PURE__ */ React.createElement("td", null, s.shipment_code), /* @__PURE__ */ React.createElement("td", null, s.from_type === "factory" ? "Zavod" : s.from_name || "Diler"), /* @__PURE__ */ React.createElement("td", null, s.to_name, toRole ? " (" + toRole + ")" : ""), /* @__PURE__ */ React.createElement("td", null, s.sku), /* @__PURE__ */ React.createElement("td", null, s.qty), /* @__PURE__ */ React.createElement("td", null, money(s.total_amount)), /* @__PURE__ */ React.createElement("td", null, s.given_at ? String(s.given_at).slice(0, 10) : "-"));
    }))))));
  };
  window.BizSettings = function BizSettings(props) {
    const api = props.api;
    const [form, setForm] = useState({
      bulk_min_qty: "500",
      bulk_min_kg: "1000",
      bulk_discount: "3000",
      default_credit_limit: "5000000",
      agents_ui_enabled: "0",
      company_name: "",
      company_phone: "",
      company_card: "",
      company_card_holder: ""
    });
    const [msg, setMsg] = useState({});
    const load = useCallback(function() {
      api("/api/settings").then(function(r) {
        const d = r.data || {};
        setForm({
          bulk_min_qty: d.bulk_min_qty != null ? String(d.bulk_min_qty) : "500",
          bulk_min_kg: d.bulk_min_kg != null ? String(d.bulk_min_kg) : "1000",
          bulk_discount: d.bulk_discount != null ? String(d.bulk_discount) : "3000",
          default_credit_limit: d.default_credit_limit != null ? String(d.default_credit_limit) : "5000000",
          agents_ui_enabled: String(d.agents_ui_enabled || "0") === "1" || String(d.agents_ui_enabled || "").toLowerCase() === "true" ? "1" : "0",
          company_name: d.company_name != null ? String(d.company_name) : "",
          company_phone: d.company_phone != null ? String(d.company_phone) : "",
          company_card: d.company_card != null ? String(d.company_card) : "",
          company_card_holder: d.company_card_holder != null ? String(d.company_card_holder) : ""
        });
      }).catch(function(e) {
        setMsg({ text: e.message, type: "err" });
      });
    }, [api]);
    useEffect(function() {
      load();
    }, [load]);
    const [busy, setBusy] = useState(false);
    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
        setMsg({ text: "Sozlamalar saqlandi", type: "ok" });
        load();
      } catch (err) {
        setMsg({ text: err.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
      setMsg({});
    } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Sozlama"), /* @__PURE__ */ React.createElement("p", { className: "muted", style: { marginBottom: 12 } }, "Chakana mijoz uchun yirik xarid chegirmasi va standart qarz limiti. Diler chegirmasi har bir hamkorda alohida."), /* @__PURE__ */ React.createElement("form", { onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Yirik chegirma (so'm/dona) *"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.bulk_discount, onChange: function(e) {
      setForm(Object.assign({}, form, { bulk_discount: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Standart qarz limiti *"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.default_credit_limit, onChange: function(e) {
      setForm(Object.assign({}, form, { default_credit_limit: e.target.value }));
    } }))), /* @__PURE__ */ React.createElement("details", { className: "dash-details" }, /* @__PURE__ */ React.createElement("summary", null, "Qo'shimcha"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Yirik xarid \u2014 kamida dona"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.bulk_min_qty, onChange: function(e) {
      setForm(Object.assign({}, form, { bulk_min_qty: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Yirik xarid \u2014 kamida kg"), /* @__PURE__ */ React.createElement("input", { type: "number", value: form.bulk_min_kg, onChange: function(e) {
      setForm(Object.assign({}, form, { bulk_min_kg: e.target.value }));
    } })))), /* @__PURE__ */ React.createElement("label", { className: "checkline", style: { display: "flex", gap: 8, alignItems: "center", margin: "12px 0" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: form.agents_ui_enabled === "1",
        onChange: function(e) {
          setForm(Object.assign({}, form, { agents_ui_enabled: e.target.checked ? "1" : "0" }));
        }
      }
    ), /* @__PURE__ */ React.createElement("span", null, "Agentlar oynasini ko'rsatish (hozir diler yo'q \u2014 yopiq qolsin)")), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Kompaniya nomi"), /* @__PURE__ */ React.createElement("input", { value: form.company_name, onChange: function(e) {
      setForm(Object.assign({}, form, { company_name: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Yuk xati telefoni"), /* @__PURE__ */ React.createElement("input", { value: form.company_phone, onChange: function(e) {
      setForm(Object.assign({}, form, { company_phone: e.target.value }));
    } }))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Karta raqami"), /* @__PURE__ */ React.createElement("input", { value: form.company_card, onChange: function(e) {
      setForm(Object.assign({}, form, { company_card: e.target.value }));
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Karta egasi"), /* @__PURE__ */ React.createElement("input", { value: form.company_card_holder, onChange: function(e) {
      setForm(Object.assign({}, form, { company_card_holder: e.target.value }));
    } }))), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Bu maydonlar telefon ilovasi `/yuk` da chiqadi. Bo'sh karta ko'rsatilmaydi."), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Saqlanmoqda..." : "Saqlash"))));
  };
  function agentAccessLabel(s) {
    if (s === "approved") return "Tasdiqlangan";
    if (s === "rejected") return "Rad etilgan";
    if (s === "blocked") return "Bloklangan";
    if (s === "pending") return "Kutilmoqda";
    return s || "\u2014";
  }
  window.AgentsPanel = function AgentsPanel(props) {
    const api = props.api;
    const [view, setView] = useState("requests");
    const [agents, setAgents] = useState([]);
    const [requests, setRequests] = useState([]);
    const [showAllRequests, setShowAllRequests] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [msg, setMsg] = useState({});
    const [err, setErr] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [confirmState, setConfirmState] = useState({ open: false, text: "", onConfirm: null });
    const [enabledOn, setEnabledOn] = useState("");
    const load = useCallback(function() {
      const reqPath = showAllRequests ? "/api/agent/admin/access-requests" : "/api/agent/admin/access-requests?status=pending";
      Promise.all([api("/api/agent/admin/agents"), api(reqPath)]).then(function(arr) {
        setAgents(arr[0].data || []);
        setRequests(arr[1].data || []);
        setErr("");
      }).catch(function(e) {
        setErr(e.message);
      });
    }, [api, showAllRequests]);
    useEffect(function() {
      load();
    }, [load]);
    function openAgent(agent) {
      setSelectedId(agent.id);
      setView("agents");
      Promise.all([
        api("/api/agent/admin/waybills?agent_id=" + agent.id),
        api("/api/agent/admin/debts?agent_id=" + agent.id),
        api("/api/agent/admin/commissions?agent_id=" + agent.id)
      ]).then(function(arr) {
        setDetail({
          agent,
          waybills: arr[0].data || [],
          debts: arr[1].data || [],
          commission: arr[2].data || {}
        });
      }).catch(function(e) {
        setMsg({ text: e.message, type: "err" });
      });
    }
    function decide(row, action) {
      const verb = action === "approve" ? "tasdiqlash" : "rad etish";
      setConfirmState({
        open: true,
        text: (row.full_name || row.telegram_id) + " so'rovini " + verb + "?",
        onConfirm: async function() {
          setConfirmState({ open: false, text: "", onConfirm: null });
          setBusyId(row.id);
          try {
            await api("/api/agent/admin/access-requests/" + row.id + "/" + action, {
              method: "POST",
              body: JSON.stringify(action === "approve" && enabledOn ? { commission_enabled_on: enabledOn } : {})
            });
            setMsg({ text: action === "approve" ? "Tasdiqlandi" : "Rad etildi", type: "ok" });
            load();
          } catch (e) {
            setMsg({ text: e.message, type: "err" });
          }
          setBusyId(null);
        }
      });
    }
    const selected = agents.filter(function(a) {
      return String(a.id) === String(selectedId);
    })[0] || null;
    const showCommission = agents.length > 0;
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
      V2ConfirmModal,
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
    } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Agentlar"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Telegram yuk-xati agentlari, kirish so'rovlari, qarz va komissiya. Hamkorlar ro'yxatidagi turdan alohida."), /* @__PURE__ */ React.createElement("div", { className: "chip-row", role: "tablist" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: view === "requests" ? "on" : "", onClick: function() {
      setView("requests");
    } }, "Kirish so'rovlari (", requests.length, ")"), /* @__PURE__ */ React.createElement("button", { type: "button", className: view === "agents" ? "on" : "", onClick: function() {
      setView("agents");
    } }, "Agentlar (", agents.length, ")")), err ? /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err) : null), view === "requests" ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React.createElement("h2", { style: { margin: 0 } }, showAllRequests ? "Barcha so'rovlar" : "Kutilayotgan so'rovlar"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setShowAllRequests(function(v) {
        return !v;
      });
    } }, showAllRequests ? "Faqat kutilayotgan" : "Barchasini ko'rsat")), showCommission ? /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Komissiya shu sanadan (ixtiyoriy)"), /* @__PURE__ */ React.createElement("input", { type: "date", value: enabledOn, onChange: function(e) {
      setEnabledOn(e.target.value);
    } }))) : null, requests.length === 0 ? /* @__PURE__ */ React.createElement(V2Empty, { title: "So'rov yo'q", sub: "Mini ilovadan yangi agent yozilsa shu yerda chiqadi." }) : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Telegram"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null, "Sana"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, requests.map(function(r) {
      return /* @__PURE__ */ React.createElement("tr", { key: r.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, r.full_name || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Telegram" }, r.telegram_username ? "@" + r.telegram_username : r.telegram_id), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, agentAccessLabel(r.status)), /* @__PURE__ */ React.createElement("td", { "data-label": "Sana" }, r.created_at ? String(r.created_at).slice(0, 10) : "\u2014"), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, r.status === "pending" ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: busyId === r.id, onClick: function() {
        decide(r, "approve");
      } }, "Tasdiqlash"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", disabled: busyId === r.id, onClick: function() {
        decide(r, "reject");
      } }, "Rad etish")) : /* @__PURE__ */ React.createElement("span", { className: "muted" }, r.decided_by || "")));
    }))))) : /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Agentlar ro'yxati"), agents.length === 0 ? /* @__PURE__ */ React.createElement(V2Empty, { title: "Agent yo'q", sub: "So'rov tasdiqlangach agent shu ro'yxatga tushadi." }) : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Telegram"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null, "Qarz"), showCommission ? /* @__PURE__ */ React.createElement("th", null, "Komissiya") : null, /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, agents.map(function(a) {
      return /* @__PURE__ */ React.createElement("tr", { key: a.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, a.full_name || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Telegram" }, a.telegram_id || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, agentAccessLabel(a.access_status), a.is_active === false ? " \xB7 nofaol" : ""), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(a.debt_total)), showCommission ? /* @__PURE__ */ React.createElement("td", { "data-label": "Komissiya" }, money(a.commission_balance)) : null, /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
        openAgent(a);
      } }, "Karta")));
    }))))), selected && detail ? /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, selected.full_name || "Agent", " \xB7 karta"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, agentAccessLabel(selected.access_status), selected.commission_enabled_on ? " \xB7 komissiya " + String(selected.commission_enabled_on).slice(0, 10) + " dan" : " \xB7 komissiya yoqilgan"), showCommission ? /* @__PURE__ */ React.createElement("div", { className: "dash-kpis" }, /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "Hisoblangan"), /* @__PURE__ */ React.createElement("div", { className: "value" }, money(detail.commission.earned))), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "Yechilgan"), /* @__PURE__ */ React.createElement("div", { className: "value" }, money(detail.commission.withdrawn))), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "label" }, "Balans"), /* @__PURE__ */ React.createElement("div", { className: "value" }, money(detail.commission.balance)))) : null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem" } }, "Yuk xatlari"), (detail.waybills || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Yuk xati yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Jami"), /* @__PURE__ */ React.createElement("th", null, "To'langan"), /* @__PURE__ */ React.createElement("th", null, "Qarz"), /* @__PURE__ */ React.createElement("th", null, "Sana"))), /* @__PURE__ */ React.createElement("tbody", null, detail.waybills.map(function(w) {
      return /* @__PURE__ */ React.createElement("tr", { key: w.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, w.waybill_code), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, w.customer_name || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Jami" }, money(w.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "To'langan" }, money(w.paid_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(w.debt_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Sana" }, w.created_at ? String(w.created_at).slice(0, 10) : "\u2014"));
    })))), /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem", marginTop: 12 } }, "Qarzlar"), (detail.debts || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, "Do'kon yo'q") : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Telefon"), /* @__PURE__ */ React.createElement("th", null, "Qarz"))), /* @__PURE__ */ React.createElement("tbody", null, detail.debts.map(function(d) {
      return /* @__PURE__ */ React.createElement("tr", { key: d.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, d.name), /* @__PURE__ */ React.createElement("td", { "data-label": "Telefon" }, d.phone || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(d.outstanding_debt)));
    }))))) : null);
  };
  window.YukXatiPanel = function YukXatiPanel(props) {
    const api = props.api;
    const apiBase = props.apiBase || "";
    const adminKey = props.adminKey || "";
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [rows, setRows] = useState([]);
    const [customerId, setCustomerId] = useState("");
    const [paid, setPaid] = useState("0");
    const [due, setDue] = useState("");
    const [note, setNote] = useState("");
    const [lines, setLines] = useState([{ product_id: "", quantity: "1", price: "" }]);
    const [msg, setMsg] = useState({});
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [payFor, setPayFor] = useState(null);
    const [payAmount, setPayAmount] = useState("");
    const [openId, setOpenId] = useState(null);
    const [trips, setTrips] = useState([]);
    const [reysId, setReysId] = useState("");
    const [reysTouched, setReysTouched] = useState(false);
    const [loadLines, setLoadLines] = useState([{ product_id: "", quantity: "1" }]);
    const [reysNote, setReysNote] = useState("");
    const [requests, setRequests] = useState([]);
    const idemRef = useRef("");
    const reysKey = useRef("");
    const load = useCallback(function() {
      Promise.all([
        api("/api/customers"),
        api("/api/products"),
        api("/api/agent/admin/waybills?scope=admin"),
        api("/api/agent/admin/reyslar").catch(function() {
          return { data: [] };
        }),
        api("/api/agent/admin/yuk-access-requests?status=pending").catch(function() {
          return { data: [] };
        })
      ]).then(function(arr) {
        const cust = (arr[0].data || []).filter(function(c) {
          return c.is_active !== false;
        });
        setCustomers(cust);
        setProducts((arr[1].data || []).filter(function(p) {
          return p.is_active !== false;
        }));
        setRows(arr[2].data || []);
        setRequests(arr[4].data || []);
        const list = arr[3].data || [];
        setTrips(list);
        setErr("");
        if (!reysTouched) {
          const open = list.filter(function(t) {
            return t.status === "open";
          })[0];
          setReysId(open ? String(open.id) : "");
        }
      }).catch(function(e) {
        setErr(e.message);
      });
    }, [api, reysTouched]);
    useEffect(function() {
      load();
    }, [load]);
    function unitPrice(line) {
      if (line.price !== "" && line.price != null) {
        const n = Math.round(Number(line.price));
        return isFinite(n) ? n : 0;
      }
      const p = products.filter(function(x) {
        return String(x.id) === String(line.product_id);
      })[0];
      return p ? Math.round(Number(p.price) || 0) : 0;
    }
    const total = lines.reduce(function(sum, line) {
      const qty = Number(line.quantity);
      if (!(qty > 0) || !line.product_id) return sum;
      return sum + Math.round(unitPrice(line) * qty);
    }, 0);
    const paidN = Math.max(0, Math.round(Number(paid) || 0));
    const debt = Math.max(0, total - paidN);
    function setLine(index, patch) {
      setLines(function(prev) {
        return prev.map(function(line, i) {
          if (i !== index) return line;
          const next = Object.assign({}, line, patch);
          if (patch.product_id != null && patch.price == null) {
            const p = products.filter(function(x) {
              return String(x.id) === String(patch.product_id);
            })[0];
            if (p && (line.price === "" || line.price == null)) next.price = String(Math.round(Number(p.price) || 0));
          }
          return next;
        });
      });
    }
    async function openDoc(id, kind) {
      const path = "/api/agent/admin/waybills/" + id + (kind === "pdf" ? "/nakladnoy.pdf" : "/nakladnoy");
      const res = await fetch(String(apiBase).replace(/\/$/, "") + path, {
        headers: adminKey ? { "x-admin-key": adminKey } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(function() {
          return {};
        });
        throw new Error(data.error || "Nakladnoy ochilmadi");
      }
      if (kind === "pdf") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        return;
      }
      const html = await res.text();
      const w = window.open("", "_blank");
      if (!w) throw new Error("Brauzer yangi oyna ochmadi");
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function() {
        try {
          w.print();
        } catch (e) {
        }
      }, 200);
    }
    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      if (!idemRef.current) {
        idemRef.current = "ui-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 10);
      }
      setBusy(true);
      try {
        const items = lines.filter(function(line) {
          return line.product_id && Number(line.quantity) > 0;
        }).map(function(line) {
          return {
            product_id: Number(line.product_id),
            quantity: Number(line.quantity),
            price: unitPrice(line)
          };
        });
        const payload = {
          customer_id: Number(customerId),
          paid_amount: paidN,
          due_date: due || null,
          note: note || null,
          items,
          idempotency_key: idemRef.current
        };
        if (reysId) payload.reys_id = Number(reysId);
        await api("/api/agent/admin/waybills", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        idemRef.current = "";
        setMsg({
          text: reysId ? "Yuk xati yozildi. Reys yukidan ayirildi." : "Yuk xati yozildi. Ombor shu savdo bilan kamaydi.",
          type: "ok"
        });
        setLines([{ product_id: "", quantity: "1", price: "" }]);
        setPaid("0");
        setDue("");
        setNote("");
        load();
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    async function recordPay(e) {
      e.preventDefault();
      if (busy || !payFor) return;
      setBusy(true);
      try {
        await api("/api/agent/admin/waybills/" + payFor.id + "/payments", {
          method: "POST",
          body: JSON.stringify({ amount: Math.round(Number(payAmount) || 0), method: "cash" })
        });
        setMsg({ text: "Qarz to'lovi yozildi", type: "ok" });
        setPayFor(null);
        setPayAmount("");
        load();
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    async function sendBill(row) {
      setBusy(true);
      try {
        await api("/api/agent/admin/waybills/" + row.id + "/send", { method: "POST", body: "{}" });
        setMsg({ text: "Nakladnoy Telegramga yuborildi", type: "ok" });
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    const openTrip = trips.filter(function(t) {
      return t.status === "open";
    })[0] || null;
    const closedTrips = trips.filter(function(t) {
      return t.status !== "open";
    });
    function setLoadLine(index, patch) {
      setLoadLines(function(prev) {
        return prev.map(function(line, i) {
          return i === index ? Object.assign({}, line, patch) : line;
        });
      });
    }
    async function startTrip(e) {
      e.preventDefault();
      if (busy) return;
      if (!reysKey.current) {
        reysKey.current = "reys-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 10);
      }
      setBusy(true);
      try {
        const items = loadLines.filter(function(line) {
          return line.product_id && Number(line.quantity) > 0;
        }).map(function(line) {
          return { product_id: Number(line.product_id), quantity: Number(line.quantity) };
        });
        const created = await api("/api/agent/admin/reyslar", {
          method: "POST",
          body: JSON.stringify({ items, note: reysNote || null, idempotency_key: reysKey.current })
        });
        reysKey.current = "";
        setLoadLines([{ product_id: "", quantity: "1" }]);
        setReysNote("");
        if (created.data && created.data.id) {
          setReysTouched(true);
          setReysId(String(created.data.id));
        }
        setMsg({ text: "Reys boshlandi. Yuk ombordan yo'lga chiqdi.", type: "ok" });
        load();
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    async function closeTrip(trip) {
      if (busy || !trip) return;
      var ask = window.bdConfirm || function(msg2) {
        return Promise.resolve(window.confirm(msg2));
      };
      var ok = await ask("Reysni yopasizmi?", {
        money: true,
        title: "Reysni yopish",
        detail: "Qolgan yuk omborga qaytadi."
      });
      if (!ok) return;
      setBusy(true);
      try {
        await api("/api/agent/admin/reyslar/" + trip.id + "/close", { method: "POST", body: "{}" });
        setReysTouched(true);
        setReysId("");
        setMsg({ text: "Reys yopildi. Qoldiq omborga qaytdi.", type: "ok" });
        load();
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    function TripSummary(props2) {
      const s = props2.trip.summary || {};
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "muted" }, props2.trip.reys_code, " \xB7 ", props2.trip.status === "open" ? "Yo'lda" : "Yopilgan"), /* @__PURE__ */ React.createElement("p", null, "Yuklandi ", s.yuklandi || 0, " \xB7 Sotildi ", s.sotildi || 0, " \xB7 Qaytdi ", s.qaytdi || 0, " \xB7 Yo'lda ", s.yolda || 0), /* @__PURE__ */ React.createElement("p", null, "Tushum ", money(s.tushum), " \xB7 Qarz ", money(s.qarz)), (s.lines || []).length ? /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Mahsulot"), /* @__PURE__ */ React.createElement("th", null, "Yuklandi"), /* @__PURE__ */ React.createElement("th", null, "Sotildi"), /* @__PURE__ */ React.createElement("th", null, "Qaytdi"), /* @__PURE__ */ React.createElement("th", null, "Yo'lda"))), /* @__PURE__ */ React.createElement("tbody", null, s.lines.map(function(line) {
        return /* @__PURE__ */ React.createElement("tr", { key: line.product_id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Mahsulot" }, line.sku || "#" + line.product_id), /* @__PURE__ */ React.createElement("td", { "data-label": "Yuklandi" }, line.loaded_qty), /* @__PURE__ */ React.createElement("td", { "data-label": "Sotildi" }, line.sold_qty), /* @__PURE__ */ React.createElement("td", { "data-label": "Qaytdi" }, line.returned_qty), /* @__PURE__ */ React.createElement("td", { "data-label": "Yo'lda" }, line.yolda_qty));
      })))) : null);
    }
    async function decideAccess(row, action) {
      if (busy || !row) return;
      setBusy(true);
      try {
        await api("/api/agent/admin/yuk-access-requests/" + encodeURIComponent(row.telegram_id) + "/" + action, {
          method: "POST",
          body: JSON.stringify({})
        });
        setMsg({ text: action === "approve" ? "Tasdiqlandi" : "Rad etildi", type: "ok" });
        load();
      } catch (error) {
        setMsg({ text: error.message, type: "err" });
      } finally {
        setBusy(false);
      }
    }
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Msg, { text: msg.text, type: msg.type, onClose: function() {
      setMsg({});
    } }), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Kirish so'rovlari"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Yuk xati yozishga ruxsat. @briketborbot dagi tugma eski botga boradi va ERP ruxsatini bermaydi. Shu yerdan tasdiqlang yoki rad eting."), requests.length ? /* @__PURE__ */ React.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Ism"), /* @__PURE__ */ React.createElement("th", null, "Username"), /* @__PURE__ */ React.createElement("th", null, "id"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, requests.map(function(row) {
      const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "\u2014";
      return /* @__PURE__ */ React.createElement("tr", { key: row.telegram_id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Ism" }, name), /* @__PURE__ */ React.createElement("td", { "data-label": "Username" }, row.username ? "@" + row.username : "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "id" }, row.telegram_id), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", disabled: busy, onClick: function() {
        decideAccess(row, "approve");
      } }, "\u2705 Tasdiqlash"), " ", /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", disabled: busy, onClick: function() {
        decideAccess(row, "reject");
      } }, "\u274C Rad etish")));
    })))) : /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Kutilayotgan so'rov yo'q.")), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Reys"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Yukni ombordan yo'lga chiqaring. Shu reysdagi yuk xati shu yukdan ayiriladi. Yopilganda qolgani omborga qaytadi. Reyssiz yuk xati ham yoziladi."), openTrip ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(TripSummary, { trip: openTrip }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn", disabled: busy, onClick: function() {
      closeTrip(openTrip);
    } }, "Reysni yopish")) : /* @__PURE__ */ React.createElement("form", { onSubmit: startTrip }, loadLines.map(function(line, index) {
      return /* @__PURE__ */ React.createElement("div", { className: "form-row", key: index }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Mahsulot *"), /* @__PURE__ */ React.createElement("select", { value: line.product_id, onChange: function(e) {
        setLoadLine(index, { product_id: e.target.value });
      }, required: index === 0 }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), products.map(function(p) {
        return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.sku);
      }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Yuklandi"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", step: "1", value: line.quantity, onChange: function(e) {
        setLoadLine(index, { quantity: e.target.value });
      } })));
    }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setLoadLines(function(prev) {
        return prev.concat([{ product_id: "", quantity: "1" }]);
      });
    } }, "Mahsulot qo'shish"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Izoh"), /* @__PURE__ */ React.createElement("input", { value: reysNote, onChange: function(e) {
      setReysNote(e.target.value);
    } }))), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Yozilmoqda..." : "Reysni boshlash")), closedTrips.length ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem" } }, "Yopilgan reyslar"), closedTrips.slice(0, 5).map(function(trip) {
      return /* @__PURE__ */ React.createElement(TripSummary, { key: trip.id, trip });
    })) : null), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Yuk tarqatish"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Do'konga chiqib yozilgan savdo. Hujjat \u2014 yuk xati. Buyurtmalar ro'yxatiga tushmaydi. Reyssiz yuk xati ombordan bir marta kamayadi. Reys ichidagi yuk xati shu reys yukidan ayiriladi, ombordan ikkinchi marta emas."), err ? /* @__PURE__ */ React.createElement("div", { className: "msg err" }, err) : null, /* @__PURE__ */ React.createElement("form", { onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Reys"), /* @__PURE__ */ React.createElement("select", { value: reysId, onChange: function(e) {
      setReysTouched(true);
      setReysId(e.target.value);
    } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Reyssiz \u2014 ombordan"), openTrip ? /* @__PURE__ */ React.createElement("option", { value: String(openTrip.id) }, openTrip.reys_code, " \xB7 yo'lda") : null), /* @__PURE__ */ React.createElement("p", { className: "muted" }, reysId ? "Shu reys yukidan ayiriladi." : "Ombordan bir marta kamayadi.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Mijoz *"), /* @__PURE__ */ React.createElement("select", { value: customerId, onChange: function(e) {
      setCustomerId(e.target.value);
    }, required: true }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), customers.map(function(c) {
      return /* @__PURE__ */ React.createElement("option", { key: c.id, value: c.id }, c.name, c.phone ? " \xB7 " + c.phone : "");
    }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Boshlang'ich to'lov"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: paid, onChange: function(e) {
      setPaid(e.target.value);
    } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Qarz muddati"), /* @__PURE__ */ React.createElement("input", { type: "date", value: due, onChange: function(e) {
      setDue(e.target.value);
    } }))), lines.map(function(line, index) {
      return /* @__PURE__ */ React.createElement("div", { className: "form-row", key: index }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Mahsulot *"), /* @__PURE__ */ React.createElement("select", { value: line.product_id, onChange: function(e) {
        setLine(index, { product_id: e.target.value });
      }, required: index === 0 }, /* @__PURE__ */ React.createElement("option", { value: "" }, "Tanlang"), products.map(function(p) {
        return /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.sku);
      }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Dona"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", step: "1", value: line.quantity, onChange: function(e) {
        setLine(index, { quantity: e.target.value });
      } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Narx"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: line.price, onChange: function(e) {
        setLine(index, { price: e.target.value });
      } })), /* @__PURE__ */ React.createElement("div", { style: { alignSelf: "end" } }, lines.length > 1 ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
        setLines(function(prev) {
          return prev.filter(function(_l, i) {
            return i !== index;
          });
        });
      } }, "Olib tashlash") : null));
    }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setLines(function(prev) {
        return prev.concat([{ product_id: "", quantity: "1", price: "" }]);
      });
    } }, "Mahsulot qo'shish"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Izoh"), /* @__PURE__ */ React.createElement("input", { value: note, onChange: function(e) {
      setNote(e.target.value);
    } }))), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Jami ", money(total), " \xB7 To'langan ", money(paidN), " \xB7 Qarz ", money(debt)), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit", disabled: busy }, busy ? "Yozilmoqda..." : "Yuk xatini yozish"))), /* @__PURE__ */ React.createElement("div", { className: "card" }, /* @__PURE__ */ React.createElement("h2", null, "Yuk xatlar"), rows.length === 0 ? /* @__PURE__ */ React.createElement(V2Empty, { title: "Yuk xati yo'q", sub: "Yuqoridagi formadan boshlang." }) : /* @__PURE__ */ React.createElement("div", { className: "table-wrap list-dense" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Kod"), /* @__PURE__ */ React.createElement("th", null, "Mijoz"), /* @__PURE__ */ React.createElement("th", null, "Yozgan"), /* @__PURE__ */ React.createElement("th", null, "Reys"), /* @__PURE__ */ React.createElement("th", null, "Jami"), /* @__PURE__ */ React.createElement("th", null, "To'langan"), /* @__PURE__ */ React.createElement("th", null, "Qarz"), /* @__PURE__ */ React.createElement("th", null, "Holat"), /* @__PURE__ */ React.createElement("th", null))), /* @__PURE__ */ React.createElement("tbody", null, rows.map(function(w) {
      var writer = [w.created_by_first_name, w.created_by_last_name].map(function(part) {
        return part == null ? "" : String(part).trim();
      }).filter(Boolean).join(" ");
      if (!writer && w.created_by_username) writer = "@" + String(w.created_by_username).replace(/^@+/, "");
      if (!writer && w.created_by_telegram_id) writer = String(w.created_by_telegram_id);
      return /* @__PURE__ */ React.createElement("tr", { key: w.id }, /* @__PURE__ */ React.createElement("td", { "data-label": "Kod" }, w.waybill_code, writer ? /* @__PURE__ */ React.createElement("div", { className: "muted" }, writer) : null), /* @__PURE__ */ React.createElement("td", { "data-label": "Mijoz" }, w.customer_name || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Yozgan" }, w.created_by_name || "Eski yozuv"), /* @__PURE__ */ React.createElement("td", { "data-label": "Reys" }, (trips.filter(function(t) {
        return String(t.id) === String(w.reys_id);
      })[0] || {}).reys_code || "\u2014"), /* @__PURE__ */ React.createElement("td", { "data-label": "Jami" }, money(w.total_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "To'langan" }, money(w.paid_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Qarz" }, money(w.debt_amount)), /* @__PURE__ */ React.createElement("td", { "data-label": "Holat" }, w.status === "paid" ? "To'langan" : w.status === "partial" ? "Qisman" : "Qarz"), /* @__PURE__ */ React.createElement("td", { className: "sticky-actions", "data-label": "Amallar" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
        setOpenId(function(cur) {
          return String(cur) === String(w.id) ? null : w.id;
        });
      } }, String(openId) === String(w.id) ? "Yopish" : "Batafsil"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
        openDoc(w.id, "html").catch(function(e) {
          setMsg({ text: e.message, type: "err" });
        });
      } }, "Chop etish"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
        openDoc(w.id, "pdf").catch(function(e) {
          setMsg({ text: e.message, type: "err" });
        });
      } }, "PDF"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", disabled: busy, onClick: function() {
        sendBill(w);
      } }, "Yuborish"), Number(w.debt_amount) > 0 ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm", onClick: function() {
        setPayFor(w);
        setPayAmount(String(Math.round(Number(w.debt_amount) || 0)));
      } }, "Qarz") : null));
    })))), rows.filter(function(w) {
      return String(w.id) === String(openId);
    }).slice(0, 1).map(function(open) {
      return /* @__PURE__ */ React.createElement("div", { key: "open-" + open.id, style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.95rem" } }, open.waybill_code), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Mijoz: ", open.customer_name || "\u2014"), /* @__PURE__ */ React.createElement("p", null, "Yozgan: ", open.created_by_name || "Eski yozuv"), /* @__PURE__ */ React.createElement("p", null, "Jami ", money(open.total_amount), " \xB7 To'langan ", money(open.paid_amount), " \xB7 Qarz ", money(open.debt_amount)), (open.items || []).length ? /* @__PURE__ */ React.createElement("ul", null, open.items.map(function(it) {
        return /* @__PURE__ */ React.createElement("li", { key: it.id }, it.product_name, " \xB7 ", it.quantity, " \xB7 ", money(it.subtotal || it.price));
      })) : null);
    }), payFor ? /* @__PURE__ */ React.createElement("form", { onSubmit: recordPay, style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: "0.9rem" } }, payFor.waybill_code, " \xB7 qarz to'lovi"), /* @__PURE__ */ React.createElement("p", { className: "muted" }, "Yozgan: ", payFor.created_by_name || "Eski yozuv"), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Summa"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: payAmount, onChange: function(e) {
      setPayAmount(e.target.value);
    } }))), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm", type: "submit", disabled: busy }, "Yozish"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn-ghost btn-sm", onClick: function() {
      setPayFor(null);
    } }, "Bekor")) : null));
  };
})();
