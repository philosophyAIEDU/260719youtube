/* =====================================================================
 * storage.js — API 키 관리.
 *   · 사용자가 설정에서 입력한 키는 이 브라우저의 localStorage 에만 저장.
 *   · 사용자가 입력하지 않았고 config 에 내장(공용) 키가 있으면 그것을 사용.
 *   · 우선순위: 사용자 입력 키 > 내장 공용 키.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.storage = (function () {
  var cfg = PhilApp.config;

  // 사용자가 직접 저장한 키 (설정 화면 프리필용 / 없으면 "")
  function getYT() { return (localStorage.getItem(cfg.LS_YT) || "").trim(); }
  function getGM() { return (localStorage.getItem(cfg.LS_GM) || "").trim(); }

  // 내장(공용) 키
  function builtinYT() { return (cfg.BUILTIN_YT_KEY || "").trim(); }
  function builtinGM() { return (cfg.BUILTIN_GM_KEY || "").trim(); }

  // 실제 API 호출에 쓰는 유효 키 (사용자 키 > 내장 키)
  function apiYT() { return getYT() || builtinYT(); }
  function apiGM() { return getGM() || builtinGM(); }

  function setKeys(yt, gm) {
    localStorage.setItem(cfg.LS_YT, (yt || "").trim());
    localStorage.setItem(cfg.LS_GM, (gm || "").trim());
  }

  function hasKeys() { return !!apiYT() && !!apiGM(); }

  // 현재 내장 키로 동작 중인지 (안내 문구용)
  function usingBuiltin() {
    return {
      yt: !getYT() && !!builtinYT(),
      gm: !getGM() && !!builtinGM()
    };
  }

  function clear() {
    localStorage.removeItem(cfg.LS_YT);
    localStorage.removeItem(cfg.LS_GM);
  }

  // ---- OAuth 클라이언트 ID (자막 분석 기능용, 비밀 키 아님) ----
  function getOAuth() { return (localStorage.getItem(cfg.LS_OAUTH) || "").trim(); }
  function builtinOAuth() { return (cfg.GOOGLE_OAUTH_CLIENT_ID || "").trim(); }
  function apiOAuth() { return getOAuth() || builtinOAuth(); }
  function setOAuth(clientId) { localStorage.setItem(cfg.LS_OAUTH, (clientId || "").trim()); }
  function hasOAuth() { return !!apiOAuth(); }

  // ---- 분석 모델 선택 (설정 화면 드롭다운) ----
  function getModel() { return (localStorage.getItem(cfg.LS_MODEL) || "").trim(); }
  function setModel(modelId) { localStorage.setItem(cfg.LS_MODEL, (modelId || "").trim()); }
  // 저장된 선택이 현재 제공되는 옵션에 없으면(옵션이 삭제된 경우 등) 기본 모델로 보정
  function apiModel() {
    var m = getModel();
    var valid = (cfg.GEMINI_MODEL_OPTIONS || []).some(function (o) { return o.id === m; });
    return (m && valid) ? m : cfg.GEMINI_MODEL;
  }

  return {
    getYT: getYT, getGM: getGM,
    apiYT: apiYT, apiGM: apiGM,
    builtinYT: builtinYT, builtinGM: builtinGM,
    setKeys: setKeys, hasKeys: hasKeys, usingBuiltin: usingBuiltin, clear: clear,
    getOAuth: getOAuth, apiOAuth: apiOAuth, setOAuth: setOAuth, hasOAuth: hasOAuth,
    getModel: getModel, setModel: setModel, apiModel: apiModel
  };
})();
