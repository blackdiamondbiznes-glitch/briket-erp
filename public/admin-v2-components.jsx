/* Admin v2: Hamkorlar, Yuk, Biznes sozlama — IIFE (admin.html scope bilan to'qnashmasin) */
(function () {
  "use strict";
  /* Admin v2: Hamkorlar, Yuk, Biznes sozlama */
  const { useState, useEffect, useCallback, useRef } = React;
  function money(n) {
    return Number(n || 0).toLocaleString("uz-UZ");
  }
  function Msg(props) {
    useEffect(function () {
      if (!props.text || !props.onClose) return;
      var ms = props.type === "err" ? 6000 : 2500;
      var id = setTimeout(props.onClose, ms);
      return function () { clearTimeout(id); };
    }, [props.text, props.type, props.onClose]);
    if (!props.text) return null;
    return (
      <div className={"msg toast " + (props.type || "ok")} onClick={props.onClose} role="status">
        <span style={{ flex: 1 }}>{props.text}</span>
        <button type="button" className="msg-x" aria-label="Yopish" onClick={props.onClose}>×</button>
      </div>
    );
  }

  function V2Empty(props) {
    return (
      <div className="empty-state empty">
        <div className="empty-title">{props.title || "Ro'yxat bo'sh"}</div>
        {props.sub ? <div className="muted">{props.sub}</div> : null}
      </div>
    );
  }

  function V2ConfirmModal(props) {
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) {
        if (e.key === "Escape") props.onCancel();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) props.onConfirm();
      }
      window.addEventListener("keydown", onKey);
      return function () { window.removeEventListener("keydown", onKey); };
    }, [props.open, props.onCancel, props.onConfirm]);
    if (!props.open) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal-card">
          <p style={{ marginBottom: 14, fontSize: "0.9rem" }}>{props.text}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" type="button" onClick={props.onCancel}>Bekor</button>
            <button className="btn" type="button" onClick={props.onConfirm}>Tasdiqlash</button>
          </div>
        </div>
      </div>
    );
  }

  function matchQ(q, parts) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return true;
    return parts.some(function (p) {
      return String(p == null ? "" : p).toLowerCase().indexOf(s) !== -1;
    });
  }

  window.Partners = function Partners(props) {
    const api = props.api;
    const [list, setList] = useState([]);
    const [filter, setFilter] = useState("");
    const [q, setQ] = useState("");
    const [form, setForm] = useState({
      name: "", phone: "", address: "", type: "customer",
      parent_id: "", region: "", district: "",
      discount_type: "none", discount_value: "", credit_limit: "", note: ""
    });
    const [editId, setEditId] = useState(null);
    const [msg, setMsg] = useState({});
    const [ferr, setFerr] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirmState, setConfirmState] = useState({ open: false, id: null });
    const [extraOpen, setExtraOpen] = useState(false);

    const load = useCallback(function () {
      const qs = [];
      if (filter) qs.push("type=" + encodeURIComponent(filter));
      if (props.includeInactive) qs.push("active=0");
      api("/api/partners" + (qs.length ? "?" + qs.join("&") : ""))
        .then(function (r) { setList(r.data || []); })
        .catch(function (e) { setMsg({ text: e.message, type: "err" }); });
    }, [api, filter, props.includeInactive]);

    useEffect(function () { load(); }, [load]);

    useEffect(function () {
      if (props.initialEditId) return;
      if (!props.presetType) return;
      setForm(function (f) { return Object.assign({}, f, { type: props.presetType }); });
    }, [props.presetType, props.initialEditId]);

    const dealers = list.filter(function (p) { return p.type === "dealer"; });

    function resetForm() {
      setForm({
        name: "", phone: "", address: "", type: "customer",
        parent_id: "", region: "", district: "",
        discount_type: "none", discount_value: "", credit_limit: "", note: ""
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
        name: p.name || "", phone: p.phone || "", address: p.address || "",
        type: p.type || "customer", parent_id: p.parent_id ? String(p.parent_id) : "",
        region: p.region || "", district: p.district || "",
        discount_type: p.discount_type || "none",
        discount_value: p.discount_value != null ? String(p.discount_value) : "",
        credit_limit: p.credit_limit != null ? String(p.credit_limit) : "",
        note: p.note || ""
      });
      const hasExtra = !!(p.phone || p.address || p.region || p.district || p.note || p.parent_id || Number(p.discount_value) || Number(p.credit_limit) || (p.discount_type && p.discount_type !== "none"));
      setExtraOpen(hasExtra);
      setTimeout(function () {
        var el = document.getElementById("v2-partner-form");
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }

    function askDelete(id) {
      setConfirmState({ open: true, id: id });
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
    useEffect(function () {
      if (!props.initialEditId || !list.length) return;
      if (editBoot.current === String(props.initialEditId)) return;
      var p = list.find(function (x) { return String(x.id) === String(props.initialEditId); });
      if (!p) return;
      editBoot.current = String(props.initialEditId);
      startEdit(p);
    }, [list, props.initialEditId]);

    const typeLabel = { customer: "Hamkor", dealer: "Diler", agent: "Hamkor" };
    const discLabel = { none: "Yoq", bulk: "Bulk (500+)", fixed_amount: "Doimiy som", fixed_percent: "Doimiy %" };

    const shown = list.filter(function (p) {
      return matchQ(q, [p.name, p.phone, p.type, typeLabel[p.type], p.region, p.district, p.parent_name, p.note]);
    });

    return (
      <div>
        <V2ConfirmModal
          open={confirmState.open}
          text="Hamkorni ochirish (nofaol qilish)?"
          onCancel={function () { setConfirmState({ open: false, id: null }); }}
          onConfirm={doDelete}
        />
        <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
        <div className="card">
          <h2>{editId ? "Tahrirlash" : (form.type === "dealer" ? "Yangi diler" : "Yangi hamkor")}</h2>
          <div className="hint-box">Diler va hamkor alohida jadvalda. Chakana mijoz — Mijozlar ro'yxatidagi boshqa tugma.</div>
          <form id="v2-partner-form" onSubmit={submit}>
            <div className="form-row">
              <div>
                <label>Ism *</label>
                <input value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }} />
                {ferr.name ? <div className="field-error">{ferr.name}</div> : null}
              </div>
              <div>
                <label>Tur *</label>
                <select value={form.type} onChange={function (e) { setForm(Object.assign({}, form, { type: e.target.value })); }}>
                  <option value="dealer">Diler</option>
                  <option value="agent">Hamkor</option>
                  <option value="customer">Hamkor (oddiy)</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-ghost btn-sm extra-toggle" onClick={function () { setExtraOpen(!extraOpen); }}>
              {extraOpen ? "Qo'shimchani yashirish" : "Qo'shimcha"}
            </button>
            {extraOpen ? (
              <div>
                <div className="form-row">
                  <div>
                    <label>Telefon</label>
                    <input value={form.phone} onChange={function (e) { setForm(Object.assign({}, form, { phone: e.target.value })); }} />
                  </div>
                  <div>
                    <label>Manzil</label>
                    <input value={form.address} onChange={function (e) { setForm(Object.assign({}, form, { address: e.target.value })); }} />
                  </div>
                  <div>
                    <label>Chegirma turi</label>
                    <select value={form.discount_type} onChange={function (e) { setForm(Object.assign({}, form, { discount_type: e.target.value })); }}>
                      <option value="none">Yo'q</option>
                      <option value="bulk">Yirik xarid</option>
                      <option value="fixed_amount">Doimiy (so'm/dona)</option>
                      <option value="fixed_percent">Doimiy (%)</option>
                    </select>
                  </div>
                  <div>
                    <label>Chegirma qiymati</label>
                    <input type="number" value={form.discount_value} onChange={function (e) { setForm(Object.assign({}, form, { discount_value: e.target.value })); }} placeholder="3000 yoki 10" />
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label>Kredit limiti</label>
                    <input type="number" value={form.credit_limit} onChange={function (e) { setForm(Object.assign({}, form, { credit_limit: e.target.value })); }} />
                  </div>
                  <div>
                    <label>Bog'langan diler</label>
                    <select value={form.parent_id} onChange={function (e) { setForm(Object.assign({}, form, { parent_id: e.target.value })); }}>
                      <option value="">—</option>
                      {dealers.map(function (d) {
                        return <option key={d.id} value={d.id}>{d.name}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label>Viloyat</label>
                    <input value={form.region} onChange={function (e) { setForm(Object.assign({}, form, { region: e.target.value })); }} />
                  </div>
                  <div>
                    <label>Tuman</label>
                    <input value={form.district} onChange={function (e) { setForm(Object.assign({}, form, { district: e.target.value })); }} />
                  </div>
                  <div>
                    <label>Izoh</label>
                    <input value={form.note} onChange={function (e) { setForm(Object.assign({}, form, { note: e.target.value })); }} />
                  </div>
                </div>
              </div>
            ) : null}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saqlanmoqda..." : (editId ? "Saqlash" : "Qo'shish")}</button>
            {editId ? (
              <button className="btn-ghost" type="button" style={{ marginLeft: 8 }} onClick={resetForm}>Bekor</button>
            ) : null}
          </form>
        </div>
        {props.hideList ? null : (
        <div className="card">
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Hamkorlar ({shown.length})</h2>
            <input
              type="search"
              placeholder="Qidiruv: ism, tel, rol..."
              value={q}
              onChange={function (e) { setQ(e.target.value); }}
            />
            <select value={filter} onChange={function (e) { setFilter(e.target.value); }} style={{ maxWidth: 160, margin: 0 }}>
              <option value="">Hammasi</option>
              <option value="customer">Hamkor (oddiy)</option>
              <option value="dealer">Diler</option>
              <option value="agent">Hamkor</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ism</th><th>Rol</th><th>Tel</th><th>Chegirma</th><th>Limit</th><th>Diler</th><th className="sticky-actions">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <V2Empty title="Hamkor yo'q" sub="Yuqoridagi forma orqali qo'shing" />
                    </td>
                  </tr>
                ) : shown.map(function (p) {
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{typeLabel[p.type] || p.type}</td>
                      <td>{p.phone || "-"}</td>
                      <td>
                        {discLabel[p.discount_type] || p.discount_type}
                        {Number(p.discount_value) > 0 ? " · " + money(p.discount_value) : ""}
                      </td>
                      <td>{money(p.credit_limit)}</td>
                      <td>{p.parent_name || "-"}</td>
                      <td className="sticky-actions">
                        <button className="btn-ghost btn-sm" type="button" onClick={function () { startEdit(p); }}>Tahrir</button>
                        {" "}
                        <button className="btn-danger btn-sm" type="button" onClick={function () { askDelete(p.id); }}>O'chirish</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    );
  };

  window.Shipments = function Shipments(props) {
    const api = props.api;
    const [list, setList] = useState([]);
    const [partners, setPartners] = useState([]);
    const [products, setProducts] = useState([]);
    const [q, setQ] = useState("");
    const [form, setForm] = useState({
      from_type: "factory", from_partner_id: "", to_partner_id: "",
      product_id: "", qty: "", unit_price: "", note: ""
    });
    const [msg, setMsg] = useState({});
    const [ferr, setFerr] = useState({});
    const [busy, setBusy] = useState(false);

    const load = useCallback(function () {
      Promise.all([
        api("/api/shipments?limit=40"),
        api("/api/partners"),
        api("/api/products")
      ])
        .then(function (arr) {
          setList(arr[0].data || []);
          setPartners(arr[1].data || []);
          setProducts(arr[2].data || []);
        })
        .catch(function (e) { setMsg({ text: e.message, type: "err" }); });
    }, [api]);

    useEffect(function () { load(); }, [load]);

    const dealers = partners.filter(function (p) { return p.type === "dealer"; });
    const receivers = partners.filter(function (p) {
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
            from_partner_id: form.from_type === "dealer" && form.from_partner_id
              ? Number(form.from_partner_id) : null,
            to_partner_id: Number(form.to_partner_id),
            product_id: Number(form.product_id),
            qty: Number(form.qty),
            unit_price: form.unit_price !== "" ? Number(form.unit_price) : 0,
            note: form.note || null
          })
        });
        setMsg({ text: "Tovar berildi", type: "ok" });
        setForm({
          from_type: "factory", from_partner_id: "", to_partner_id: "",
          product_id: "", qty: "", unit_price: "", note: ""
        });
        setFerr({});
        load();
      } catch (err) {
        setMsg({ text: err.message, type: "err" });
      }
      setBusy(false);
    }

    const shown = list.filter(function (s) {
      return matchQ(q, [s.shipment_code, s.from_name, s.to_name, s.to_type, s.sku, s.note]);
    });

    return (
      <div>
        <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
        <div className="card">
          <h2>Dilerlarga tovar berish</h2>
          <form onSubmit={submit}>
            <div className="form-row">
              <div>
                <label>Kimdan</label>
                <select value={form.from_type} onChange={function (e) { setForm(Object.assign({}, form, { from_type: e.target.value })); }}>
                  <option value="factory">Zavod</option>
                  <option value="dealer">Diler</option>
                </select>
              </div>
              {form.from_type === "dealer" ? (
                <div>
                  <label>Diler</label>
                  <select value={form.from_partner_id} onChange={function (e) { setForm(Object.assign({}, form, { from_partner_id: e.target.value })); }} required>
                    <option value="">Tanlang...</option>
                    {dealers.map(function (d) {
                      return <option key={d.id} value={d.id}>{d.name}</option>;
                    })}
                  </select>
                </div>
              ) : null}
              <div>
                <label>Kimga *</label>
                <select value={form.to_partner_id} onChange={function (e) { setForm(Object.assign({}, form, { to_partner_id: e.target.value })); }}>
                  <option value="">Tanlang...</option>
                  {receivers.map(function (p) {
                    return <option key={p.id} value={p.id}>{p.name} ({p.type})</option>;
                  })}
                </select>
                {ferr.to_partner_id ? <div className="field-error">{ferr.to_partner_id}</div> : null}
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Mahsulot *</label>
                <select value={form.product_id} onChange={function (e) { setForm(Object.assign({}, form, { product_id: e.target.value })); }}>
                  <option value="">Tanlang...</option>
                  {products.map(function (p) {
                    return <option key={p.id} value={p.id}>{p.sku}</option>;
                  })}
                </select>
                {ferr.product_id ? <div className="field-error">{ferr.product_id}</div> : null}
              </div>
              <div>
                <label>Miqdor (dona) *</label>
                <input type="number" value={form.qty} onChange={function (e) { setForm(Object.assign({}, form, { qty: e.target.value })); }} />
                {ferr.qty ? <div className="field-error">{ferr.qty}</div> : null}
              </div>
              <div>
                <label>Narx (bosh = avto)</label>
                <input type="number" value={form.unit_price} onChange={function (e) { setForm(Object.assign({}, form, { unit_price: e.target.value })); }} placeholder="Chegirma bilan" />
              </div>
              <div>
                <label>Izoh</label>
                <input value={form.note} onChange={function (e) { setForm(Object.assign({}, form, { note: e.target.value })); }} />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saqlanmoqda..." : "Tovar berish"}</button>
          </form>
        </div>
        <div className="card">
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Dilerlarga berilgan tovar ({shown.length})</h2>
            <input
              type="search"
              placeholder="Qidiruv: kod, mahsulot, hamkor..."
              value={q}
              onChange={function (e) { setQ(e.target.value); }}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kod</th><th>Kimdan</th><th>Kimga</th><th>Mahsulot</th><th>Dona</th><th>Summa</th><th>Sana</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <V2Empty title="Berilgan tovar yo'q" sub="Yuqoridagi formadan boshlang" />
                    </td>
                  </tr>
                ) : shown.map(function (s) {
                  var toRole = s.to_type === "dealer" ? "Diler" : (s.to_type === "agent" ? "Agent" : (s.to_type || ""));
                  return (
                    <tr key={s.id}>
                      <td>{s.shipment_code}</td>
                      <td>{s.from_type === "factory" ? "Zavod" : (s.from_name || "Diler")}</td>
                      <td>{s.to_name}{toRole ? " (" + toRole + ")" : ""}</td>
                      <td>{s.sku}</td>
                      <td>{s.qty}</td>
                      <td>{money(s.total_amount)}</td>
                      <td>{s.given_at ? String(s.given_at).slice(0, 10) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
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

    const load = useCallback(function () {
      api("/api/settings")
        .then(function (r) {
          const d = r.data || {};
          setForm({
            bulk_min_qty: d.bulk_min_qty != null ? String(d.bulk_min_qty) : "500",
            bulk_min_kg: d.bulk_min_kg != null ? String(d.bulk_min_kg) : "1000",
            bulk_discount: d.bulk_discount != null ? String(d.bulk_discount) : "3000",
            default_credit_limit: d.default_credit_limit != null ? String(d.default_credit_limit) : "5000000",
            agents_ui_enabled: (String(d.agents_ui_enabled || "0") === "1" || String(d.agents_ui_enabled || "").toLowerCase() === "true") ? "1" : "0",
            company_name: d.company_name != null ? String(d.company_name) : "",
            company_phone: d.company_phone != null ? String(d.company_phone) : "",
            company_card: d.company_card != null ? String(d.company_card) : "",
            company_card_holder: d.company_card_holder != null ? String(d.company_card_holder) : ""
          });
        })
        .catch(function (e) { setMsg({ text: e.message, type: "err" }); });
    }, [api]);

    useEffect(function () { load(); }, [load]);

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

    return (
      <div>
        <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
        <div className="card">
          <h2>Sozlama</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Chakana mijoz uchun yirik xarid chegirmasi va standart qarz limiti. Diler chegirmasi har bir hamkorda alohida.
          </p>
          <form onSubmit={submit}>
            <div className="form-row">
              <div>
                <label>Yirik chegirma (so'm/dona) *</label>
                <input type="number" value={form.bulk_discount} onChange={function (e) { setForm(Object.assign({}, form, { bulk_discount: e.target.value })); }} />
              </div>
              <div>
                <label>Standart qarz limiti *</label>
                <input type="number" value={form.default_credit_limit} onChange={function (e) { setForm(Object.assign({}, form, { default_credit_limit: e.target.value })); }} />
              </div>
            </div>
            <details className="dash-details">
              <summary>Qo'shimcha</summary>
              <div className="form-row">
                <div>
                  <label>Yirik xarid — kamida dona</label>
                  <input type="number" value={form.bulk_min_qty} onChange={function (e) { setForm(Object.assign({}, form, { bulk_min_qty: e.target.value })); }} />
                </div>
                <div>
                  <label>Yirik xarid — kamida kg</label>
                  <input type="number" value={form.bulk_min_kg} onChange={function (e) { setForm(Object.assign({}, form, { bulk_min_kg: e.target.value })); }} />
                </div>
              </div>
            </details>
            <label className="checkline" style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
              <input
                type="checkbox"
                checked={form.agents_ui_enabled === "1"}
                onChange={function (e) { setForm(Object.assign({}, form, { agents_ui_enabled: e.target.checked ? "1" : "0" })); }}
              />
              <span>Agentlar oynasini ko'rsatish (hozir diler yo'q — yopiq qolsin)</span>
            </label>
            <div className="form-row">
              <div>
                <label>Kompaniya nomi</label>
                <input value={form.company_name} onChange={function (e) { setForm(Object.assign({}, form, { company_name: e.target.value })); }} />
              </div>
              <div>
                <label>Yuk xati telefoni</label>
                <input value={form.company_phone} onChange={function (e) { setForm(Object.assign({}, form, { company_phone: e.target.value })); }} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Karta raqami</label>
                <input value={form.company_card} onChange={function (e) { setForm(Object.assign({}, form, { company_card: e.target.value })); }} />
              </div>
              <div>
                <label>Karta egasi</label>
                <input value={form.company_card_holder} onChange={function (e) { setForm(Object.assign({}, form, { company_card_holder: e.target.value })); }} />
              </div>
            </div>
            <p className="muted">Bu maydonlar telefon ilovasi `/yuk` da chiqadi. Bo'sh karta ko'rsatilmaydi.</p>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Saqlanmoqda..." : "Saqlash"}</button>
          </form>
        </div>
      </div>
    );
  };

  function agentAccessLabel(s) {
    if (s === "approved") return "Tasdiqlangan";
    if (s === "rejected") return "Rad etilgan";
    if (s === "blocked") return "Bloklangan";
    if (s === "pending") return "Kutilmoqda";
    return s || "—";
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

    const load = useCallback(function () {
      const reqPath = showAllRequests
        ? "/api/agent/admin/access-requests"
        : "/api/agent/admin/access-requests?status=pending";
      Promise.all([api("/api/agent/admin/agents"), api(reqPath)])
        .then(function (arr) {
          setAgents(arr[0].data || []);
          setRequests(arr[1].data || []);
          setErr("");
        })
        .catch(function (e) { setErr(e.message); });
    }, [api, showAllRequests]);

    useEffect(function () { load(); }, [load]);

    function openAgent(agent) {
      setSelectedId(agent.id);
      setView("agents");
      Promise.all([
        api("/api/agent/admin/waybills?agent_id=" + agent.id),
        api("/api/agent/admin/debts?agent_id=" + agent.id),
        api("/api/agent/admin/commissions?agent_id=" + agent.id)
      ]).then(function (arr) {
        setDetail({
          agent: agent,
          waybills: arr[0].data || [],
          debts: arr[1].data || [],
          commission: arr[2].data || {}
        });
      }).catch(function (e) { setMsg({ text: e.message, type: "err" }); });
    }

    function decide(row, action) {
      const verb = action === "approve" ? "tasdiqlash" : "rad etish";
      setConfirmState({
        open: true,
        text: (row.full_name || row.telegram_id) + " so'rovini " + verb + "?",
        onConfirm: async function () {
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

    const selected = agents.filter(function (a) { return String(a.id) === String(selectedId); })[0] || null;
    const showCommission = agents.length > 0;

    return (
      <div>
        <V2ConfirmModal
          open={confirmState.open}
          text={confirmState.text}
          onCancel={function () { setConfirmState({ open: false, text: "", onConfirm: null }); }}
          onConfirm={function () { if (confirmState.onConfirm) confirmState.onConfirm(); }}
        />
        <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
        <div className="card">
          <h2>Agentlar</h2>
          <p className="muted">Telegram yuk-xati agentlari, kirish so'rovlari, qarz va komissiya. Hamkorlar ro'yxatidagi turdan alohida.</p>
          <div className="chip-row" role="tablist">
            <button type="button" className={view === "requests" ? "on" : ""} onClick={function () { setView("requests"); }}>Kirish so'rovlari ({requests.length})</button>
            <button type="button" className={view === "agents" ? "on" : ""} onClick={function () { setView("agents"); }}>Agentlar ({agents.length})</button>
          </div>
          {err ? <div className="msg err">{err}</div> : null}
        </div>

        {view === "requests" ? (
          <div className="card">
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>{showAllRequests ? "Barcha so'rovlar" : "Kutilayotgan so'rovlar"}</h2>
              <button type="button" className="btn-ghost btn-sm" onClick={function () { setShowAllRequests(function (v) { return !v; }); }}>
                {showAllRequests ? "Faqat kutilayotgan" : "Barchasini ko'rsat"}
              </button>
            </div>
            {showCommission ? (
              <div className="form-row">
                <div>
                  <label>Komissiya shu sanadan (ixtiyoriy)</label>
                  <input type="date" value={enabledOn} onChange={function (e) { setEnabledOn(e.target.value); }} />
                </div>
              </div>
            ) : null}
            {requests.length === 0 ? <V2Empty title="So'rov yo'q" sub="Mini ilovadan yangi agent yozilsa shu yerda chiqadi." /> : (
              <div className="table-wrap list-dense"><table>
                <thead>
                  <tr><th>Ism</th><th>Telegram</th><th>Holat</th><th>Sana</th><th></th></tr>
                </thead>
                <tbody>
                  {requests.map(function (r) {
                    return (
                      <tr key={r.id}>
                        <td data-label="Ism">{r.full_name || "—"}</td>
                        <td data-label="Telegram">{r.telegram_username ? "@" + r.telegram_username : r.telegram_id}</td>
                        <td data-label="Holat">{agentAccessLabel(r.status)}</td>
                        <td data-label="Sana">{r.created_at ? String(r.created_at).slice(0, 10) : "—"}</td>
                        <td className="sticky-actions" data-label="Amallar">
                          {r.status === "pending" ? (
                            <span>
                              <button type="button" className="btn btn-sm" disabled={busyId === r.id} onClick={function () { decide(r, "approve"); }}>Tasdiqlash</button>
                              <button type="button" className="btn-ghost btn-sm" disabled={busyId === r.id} onClick={function () { decide(r, "reject"); }}>Rad etish</button>
                            </span>
                          ) : <span className="muted">{r.decided_by || ""}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        ) : (
          <div className="card">
            <h2>Agentlar ro'yxati</h2>
            {agents.length === 0 ? <V2Empty title="Agent yo'q" sub="So'rov tasdiqlangach agent shu ro'yxatga tushadi." /> : (
              <div className="table-wrap list-dense"><table>
                <thead>
                  <tr><th>Ism</th><th>Telegram</th><th>Holat</th><th>Qarz</th>{showCommission ? <th>Komissiya</th> : null}<th></th></tr>
                </thead>
                <tbody>
                  {agents.map(function (a) {
                    return (
                      <tr key={a.id}>
                        <td data-label="Ism">{a.full_name || "—"}</td>
                        <td data-label="Telegram">{a.telegram_id || "—"}</td>
                        <td data-label="Holat">{agentAccessLabel(a.access_status)}{a.is_active === false ? " · nofaol" : ""}</td>
                        <td data-label="Qarz">{money(a.debt_total)}</td>
                        {showCommission ? <td data-label="Komissiya">{money(a.commission_balance)}</td> : null}
                        <td className="sticky-actions" data-label="Amallar">
                          <button type="button" className="btn-ghost btn-sm" onClick={function () { openAgent(a); }}>Karta</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        )}

        {selected && detail ? (
          <div className="card">
            <h2>{selected.full_name || "Agent"} · karta</h2>
            <p className="muted">
              {agentAccessLabel(selected.access_status)}
              {selected.commission_enabled_on ? " · komissiya " + String(selected.commission_enabled_on).slice(0, 10) + " dan" : " · komissiya yoqilgan"}
            </p>
            {showCommission ? (
              <div className="dash-kpis">
                <div className="dash-kpi"><div className="label">Hisoblangan</div><div className="value">{money(detail.commission.earned)}</div></div>
                <div className="dash-kpi"><div className="label">Yechilgan</div><div className="value">{money(detail.commission.withdrawn)}</div></div>
                <div className="dash-kpi"><div className="label">Balans</div><div className="value">{money(detail.commission.balance)}</div></div>
              </div>
            ) : null}
            <h3 style={{ fontSize: "0.9rem" }}>Yuk xatlari</h3>
            {(detail.waybills || []).length === 0 ? <div className="muted">Yuk xati yo'q</div> : (
              <div className="table-wrap list-dense"><table>
                <thead><tr><th>Kod</th><th>Mijoz</th><th>Jami</th><th>To'langan</th><th>Qarz</th><th>Sana</th></tr></thead>
                <tbody>
                  {detail.waybills.map(function (w) {
                    return (
                      <tr key={w.id}>
                        <td data-label="Kod">{w.waybill_code}</td>
                        <td data-label="Mijoz">{w.customer_name || "—"}</td>
                        <td data-label="Jami">{money(w.total_amount)}</td>
                        <td data-label="To'langan">{money(w.paid_amount)}</td>
                        <td data-label="Qarz">{money(w.debt_amount)}</td>
                        <td data-label="Sana">{w.created_at ? String(w.created_at).slice(0, 10) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
            <h3 style={{ fontSize: "0.9rem", marginTop: 12 }}>Qarzlar</h3>
            {(detail.debts || []).length === 0 ? <div className="muted">Do'kon yo'q</div> : (
              <div className="table-wrap list-dense"><table>
                <thead><tr><th>Mijoz</th><th>Telefon</th><th>Qarz</th></tr></thead>
                <tbody>
                  {detail.debts.map(function (d) {
                    return (
                      <tr key={d.id}>
                        <td data-label="Mijoz">{d.name}</td>
                        <td data-label="Telefon">{d.phone || "—"}</td>
                        <td data-label="Qarz">{money(d.outstanding_debt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        ) : null}
      </div>
    );
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
    const [trips, setTrips] = useState([]);
    const [reysId, setReysId] = useState("");
    const [reysTouched, setReysTouched] = useState(false);
    const [loadLines, setLoadLines] = useState([{ product_id: "", quantity: "1" }]);
    const [reysNote, setReysNote] = useState("");
    const idemRef = useRef("");
    const reysKey = useRef("");

    const load = useCallback(function () {
      Promise.all([
        api("/api/customers"),
        api("/api/products"),
        api("/api/agent/admin/waybills?scope=admin"),
        api("/api/agent/admin/reyslar").catch(function () { return { data: [] }; })
      ]).then(function (arr) {
        const cust = (arr[0].data || []).filter(function (c) { return c.is_active !== false; });
        setCustomers(cust);
        setProducts((arr[1].data || []).filter(function (p) { return p.is_active !== false; }));
        setRows(arr[2].data || []);
        const list = arr[3].data || [];
        setTrips(list);
        setErr("");
        if (!reysTouched) {
          const open = list.filter(function (t) { return t.status === "open"; })[0];
          setReysId(open ? String(open.id) : "");
        }
      }).catch(function (e) { setErr(e.message); });
    }, [api, reysTouched]);

    useEffect(function () { load(); }, [load]);

    function unitPrice(line) {
      if (line.price !== "" && line.price != null) {
        const n = Math.round(Number(line.price));
        return isFinite(n) ? n : 0;
      }
      const p = products.filter(function (x) { return String(x.id) === String(line.product_id); })[0];
      return p ? Math.round(Number(p.price) || 0) : 0;
    }

    const total = lines.reduce(function (sum, line) {
      const qty = Number(line.quantity);
      if (!(qty > 0) || !line.product_id) return sum;
      return sum + Math.round(unitPrice(line) * qty);
    }, 0);
    const paidN = Math.max(0, Math.round(Number(paid) || 0));
    const debt = Math.max(0, total - paidN);

    function setLine(index, patch) {
      setLines(function (prev) {
        return prev.map(function (line, i) {
          if (i !== index) return line;
          const next = Object.assign({}, line, patch);
          if (patch.product_id != null && patch.price == null) {
            const p = products.filter(function (x) { return String(x.id) === String(patch.product_id); })[0];
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
        const data = await res.json().catch(function () { return {}; });
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
      setTimeout(function () { try { w.print(); } catch (e) {} }, 200);
    }

    async function submit(e) {
      e.preventDefault();
      if (busy) return;
      if (!idemRef.current) {
        idemRef.current = "ui-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 10);
      }
      setBusy(true);
      try {
        const items = lines.filter(function (line) { return line.product_id && Number(line.quantity) > 0; }).map(function (line) {
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
          items: items,
          idempotency_key: idemRef.current
        };
        if (reysId) payload.reys_id = Number(reysId);
        await api("/api/agent/admin/waybills", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        idemRef.current = "";
        setMsg({
          text: reysId
            ? "Yuk xati yozildi. Reys yukidan ayirildi."
            : "Yuk xati yozildi. Ombor shu savdo bilan kamaydi.",
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

    const openTrip = trips.filter(function (t) { return t.status === "open"; })[0] || null;
    const closedTrips = trips.filter(function (t) { return t.status !== "open"; });

    function setLoadLine(index, patch) {
      setLoadLines(function (prev) {
        return prev.map(function (line, i) { return i === index ? Object.assign({}, line, patch) : line; });
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
        const items = loadLines.filter(function (line) { return line.product_id && Number(line.quantity) > 0; }).map(function (line) {
          return { product_id: Number(line.product_id), quantity: Number(line.quantity) };
        });
        const created = await api("/api/agent/admin/reyslar", {
          method: "POST",
          body: JSON.stringify({ items: items, note: reysNote || null, idempotency_key: reysKey.current })
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
      if (!window.confirm("Qolgan yuk omborga qaytadi. Reysni yopasizmi?")) return;
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

    function TripSummary(props) {
      const s = props.trip.summary || {};
      return (
        <div>
          <p className="muted">{props.trip.reys_code} · {props.trip.status === "open" ? "Yo'lda" : "Yopilgan"}</p>
          <p>Yuklandi {s.yuklandi || 0} · Sotildi {s.sotildi || 0} · Qaytdi {s.qaytdi || 0} · Yo'lda {s.yolda || 0}</p>
          <p>Tushum {money(s.tushum)} · Qarz {money(s.qarz)}</p>
          {(s.lines || []).length ? (
            <div className="table-wrap list-dense"><table>
              <thead><tr><th>Mahsulot</th><th>Yuklandi</th><th>Sotildi</th><th>Qaytdi</th><th>Yo'lda</th></tr></thead>
              <tbody>
                {s.lines.map(function (line) {
                  return (
                    <tr key={line.product_id}>
                      <td data-label="Mahsulot">{line.sku || ("#" + line.product_id)}</td>
                      <td data-label="Yuklandi">{line.loaded_qty}</td>
                      <td data-label="Sotildi">{line.sold_qty}</td>
                      <td data-label="Qaytdi">{line.returned_qty}</td>
                      <td data-label="Yo'lda">{line.yolda_qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : null}
        </div>
      );
    }

    return (
      <div>
        <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
        <div className="card">
          <h2>Reys</h2>
          <p className="muted">Yukni ombordan yo'lga chiqaring. Shu reysdagi yuk xati shu yukdan ayiriladi. Yopilganda qolgani omborga qaytadi. Reyssiz yuk xati ham yoziladi.</p>
          {openTrip ? (
            <div>
              <TripSummary trip={openTrip} />
              <button type="button" className="btn" disabled={busy} onClick={function () { closeTrip(openTrip); }}>Reysni yopish</button>
            </div>
          ) : (
            <form onSubmit={startTrip}>
              {loadLines.map(function (line, index) {
                return (
                  <div className="form-row" key={index}>
                    <div>
                      <label>Mahsulot *</label>
                      <select value={line.product_id} onChange={function (e) { setLoadLine(index, { product_id: e.target.value }); }} required={index === 0}>
                        <option value="">Tanlang</option>
                        {products.map(function (p) {
                          return <option key={p.id} value={p.id}>{p.sku}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label>Yuklandi</label>
                      <input type="number" min="1" step="1" value={line.quantity} onChange={function (e) { setLoadLine(index, { quantity: e.target.value }); }} />
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn-ghost btn-sm" onClick={function () {
                setLoadLines(function (prev) { return prev.concat([{ product_id: "", quantity: "1" }]); });
              }}>Mahsulot qo'shish</button>
              <div className="form-row">
                <div>
                  <label>Izoh</label>
                  <input value={reysNote} onChange={function (e) { setReysNote(e.target.value); }} />
                </div>
              </div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Yozilmoqda..." : "Reysni boshlash"}</button>
            </form>
          )}
          {closedTrips.length ? (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: "0.9rem" }}>Yopilgan reyslar</h3>
              {closedTrips.slice(0, 5).map(function (trip) {
                return <TripSummary key={trip.id} trip={trip} />;
              })}
            </div>
          ) : null}
        </div>
        <div className="card">
          <h2>Yuk tarqatish</h2>
          <p className="muted">Do'konga chiqib yozilgan savdo. Hujjat — yuk xati. Buyurtmalar ro'yxatiga tushmaydi. Reyssiz yuk xati ombordan bir marta kamayadi. Reys ichidagi yuk xati shu reys yukidan ayiriladi, ombordan ikkinchi marta emas.</p>
          {err ? <div className="msg err">{err}</div> : null}
          <form onSubmit={submit}>
            <div className="form-row">
              <div>
                <label>Reys</label>
                <select value={reysId} onChange={function (e) { setReysTouched(true); setReysId(e.target.value); }}>
                  <option value="">Reyssiz — ombordan</option>
                  {openTrip ? <option value={String(openTrip.id)}>{openTrip.reys_code} · yo'lda</option> : null}
                </select>
                <p className="muted">{reysId ? "Shu reys yukidan ayiriladi." : "Ombordan bir marta kamayadi."}</p>
              </div>
              <div>
                <label>Mijoz *</label>
                <select value={customerId} onChange={function (e) { setCustomerId(e.target.value); }} required>
                  <option value="">Tanlang</option>
                  {customers.map(function (c) {
                    return <option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <label>Boshlang'ich to'lov</label>
                <input type="number" min="0" value={paid} onChange={function (e) { setPaid(e.target.value); }} />
              </div>
              <div>
                <label>Qarz muddati</label>
                <input type="date" value={due} onChange={function (e) { setDue(e.target.value); }} />
              </div>
            </div>
            {lines.map(function (line, index) {
              return (
                <div className="form-row" key={index}>
                  <div>
                    <label>Mahsulot *</label>
                    <select value={line.product_id} onChange={function (e) { setLine(index, { product_id: e.target.value }); }} required={index === 0}>
                      <option value="">Tanlang</option>
                      {products.map(function (p) {
                        return <option key={p.id} value={p.id}>{p.sku}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label>Dona</label>
                    <input type="number" min="1" step="1" value={line.quantity} onChange={function (e) { setLine(index, { quantity: e.target.value }); }} />
                  </div>
                  <div>
                    <label>Narx</label>
                    <input type="number" min="0" value={line.price} onChange={function (e) { setLine(index, { price: e.target.value }); }} />
                  </div>
                  <div style={{ alignSelf: "end" }}>
                    {lines.length > 1 ? (
                      <button type="button" className="btn-ghost btn-sm" onClick={function () {
                        setLines(function (prev) { return prev.filter(function (_l, i) { return i !== index; }); });
                      }}>Olib tashlash</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn-ghost btn-sm" onClick={function () {
              setLines(function (prev) { return prev.concat([{ product_id: "", quantity: "1", price: "" }]); });
            }}>Mahsulot qo'shish</button>
            <div className="form-row">
              <div>
                <label>Izoh</label>
                <input value={note} onChange={function (e) { setNote(e.target.value); }} />
              </div>
            </div>
            <p className="muted">Jami {money(total)} · To'langan {money(paidN)} · Qarz {money(debt)}</p>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Yozilmoqda..." : "Yuk xatini yozish"}</button>
          </form>
        </div>

        <div className="card">
          <h2>Yuk xatlar</h2>
          {rows.length === 0 ? <V2Empty title="Yuk xati yo'q" sub="Yuqoridagi formadan boshlang." /> : (
            <div className="table-wrap list-dense"><table>
              <thead>
                <tr><th>Kod</th><th>Mijoz</th><th>Reys</th><th>Jami</th><th>To'langan</th><th>Qarz</th><th>Holat</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map(function (w) {
                  return (
                    <tr key={w.id}>
                      <td data-label="Kod">{w.waybill_code}</td>
                      <td data-label="Mijoz">{w.customer_name || "—"}</td>
                      <td data-label="Reys">{(trips.filter(function (t) { return String(t.id) === String(w.reys_id); })[0] || {}).reys_code || "—"}</td>
                      <td data-label="Jami">{money(w.total_amount)}</td>
                      <td data-label="To'langan">{money(w.paid_amount)}</td>
                      <td data-label="Qarz">{money(w.debt_amount)}</td>
                      <td data-label="Holat">{w.status === "paid" ? "To'langan" : (w.status === "partial" ? "Qisman" : "Qarz")}</td>
                      <td className="sticky-actions" data-label="Amallar">
                        <button type="button" className="btn-ghost btn-sm" onClick={function () {
                          openDoc(w.id, "html").catch(function (e) { setMsg({ text: e.message, type: "err" }); });
                        }}>Chop etish</button>
                        <button type="button" className="btn-ghost btn-sm" onClick={function () {
                          openDoc(w.id, "pdf").catch(function (e) { setMsg({ text: e.message, type: "err" }); });
                        }}>PDF</button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={function () { sendBill(w); }}>Yuborish</button>
                        {Number(w.debt_amount) > 0 ? (
                          <button type="button" className="btn btn-sm" onClick={function () { setPayFor(w); setPayAmount(String(Math.round(Number(w.debt_amount) || 0))); }}>Qarz</button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
          {payFor ? (
            <form onSubmit={recordPay} style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: "0.9rem" }}>{payFor.waybill_code} · qarz to'lovi</h3>
              <div className="form-row">
                <div>
                  <label>Summa</label>
                  <input type="number" min="1" value={payAmount} onChange={function (e) { setPayAmount(e.target.value); }} />
                </div>
              </div>
              <button className="btn btn-sm" type="submit" disabled={busy}>Yozish</button>
              <button type="button" className="btn-ghost btn-sm" onClick={function () { setPayFor(null); }}>Bekor</button>
            </form>
          ) : null}
        </div>
      </div>
    );
  };
})();
