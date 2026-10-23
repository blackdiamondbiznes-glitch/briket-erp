/* In-app bottom sheet for confirm/prompt.
   Simple confirms use Telegram.WebApp.showConfirm when a real WebApp session
   is open. Money actions always use this sheet so the consequence stays visible. */
(function () {
  var root = null;
  var onKey = null;

  function telegramApp() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return null;
    var platform = String(tg.platform || "");
    if (tg.initData || (platform && platform !== "unknown")) return tg;
    return null;
  }

  function close(node, resolve, value) {
    if (onKey) {
      document.removeEventListener("keydown", onKey);
      onKey = null;
    }
    if (node && node.parentNode) node.parentNode.removeChild(node);
    resolve(value);
  }

  function openSheet(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      var back = document.createElement("div");
      back.className = "bd-sheet-back";
      back.setAttribute("role", "presentation");
      var sheet = document.createElement("div");
      sheet.className = "bd-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      var title = document.createElement("h2");
      title.id = "bd-sheet-title";
      title.textContent = opts.title || "Tasdiqlash";
      sheet.setAttribute("aria-labelledby", "bd-sheet-title");
      sheet.appendChild(title);

      if (opts.mode === "prompt") {
        var box = document.createElement("textarea");
        box.className = "bd-sheet-copy";
        box.readOnly = true;
        box.value = opts.text || "";
        sheet.appendChild(box);
      } else {
        var text = document.createElement("p");
        text.className = "bd-sheet-text";
        text.textContent = opts.text || "";
        sheet.appendChild(text);
        if (opts.detail) {
          var detail = document.createElement("p");
          detail.className = "bd-sheet-detail";
          detail.textContent = opts.detail;
          sheet.appendChild(detail);
        }
      }

      var actions = document.createElement("div");
      actions.className = "bd-sheet-actions";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = opts.danger ? "btn btn-danger" : "btn";
      ok.textContent = opts.ok || (opts.mode === "prompt" ? "Yopish" : "Tasdiqlash");
      if (opts.mode !== "prompt") {
        var cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn btn-ghost";
        cancel.textContent = opts.cancel || "Bekor";
        cancel.addEventListener("click", function () { close(back, resolve, false); });
        actions.appendChild(cancel);
      }
      ok.addEventListener("click", function () {
        close(back, resolve, opts.mode === "prompt" ? (opts.text || "") : true);
      });
      actions.appendChild(ok);
      sheet.appendChild(actions);
      back.appendChild(sheet);
      back.addEventListener("click", function (e) {
        if (e.target === back) close(back, resolve, opts.mode === "prompt" ? (opts.text || "") : false);
      });
      onKey = function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          close(back, resolve, opts.mode === "prompt" ? (opts.text || "") : false);
        }
      };
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      root = back;
      var focusEl = opts.mode === "prompt" ? sheet.querySelector("textarea") : ok;
      if (focusEl && focusEl.focus) focusEl.focus();
    });
  }

  function askTelegram(tg, text) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        resolve(!!value);
      }
      try {
        if (typeof tg.showConfirm === "function") {
          var ret = tg.showConfirm(text, done);
          if (ret && typeof ret.then === "function") ret.then(done, reject);
          return;
        }
        if (typeof tg.showPopup === "function") {
          tg.showPopup({
            title: "Tasdiqlash",
            message: text,
            buttons: [
              { id: "cancel", type: "cancel" },
              { id: "ok", type: "ok", text: "Tasdiqlash" }
            ]
          }, function (id) { done(id === "ok"); });
          return;
        }
      } catch (err) {
        reject(err);
        return;
      }
      reject(new Error("no telegram confirm"));
    });
  }

  window.bdConfirm = function (message, opts) {
    opts = opts || {};
    var text = String(message || "");
    var sheetOpts = {
      title: opts.title || (opts.money ? "Pul amali" : "Tasdiqlash"),
      text: text,
      detail: opts.detail || "",
      ok: opts.ok || "Tasdiqlash",
      cancel: opts.cancel || "Bekor",
      danger: !!opts.danger
    };
    if (!opts.money && !opts.forceSheet) {
      var tg = telegramApp();
      if (tg) {
        return askTelegram(tg, text).catch(function () { return openSheet(sheetOpts); });
      }
    }
    return openSheet(sheetOpts);
  };

  window.bdPrompt = function (title, value) {
    return openSheet({
      mode: "prompt",
      title: title || "Nusxa",
      text: String(value == null ? "" : value),
      ok: "Yopish"
    });
  };
})();
