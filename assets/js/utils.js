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

  // 오늘 날짜를 로컬 기준 "YYYY-MM-DD" 로 (UTC 변환에 의한 하루 밀림 방지 — <input type="date"> 값과 직접 비교 가능)
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  var WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

  // "YYYY-MM-DD" → "7.22 (화)" 같은 표시용 포맷 (input type=date 값 그대로 파싱, 로컬 자정 기준)
  function fmtDueDate(dateStr) {
    if (!dateStr) return "";
    var parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return dateStr;
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(d.getTime())) return dateStr;
    return parts[1] + "." + parts[2] + " (" + WEEKDAY_KO[d.getDay()] + ")";
  }

  function pct(x, digits) {
    if (!isFinite(x)) return "-";
    return (x * 100).toFixed(digits == null ? 2 : digits) + "%";
  }

  function clampScore(s) {
    s = Number(s);
    if (!isFinite(s)) return 0;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  // 점수 → 색상 클래스 (좋음/보통/약함)
  function scoreClass(s) {
    s = clampScore(s);
    if (s >= 75) return "sc-high";
    if (s >= 55) return "sc-mid";
    if (s >= 35) return "sc-low";
    return "sc-crit";
  }

  // 점수 → 라벨
  function scoreLabel(s) {
    s = clampScore(s);
    if (s >= 90) return "탁월";
    if (s >= 75) return "우수";
    if (s >= 55) return "보통";
    if (s >= 35) return "약함";
    return "부재";
  }

  return {
    $: $, show: show, hide: hide,
    esc: esc, escMultiline: escMultiline,
    fmtInt: fmtInt, fmtCompact: fmtCompact, fmtDate: fmtDate,
    daysBetween: daysBetween, pct: pct,
    todayStr: todayStr, fmtDueDate: fmtDueDate,
    clampScore: clampScore, scoreClass: scoreClass, scoreLabel: scoreLabel
  };
})();
