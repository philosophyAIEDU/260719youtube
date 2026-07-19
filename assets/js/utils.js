/* =====================================================================
 * utils.js — 순수 헬퍼 (포맷팅, 이스케이프, DOM 단축)
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.utils = (function () {
  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // 줄바꿈을 <br> 로 (이스케이프 후)
  function escMultiline(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

  function fmtInt(n) {
    n = Number(n);
    if (!isFinite(n)) return "-";
    return n.toLocaleString("ko-KR");
  }

  // 12,345 → 1.2만 / 1.3억 (한국식 큰 수 축약)
  function fmtCompact(n) {
    n = Number(n);
    if (!isFinite(n)) return "-";
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    return n.toLocaleString("ko-KR");
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.getFullYear() + "." +
      String(d.getMonth() + 1).padStart(2, "0") + "." +
      String(d.getDate()).padStart(2, "0");
  }

  function daysBetween(a, b) {
    return Math.abs(new Date(a) - new Date(b)) / 86400000;
  }

  function pct(x, digits) {
    if (!isFinite(x)) return "-";
    return (x * 100).toFixed(digits == null ? 2 : digits) + "%";
  }

  return {
    $: $, show: show, hide: hide,
    esc: esc, escMultiline: escMultiline,
    fmtInt: fmtInt, fmtCompact: fmtCompact, fmtDate: fmtDate,
    daysBetween: daysBetween, pct: pct
  };
})();
