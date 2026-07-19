/* =====================================================================
 * ratelimit.js — 브라우저별 사용 제한.
 *
 * 공용(내장) 키를 한 방문자가 통째로 태워버리지 못하게 보호합니다.
 * 서버가 없어 '모든 사용자 합산'은 불가능하므로, 이 제한은 방문자 1인당
 * 상한선입니다. 전체 무료 한도 보호는 이 제한 + API 자동 정지(429/403)
 * 처리의 2중 구조로 이뤄집니다.
 *
 * 사용자가 '자기 키'를 직접 입력한 경우엔 자기 할당량을 쓰는 것이므로
 * 이 제한을 적용하지 않습니다(내장 키를 쓸 때만 보호).
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.ratelimit = (function () {
  var cfg = PhilApp.config;
  var LS = "phil_usage_log";
  var HOUR = 3600 * 1000;
  var DAY = 24 * HOUR;

  function load() {
    try { return JSON.parse(localStorage.getItem(LS) || "[]"); }
    catch (e) { return []; }
  }
  function save(arr) {
    // 최근 24시간만 보관
    var cutoff = Date.now() - DAY;
    var pruned = arr.filter(function (t) { return t >= cutoff; });
    localStorage.setItem(LS, JSON.stringify(pruned));
    return pruned;
  }

  function counts() {
    var now = Date.now();
    var log = load();
    var hour = 0, day = 0;
    log.forEach(function (t) {
      if (t >= now - DAY) day++;
      if (t >= now - HOUR) hour++;
    });
    return { hour: hour, day: day, log: log };
  }

  // 이번 분석을 허용할지 판단. { allowed, message }
  function check() {
    var lim = cfg.RATE_LIMIT || { perHour: 8, perDay: 25 };
    var c = counts();

    if (c.day >= lim.perDay) {
      return {
        allowed: false,
        message: "오늘 이 브라우저의 무료 분석 한도(" + lim.perDay +
          "회)를 모두 사용했습니다. 공용 무료 한도를 보호하기 위한 제한이며, " +
          "내일 다시 시도하거나 설정에서 본인의 API 키를 입력하면 제한 없이 사용할 수 있습니다."
      };
    }
    if (c.hour >= lim.perHour) {
      var oldestInHour = c.log.filter(function (t) { return t >= Date.now() - HOUR; }).sort(function (a, b) { return a - b; })[0];
      var waitMin = oldestInHour ? Math.ceil((oldestInHour + HOUR - Date.now()) / 60000) : 60;
      return {
        allowed: false,
        message: "잠시 후 다시 시도해 주세요. 시간당 분석 한도(" + lim.perHour +
          "회)에 도달했습니다. 약 " + waitMin + "분 후 다시 가능합니다. " +
          "(설정에서 본인의 API 키를 입력하면 제한 없이 사용할 수 있습니다.)"
      };
    }
    return { allowed: true };
  }

  // 분석 1회 사용 기록
  function record() {
    var log = load();
    log.push(Date.now());
    save(log);
  }

  return { check: check, record: record, counts: counts };
})();
