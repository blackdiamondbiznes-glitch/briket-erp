/* Apply Telegram colorScheme to data-theme and keep text/hint/danger at 4.5:1. */
(function () {
  function hexOf(value) {
    var h = String(value || "").trim().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return /^[0-9a-fA-F]{6}$/.test(h) ? h : "";
  }
  function lum(hex) {
    var h = hexOf(hex);
    if (!h) return null;
    function ch(i) {
      var c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  }
  function contrast(fg, bg) {
    var a = lum(fg);
    var b = lum(bg);
    if (a == null || b == null) return null;
    var hi = Math.max(a, b);
    var lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function apply() {
    var root = document.documentElement;
    var tg = window.Telegram && window.Telegram.WebApp;
    var params = (tg && tg.themeParams) || {};
    var bg = params.bg_color || params.bgColor || cssVar("--tg-theme-bg-color");
    var text = params.text_color || params.textColor || cssVar("--tg-theme-text-color");
    var hint = params.hint_color || params.hintColor || cssVar("--tg-theme-hint-color");
    var surface = params.secondary_bg_color || params.secondaryBgColor || cssVar("--tg-theme-secondary-bg-color") || bg;
    var danger = params.destructive_text_color || params.destructiveTextColor || cssVar("--tg-theme-destructive-text-color");
    var scheme = tg && tg.colorScheme;
    var bgL = lum(bg);
    var light = scheme === "light" ? true : scheme === "dark" ? false : (bgL != null ? bgL > 0.45 : false);
    root.setAttribute("data-theme", light ? "light" : "dark");
    root.style.colorScheme = light ? "light" : "dark";

    var safeHint = light ? "#5c5648" : "#c9bfae";
    var safeText = light ? "#111111" : "#f5f0e6";
    var safeDanger = light ? "#b30000" : "#ff8a8a";
    function weak(fg, backgrounds) {
      if (!hexOf(fg)) return true;
      for (var i = 0; i < backgrounds.length; i++) {
        var ratio = contrast(fg, backgrounds[i]);
        if (ratio != null && ratio < 4.5) return true;
      }
      return false;
    }
    var grounds = [bg, surface].filter(Boolean);
    if (grounds.length && weak(text, grounds)) root.style.setProperty("--text", safeText);
    else root.style.removeProperty("--text");
    if (grounds.length && weak(hint, grounds)) root.style.setProperty("--hint", safeHint);
    else root.style.removeProperty("--hint");
    if (grounds.length && weak(danger, grounds)) root.style.setProperty("--danger", safeDanger);
    else root.style.removeProperty("--danger");

    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && hexOf(bg)) themeMeta.setAttribute("content", "#" + hexOf(bg));
    var schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) schemeMeta.setAttribute("content", light ? "light" : "dark");
  }
  apply();
  document.addEventListener("DOMContentLoaded", apply);
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.onEvent) tg.onEvent("themeChanged", apply);
  } catch (e) {}
})();
