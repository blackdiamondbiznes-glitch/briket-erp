/* Admin v2: Hamkorlar, Yuk, Biznes sozlama */
const { useState, useEffect, useCallback } = React;
function money(n) {
  return Number(n || 0).toLocaleString("uz-UZ");
}
function Msg(props) {
  if (!props.text) return null;
  return (
    <div className={"msg " + (props.type || "ok")} onClick={props.onClose}>
      {props.text}
    </div>
  );
}

window.Partners = function Partners(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    name: "", phone: "", address: "", type: "customer",
    parent_id: "", region: "", district: "",
    discount_type: "none", discount_value: "", credit_limit: "", note: ""
  });
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState({});

  const load = useCallback(function () {
    const q = filter ? "?type=" + encodeURIComponent(filter) : "";
    api("/api/partners" + q)
      .then(function (r) { setList(r.data || []); })
      .catch(function (e) { setMsg({ text: e.message, type: "err" }); });
  }, [api, filter]);

  useEffect(function () { load(); }, [load]);

  const dealers = list.filter(function (p) { return p.type === "dealer"; });

  function resetForm() {
    setForm({
      name: "", phone: "", address: "", type: "customer",
      parent_id: "", region: "", district: "",
      discount_type: "none", discount_value: "", credit_limit: "", note: ""
    });
    setEditId(null);
  }

  async function submit(e) {
    e.preventDefault();
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
        setMsg({ text: "Hamkor yangilandi", type: "ok" });
      } else {
        await api("/api/partners", { method: "POST", body: JSON.stringify(body) });
        setMsg({ text: "Hamkor qoshildi", type: "ok" });
      }
      resetForm();
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }

  function startEdit(p) {
    setEditId(p.id);
    setForm({
      name: p.name || "", phone: p.phone || "", address: p.address || "",
      type: p.type || "customer", parent_id: p.parent_id ? String(p.parent_id) : "",
      region: p.region || "", district: p.district || "",
      discount_type: p.discount_type || "none",
      discount_value: p.discount_value != null ? String(p.discount_value) : "",
      credit_limit: p.credit_limit != null ? String(p.credit_limit) : "",
      note: p.note || ""
    });
  }

  async function softDelete(id) {
    if (!window.confirm("Hamkorni ochirish (nofaol qilish)?")) return;
    try {
      await api("/api/partners/" + id, { method: "DELETE" });
      setMsg({ text: "Nofaol qilindi", type: "ok" });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }

  const typeLabel = { customer: "Mijoz", dealer: "Diler", agent: "Agent" };
  const discLabel = { none: "Yoq", bulk: "Bulk (500+)", fixed_amount: "Doimiy som", fixed_percent: "Doimiy %" };

  return (
    <div>
      <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
      <div className="card">
        <h2>{editId ? "Hamkorni tahrirlash #" + editId : "Yangi hamkor"}</h2>
        <form onSubmit={submit}>
          <div className="form-row">
            <div>
              <label>Ism *</label>
              <input value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }} required />
            </div>
            <div>
              <label>Rol *</label>
              <select value={form.type} onChange={function (e) { setForm(Object.assign({}, form, { type: e.target.value })); }}>
                <option value="customer">Mijoz</option>
                <option value="dealer">Diler</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <div>
              <label>Telefon</label>
              <input value={form.phone} onChange={function (e) { setForm(Object.assign({}, form, { phone: e.target.value })); }} />
            </div>
            <div>
              <label>Manzil</label>
              <input value={form.address} onChange={function (e) { setForm(Object.assign({}, form, { address: e.target.value })); }} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Chegirma turi</label>
              <select value={form.discount_type} onChange={function (e) { setForm(Object.assign({}, form, { discount_type: e.target.value })); }}>
                <option value="none">Yoq</option>
                <option value="bulk">Bulk (faqat mijoz)</option>
                <option value="fixed_amount">Doimiy (som/dona)</option>
                <option value="fixed_percent">Doimiy (%)</option>
              </select>
            </div>
            <div>
              <label>Chegirma qiymati</label>
              <input type="number" value={form.discount_value} onChange={function (e) { setForm(Object.assign({}, form, { discount_value: e.target.value })); }} placeholder="3000 yoki 10" />
            </div>
            <div>
              <label>Kredit limiti</label>
              <input type="number" value={form.credit_limit} onChange={function (e) { setForm(Object.assign({}, form, { credit_limit: e.target.value })); }} />
            </div>
            <div>
              <label>Diler (agent uchun)</label>
              <select value={form.parent_id} onChange={function (e) { setForm(Object.assign({}, form, { parent_id: e.target.value })); }}>
                <option value="">—</option>
                {dealers.map(function (d) {
                  return <option key={d.id} value={d.id}>{d.name}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Region</label>
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
          <button className="btn" type="submit">{editId ? "Saqlash" : "Qoshish"}</button>
          {editId ? (
            <button className="btn-ghost" type="button" style={{ marginLeft: 8 }} onClick={resetForm}>Bekor</button>
          ) : null}
        </form>
      </div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2>Hamkorlar ({list.length})</h2>
          <select value={filter} onChange={function (e) { setFilter(e.target.value); }} style={{ maxWidth: 160 }}>
            <option value="">Hammasi</option>
            <option value="customer">Mijoz</option>
            <option value="dealer">Diler</option>
            <option value="agent">Agent</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ism</th><th>Rol</th><th>Tel</th><th>Chegirma</th><th>Limit</th><th>Diler</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(function (p) {
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
                  <td>
                    <button className="btn-ghost" type="button" onClick={function () { startEdit(p); }}>Tahrir</button>
                    {" "}
                    <button className="btn-ghost" type="button" onClick={function () { softDelete(p.id); }}>Ochirish</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

window.Shipments = function Shipments(props) {
  const api = props.api;
  const [list, setList] = useState([]);
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    from_type: "factory", from_partner_id: "", to_partner_id: "",
    product_id: "", qty: "", unit_price: "", note: ""
  });
  const [msg, setMsg] = useState({});

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
      setMsg({ text: "Yuk berildi", type: "ok" });
      setForm({
        from_type: "factory", from_partner_id: "", to_partner_id: "",
        product_id: "", qty: "", unit_price: "", note: ""
      });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }

  return (
    <div>
      <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
      <div className="card">
        <h2>Yuk berish</h2>
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
              <select value={form.to_partner_id} onChange={function (e) { setForm(Object.assign({}, form, { to_partner_id: e.target.value })); }} required>
                <option value="">Tanlang...</option>
                {receivers.map(function (p) {
                  return <option key={p.id} value={p.id}>{p.name} ({p.type})</option>;
                })}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Mahsulot *</label>
              <select value={form.product_id} onChange={function (e) { setForm(Object.assign({}, form, { product_id: e.target.value })); }} required>
                <option value="">Tanlang...</option>
                {products.map(function (p) {
                  return <option key={p.id} value={p.id}>{p.sku}</option>;
                })}
              </select>
            </div>
            <div>
              <label>Miqdor (dona) *</label>
              <input type="number" value={form.qty} onChange={function (e) { setForm(Object.assign({}, form, { qty: e.target.value })); }} required />
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
          <button className="btn" type="submit">Yuk berish</button>
        </form>
      </div>
      <div className="card">
        <h2>Oxirgi yuklar ({list.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Kod</th><th>Kimdan</th><th>Kimga</th><th>SKU</th><th>Dona</th><th>Summa</th><th>Sana</th>
            </tr>
          </thead>
          <tbody>
            {list.map(function (s) {
              return (
                <tr key={s.id}>
                  <td>{s.shipment_code}</td>
                  <td>{s.from_type === "factory" ? "Zavod" : (s.from_name || "Diler")}</td>
                  <td>{s.to_name} ({s.to_type})</td>
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
  );
};

window.BizSettings = function BizSettings(props) {
  const api = props.api;
  const [form, setForm] = useState({
    bulk_min_qty: "500",
    bulk_min_kg: "1000",
    bulk_discount: "3000",
    default_credit_limit: "5000000"
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
          default_credit_limit: d.default_credit_limit != null ? String(d.default_credit_limit) : "5000000"
        });
      })
      .catch(function (e) { setMsg({ text: e.message, type: "err" }); });
  }, [api]);

  useEffect(function () { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setMsg({ text: "Sozlamalar saqlandi", type: "ok" });
      load();
    } catch (err) {
      setMsg({ text: err.message, type: "err" });
    }
  }

  return (
    <div>
      <Msg text={msg.text} type={msg.type} onClose={function () { setMsg({}); }} />
      <div className="card">
        <h2>Biznes sozlamalari</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Oddiy mijoz uchun yirik xarid chegirmasi. Diler chegirmasi har bir hamkorda alohida.
        </p>
        <form onSubmit={submit}>
          <div className="form-row">
            <div>
              <label>Yirik xarid min. dona</label>
              <input type="number" value={form.bulk_min_qty} onChange={function (e) { setForm(Object.assign({}, form, { bulk_min_qty: e.target.value })); }} />
            </div>
            <div>
              <label>Yirik xarid min. kg</label>
              <input type="number" value={form.bulk_min_kg} onChange={function (e) { setForm(Object.assign({}, form, { bulk_min_kg: e.target.value })); }} />
            </div>
            <div>
              <label>Yirik chegirma (som/dona)</label>
              <input type="number" value={form.bulk_discount} onChange={function (e) { setForm(Object.assign({}, form, { bulk_discount: e.target.value })); }} />
            </div>
            <div>
              <label>Default kredit limiti</label>
              <input type="number" value={form.default_credit_limit} onChange={function (e) { setForm(Object.assign({}, form, { default_credit_limit: e.target.value })); }} />
            </div>
          </div>
          <button className="btn" type="submit">Saqlash</button>
        </form>
      </div>
    </div>
  );
};
