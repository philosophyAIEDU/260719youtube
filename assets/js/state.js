/* =====================================================================
 * state.js — 마지막 분석의 공유 상태.
 * app.js 가 채우고, chat.js / ui.js 의 재검증 기능이 읽습니다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.state = {
  channel: null,
  videos: null,
  signals: null,
  lastResult: null,
  lastModel: null,

  set: function (patch) {
    Object.keys(patch).forEach(function (k) { PhilApp.state[k] = patch[k]; });
  },
  reset: function () {
    this.set({ channel: null, videos: null, signals: null, lastResult: null, lastModel: null });
  },
  isReady: function () {
    return !!(this.channel && this.videos && this.signals);
  }
};
