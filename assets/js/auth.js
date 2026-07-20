/* =====================================================================
 * auth.js — Google 로그인 (OAuth 2.0), '본인 채널 자막 분석' 전용.
 *
 *   · 사용자가 자막 분석 체크박스를 켜고 분석을 실행할 때만 동작합니다.
 *     (opt-in — 기본 상태에서는 Google 스크립트조차 불러오지 않습니다)
 *   · 액세스 토큰은 메모리에만 유지합니다(localStorage 저장 안 함).
 *     새로고침하면 다시 로그인해야 합니다.
 *   · 여기서 받는 토큰은 이 브라우저 → Google API 로만 쓰이며,
 *     앱 서버가 없으므로 어디에도 전송되지 않습니다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.auth = (function () {
  var cfg = PhilApp.config;

  var tokenClient = null;
  var accessToken = null;
  var tokenExpiresAt = 0;
  var gisLoadPromise = null;

  function loadGis() {
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.")); };
      document.head.appendChild(s);
    });
    return gisLoadPromise;
  }

  function ensureClient() {
    return loadGis().then(function () {
      if (!cfg.GOOGLE_OAUTH_CLIENT_ID) {
        throw new Error("이 배포에는 자막 분석용 Google 로그인이 설정되어 있지 않습니다.");
      }
      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: cfg.GOOGLE_OAUTH_CLIENT_ID,
          scope: cfg.OAUTH_SCOPE,
          callback: function () {}   // signIn() 호출마다 재정의됨
        });
      }
      return tokenClient;
    });
  }

  function isSignedIn() { return !!accessToken && Date.now() < tokenExpiresAt; }
  function getToken() { return isSignedIn() ? accessToken : null; }

  function signIn() {
    if (isSignedIn()) return Promise.resolve(accessToken);
    return ensureClient().then(function (client) {
      return new Promise(function (resolve, reject) {
        client.callback = function (resp) {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
            resolve(accessToken);
          } else {
            reject(new Error("Google 로그인이 취소되었거나 실패했습니다." + (resp && resp.error ? " (" + resp.error + ")" : "")));
          }
        };
        client.error_callback = function (err) {
          reject(new Error("Google 로그인 중 오류가 발생했습니다." + (err && err.type ? " (" + err.type + ")" : "")));
        };
        client.requestAccessToken({ prompt: accessToken ? "" : "consent" });
      });
    });
  }

  function signOut() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken, function () {}); } catch (e) {}
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  return { signIn: signIn, signOut: signOut, isSignedIn: isSignedIn, getToken: getToken };
})();
