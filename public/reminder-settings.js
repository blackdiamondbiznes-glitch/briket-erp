/* global React */
(function () {
  var Previous = window.BizSettings;
  var useState = React.useState;
  var useEffect = React.useEffect;

  function somText(n) {
    var v = Math.round(Number(n) || 0);
    return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
  }

  function ReminderSettings(props) {
    var api = props.api;
    var formState = useState({
      reminders_enabled: "false",
      reminder_repeat_days: "3",
      admin_chat_id: ""
    });
    var form = formState[0];
    var setForm = formState[1];
    var msgState = useState("");
    var msg = msgState[0];
    var setMsg = msgState[1];
    var claimsState = useState([]);
    var claims = claimsState[0];
    var setClaims = claimsState[1];
    var busyState = useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];

    function load() {
      api("/api/settings").then(function (r) {
        var d = r.data || {};
        setForm({
          reminders_enabled: String(d.reminders_enabled || "false"),
          reminder_repeat_days: d.reminder_repeat_days != null ? String(d.reminder_repeat_days) : "3",
          admin_chat_id: d.admin_chat_id != null ? String(d.admin_chat_id) : ""
        });
      }).catch(function (e) { setMsg(e.message); });
      api("/api/reminders/claims").then(function (r) {
        setClaims(r.data || []);
      }).catch(function (e) { setMsg(e.message); });
    }

    useEffect(function () { load(); }, []);

    function save(e) {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          reminders_enabled: form.reminders_enabled === "true" ? "true" : "false",
          reminder_repeat_days: String(form.reminder_repeat_days || "3"),
          admin_chat_id: String(form.admin_chat_id || "")
        })
      }).then(function () {
        setMsg("Eslatma sozlamalari saqlandi");
        load();
      }).catch(function (err) {
        setMsg(err.message);
      }).then(function () { setBusy(false); });
    }

    function sendNow() {
      if (busy) return;
      setBusy(true);
      api("/api/reminders/run", { method: "POST", body: "{}" }).then(function (r) {
        var data = r.data || {};
        var count = (data.sent || []).length;
        setMsg("Yuborildi: " + count);
      }).catch(function (err) {
        setMsg(err.message);
      }).then(function () { setBusy(false); });
    }

    var on = form.reminders_enabled === "true" || form.reminders_enabled === "1";
    return React.createElement("div", { className: "card" },
      React.createElement("h2", null, "Qarz eslatmasi"),
      React.createElement("p", { className: "muted" },
        "Sukut o'chiq. Yoqilganda har kuni 10:00 (Toshkent) muddati kelgan yuk xatiga @briket_mijoz_bot yozadi."
      ),
      msg ? React.createElement("div", { className: "msg ok" }, msg) : null,
      React.createElement("form", { onSubmit: save },
        React.createElement("label", { className: "checkline", style: { display: "flex", gap: 8, alignItems: "center", margin: "12px 0" } },
          React.createElement("input", {
            type: "checkbox",
            checked: on,
            onChange: function (e) {
              setForm(Object.assign({}, form, { reminders_enabled: e.target.checked ? "true" : "false" }));
            }
          }),
          React.createElement("span", null, "Eslatmalarni yoqish")
        ),
        React.createElement("div", { className: "form-row" },
          React.createElement("div", null,
            React.createElement("label", null, "Takror kunlar"),
            React.createElement("input", {
              type: "number",
              min: "1",
              value: form.reminder_repeat_days,
              onChange: function (e) {
                setForm(Object.assign({}, form, { reminder_repeat_days: e.target.value }));
              }
            })
          ),
          React.createElement("div", null,
            React.createElement("label", null, "Admin chat id"),
            React.createElement("input", {
              value: form.admin_chat_id,
              onChange: function (e) {
                setForm(Object.assign({}, form, { admin_chat_id: e.target.value }));
              }
            })
          )
        ),
        React.createElement("button", { className: "btn", type: "submit", disabled: busy }, "Saqlash"),
        " ",
        React.createElement("button", { className: "btn", type: "button", disabled: busy, onClick: sendNow }, "Hozir yubor (test)")
      ),
      React.createElement("h2", { style: { marginTop: 18 } }, "To'ladim so'rovlari"),
      claims.length
        ? React.createElement("div", { className: "table-wrap" },
          React.createElement("table", null,
            React.createElement("thead", null,
              React.createElement("tr", null,
                React.createElement("th", null, "#"),
                React.createElement("th", null, "Do'kon"),
                React.createElement("th", null, "Yuk xati"),
                React.createElement("th", null, "Summa"),
                React.createElement("th", null, "Holat")
              )
            ),
            React.createElement("tbody", null, claims.map(function (row) {
              return React.createElement("tr", { key: row.id },
                React.createElement("td", null, row.id),
                React.createElement("td", null, row.customer_name || ""),
                React.createElement("td", null, row.waybill_code || ""),
                React.createElement("td", null, somText(row.amount)),
                React.createElement("td", null, row.status || "")
              );
            }))
          )
        )
        : React.createElement("p", { className: "muted" }, "So'rov yo'q")
    );
  }

  window.BizSettings = function BizSettings(props) {
    return React.createElement("div", null,
      Previous ? React.createElement(Previous, props) : null,
      React.createElement(ReminderSettings, props)
    );
  };
})();
