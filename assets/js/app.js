/* =====================================================================
 * app.js — 전체 흐름 오케스트레이션 + 설정 화면 제어.
 *   입력 → YouTube 전체 영상 수집(페이지네이션) → 신호 가공 → 프롬프트
 *   → Gemini → 렌더 → 채팅 위젯 활성화
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
    var b = storage.usingBuiltin();
    var note = $("settings-builtin-note");
    if (note) {
      if (b.yt || b.gm) {
        note.innerHTML = "✅ 현재 <b>공용 키</b>로 바로 사용할 수 있습니다. 키를 비워두면 공용 키가 쓰이며, " +
          "본인 키를 입력하면 개인 할당량으로 <b>사용 제한 없이</b> 사용됩니다.";
        u.show(note);
      } else {
        u.hide(note);
      }
    }
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

  function setLoadingText(text) {
    var el = $("loading-text");
    if (el) el.textContent = text;
  }

  /* ---------- 분석 흐름 ---------- */
  function analyze() {
    ui.banner("");
    u.hide($("results"));
    P.state.reset();
    P.chat.reset();
    P.chat.disable();

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

    // 공용(내장) 키를 쓸 때만 브라우저별 사용 제한 적용. 본인 키면 제한 없음.
    var b = storage.usingBuiltin();
    var usingShared = b.yt || b.gm;
    if (usingShared) {
      var gate = P.ratelimit.check();
      if (!gate.allowed) {
        ui.banner(u.esc(gate.message), "info");
        return;
      }
    }

    $("btn-analyze").disabled = true;
    setLoadingText("채널 정보를 불러오는 중입니다...");
    u.show($("loading"));
    if (usingShared) P.ratelimit.record();

    var channelObj = null;
    yt.resolveChannel(parsed)
      .then(function (channel) {
        channelObj = channel;
        setLoadingText("채널의 전체 영상 목록을 수집하는 중입니다...");
        return yt.fetchAllVideos(channel, {
          cap: P.config.MAX_VIDEOS_FETCH,
          onProgress: function (p) {
            if (p.phase === "list") {
              setLoadingText("영상 목록을 수집하는 중입니다... (" + u.fmtInt(p.collected) + "개 발견)");
            } else {
              setLoadingText("영상 상세 데이터(조회수·좋아요·댓글)를 수집하는 중입니다... (" +
                u.fmtInt(p.collected) + " / " + u.fmtInt(p.total) + ")");
            }
          }
        });
      })
      .then(function (fetchOut) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;

        var videos = fetchOut.videos;
        videos.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });

        var sig = P.analysis.computeSignals(channelObj, videos, {
          fetchedCount: fetchOut.fetchedCount,
          truncated: fetchOut.truncated,
          channelVideoCount: channelObj.statistics ? Number(channelObj.statistics.videoCount || 0) : null
        });

        P.state.set({ channel: channelObj, videos: videos, signals: sig });

        ui.renderResults(channelObj, videos, sig);

        if (!videos.length) {
          ui.aiError("영상이 없어 서사 분석을 진행할 수 없습니다.");
          return;
        }

        var prompt = P.prompts.build(channelObj, videos, sig);

        P.gemini.analyze(prompt)
          .then(function (out) {
            P.state.set({ lastResult: out.result, lastModel: out.model });
            ui.renderAnalysis(out.result, out.model);
            var chanTitle = (channelObj.snippet && channelObj.snippet.title) || "이 채널";
            P.chat.enable(chanTitle);
          })
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
  P.chat.init();
  if (!storage.hasKeys()) openSettings();
})();
