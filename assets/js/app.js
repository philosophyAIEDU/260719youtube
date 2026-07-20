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

  // 자막(체크박스 켜짐) 요청 시: 로그인 → 본인 채널 확인 → 대표 샘플 자막 수집.
  // 실패해도 절대 메인 흐름을 막지 않고, 안내 문구(note)만 반환합니다.
  function maybeAttachTranscripts(channel, videos) {
    var cb = $("chk-transcript");
    if (!cb || !cb.checked) return Promise.resolve(null);

    if (!P.config.GOOGLE_OAUTH_CLIENT_ID) {
      return Promise.resolve("이 배포에는 자막 분석용 Google 로그인이 설정되어 있지 않아 자막 분석은 건너뛰고 제목·설명 기반으로만 분석합니다.");
    }

    var tGate = P.ratelimit.transcript.check();
    if (!tGate.allowed) {
      return Promise.resolve("자막 분석 " + tGate.message.replace(/^잠시 후 다시 시도해 주세요\. /, ""));
    }

    setLoadingText("Google 로그인을 진행해 주세요 (본인 채널일 때만 자막이 반영됩니다)...");
    return P.auth.signIn()
      .then(function (token) { return P.captions.getMyChannel(token).then(function (me) { return { token: token, me: me }; }); })
      .then(function (info) {
        if (info.me.id !== channel.id) {
          return "로그인한 계정(" + info.me.title + ")이 이 채널의 소유자가 아니어서 자막 분석은 건너뛰고 제목·설명 기반으로만 분석합니다.";
        }
        P.ratelimit.transcript.record();
        return P.captions.attachTranscripts(videos, info.token, {
          maxCount: P.config.TRANSCRIPT_MAX_VIDEOS,
          onProgress: function (p) {
            setLoadingText("본인 채널 확인됨 — 자막을 가져오는 중입니다... (" + p.index + "/" + p.total + ") " + p.title);
          }
        }).then(function (res) {
          return res.succeeded
            ? null
            : "자막을 가져오지 못했습니다(비공개이거나 자막이 없는 영상일 수 있음). 제목·설명 기반으로 분석합니다.";
        });
      })
      .catch(function (err) {
        return (err && err.message) || "자막 분석 중 오류가 발생해 건너뛰고 제목·설명 기반으로만 분석합니다.";
      });
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
        var videos = fetchOut.videos;
        videos.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });

        return maybeAttachTranscripts(channelObj, videos).then(function (transcriptNote) {
          return { fetchOut: fetchOut, videos: videos, transcriptNote: transcriptNote };
        });
      })
      .then(function (bundle) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;

        var videos = bundle.videos, fetchOut = bundle.fetchOut;

        var sig = P.analysis.computeSignals(channelObj, videos, {
          fetchedCount: fetchOut.fetchedCount,
          truncated: fetchOut.truncated,
          channelVideoCount: channelObj.statistics ? Number(channelObj.statistics.videoCount || 0) : null
        });

        P.state.set({ channel: channelObj, videos: videos, signals: sig });

        ui.renderResults(channelObj, videos, sig);
        if (bundle.transcriptNote) ui.banner(u.esc(bundle.transcriptNote), "info");

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
  if (!P.config.GOOGLE_OAUTH_CLIENT_ID) {
    var chkT = $("chk-transcript");
    if (chkT) {
      chkT.disabled = true;
      chkT.title = "이 배포에는 자막 분석 기능이 설정되어 있지 않습니다.";
    }
  }
  if (!storage.hasKeys()) openSettings();
})();
