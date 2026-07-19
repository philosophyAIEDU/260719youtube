/* =====================================================================
 * storage.js — API 키는 오직 이 브라우저의 localStorage 에만 저장.
 * 외부 서버로 전송하지 않으며 코드에 하드코딩하지 않습니다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.storage = (function () {
  var cfg = PhilApp.config;

  function getYT() { return (localStorage.getItem(cfg.LS_YT) || "").trim(); }
  function getGM() { return (localStorage.getItem(cfg.LS_GM) || "").trim(); }

  function setKeys(yt, gm) {
    localStorage.setItem(cfg.LS_YT, (yt || "").trim());
    localStorage.setItem(cfg.LS_GM, (gm || "").trim());
  }

  function hasKeys() { return !!getYT() && !!getGM(); }

  function clear() {
    localStorage.removeItem(cfg.LS_YT);
    localStorage.removeItem(cfg.LS_GM);
  }

  return { getYT: getYT, getGM: getGM, setKeys: setKeys, hasKeys: hasKeys, clear: clear };
})();
