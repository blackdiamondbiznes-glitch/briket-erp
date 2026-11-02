(function () {
  function readyTg() {
    try {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return;
      tg.ready();
      if (tg.expand) tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    } catch (e) {}
  }
  readyTg();
  document.addEventListener("DOMContentLoaded", readyTg);
  window.addEventListener("pageshow", readyTg);
})();
