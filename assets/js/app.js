/* =====================================================================
 * app.js — 전체 흐름 오케스트레이션 + 설정 화면 제어.
 *   입력 → YouTube 데이터 수집 → 신호 가공 → 프롬프트 → Gemini → 렌더
 * ===================================================================== */
(function () {
  "use strict";
  var P = window.PhilApp;
  var u = P.utils, $ = u.$;
  var storage = P.storage, yt = P.youtube, ui = P.ui;

  /* ---------- 설정 화면 ---------- */
  function openSettings() {
    $("yt-key").value = storage.getYT();
    $("gm-key").value = storage.getGM();
    u.show($("view-settings"));
    u.hide($("view-main"));
    window.scrollTo(0, 0);
  }
  function closeSettings() {
    u.hide($("view-settings"));
    u.show($("view-main"));
  }

  $("btn-settings").addEventListener("click", openSettings);
  $("btn-close-settings").addEventListener("click", closeSettings);
  $("btn-save-keys").addEventListener("click", function () {
    storage.setKeys($("yt-key").value, $("gm-key").value);
    closeSettings();
    ui.banner("API 키가 이 브라우저에 저장되었습니다. 채널 주소를 입력하고 분석해 보세요.", "info");
  });

  // 키 표시 토글
  document.querySelectorAll("[data-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = $(btn.getAttribute("data-toggle"));
      if (!input) return;
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "표시" : "숨기기";
    });
  });

  /* ---------- 분석 흐름 ---------- */
  function analyze() {
    ui.banner("");
    u.hide($("results"));

    if (!storage.hasKeys()) {
      ui.banner("먼저 API 키를 입력해야 합니다. 설정 화면으로 이동합니다.", "info");
      openSettings();
      return;
    }

    var parsed = yt.parseInput($("chan-input").value);
    if (!parsed) {
      ui.banner("채널 주소 또는 핸들을 입력해 주세요.", "error");
      return;
    }

    $("btn-analyze").disabled = true;
    u.show($("loading"));

    var channelObj = null;
    yt.resolveChannel(parsed)
      .then(function (channel) {
        channelObj = channel;
        return yt.fetchRecentVideos(channel, P.config.MAX_VIDEOS);
      })
      .then(function (videos) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;

        videos.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
        ui.renderResults(channelObj, videos);

        if (!videos.length) {
          ui.aiError("영상이 없어 서사 분석을 진행할 수 없습니다.");
          return;
        }

        // 신호 가공 → 프롬프트 → Gemini
        var sig = P.analysis.computeSignals(channelObj, videos);
        var prompt = P.prompts.build(channelObj, videos, sig);

        P.gemini.analyze(prompt)
          .then(function (out) { ui.renderAnalysis(out.result, out.model); })
          .catch(function (err) { ui.aiError((err && err.message) || "AI 분석 중 오류가 발생했습니다."); });
      })
      .catch(function (err) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;
        var msg = err && err.message;
        if (msg === "NOTFOUND") {
          ui.banner("채널을 찾을 수 없습니다. 주소를 다시 확인해주세요.", "error");
        } else {
          ui.banner(u.esc(msg || "알 수 없는 오류가 발생했습니다."), "error");
        }
      });
  }

  $("btn-analyze").addEventListener("click", analyze);
  $("chan-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") analyze();
  });

  /* ---------- 초기화 ---------- */
  if (!storage.hasKeys()) openSettings();
})();
