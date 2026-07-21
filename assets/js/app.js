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
  function populateModelSelect() {
    var sel = $("model-select");
    if (!sel || sel.options.length) return;   // 이미 채워져 있으면 재구성하지 않음
    var current = storage.apiModel();
    (P.config.GEMINI_MODEL_OPTIONS || []).forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === current) o.selected = true;
      sel.appendChild(o);
    });
  }

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
    populateModelSelect();
    if ($("model-select")) $("model-select").value = storage.apiModel();
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
    if ($("model-select")) storage.setModel($("model-select").value);
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

  /* ---------- 자막 기능: OAuth 클라이언트 ID 인라인 설정 ---------- */
  function updateOauthSetupVisibility() {
    var cb = $("chk-transcript");
    var panel = $("oauth-setup");
    if (!cb || !panel) return;
    if (cb.checked && !storage.hasOAuth()) {
      u.show(panel);
      var input = $("oauth-client-id");
      if (input) { input.value = storage.getOAuth(); input.focus(); }
    } else {
      u.hide(panel);
    }
  }
  var chkTranscript = $("chk-transcript");
  if (chkTranscript) chkTranscript.addEventListener("change", updateOauthSetupVisibility);

  var btnSaveOauth = $("btn-save-oauth");
  if (btnSaveOauth) {
    btnSaveOauth.addEventListener("click", function () {
      var val = ($("oauth-client-id").value || "").trim();
      var status = $("oauth-setup-status");
      if (!val) {
        if (status) status.innerHTML = '<span class="err">클라이언트 ID를 입력해 주세요.</span>';
        return;
      }
      storage.setOAuth(val);
      if (status) status.innerHTML = '<span class="ok">✅ 저장되었습니다. 이제 "분석하기"를 누르면 Google 로그인 창이 뜹니다.</span>';
      setTimeout(function () { u.hide($("oauth-setup")); }, 1400);
    });
  }

  // OAuth 설정 안내: "승인된 자바스크립트 원본"에 등록해야 할 현재 사이트 주소 표시
  (function initOauthOriginHint() {
    var originEl = $("oauth-origin-value");
    if (!originEl) return;
    var origin = window.location.origin;
    var isFileProtocol = !origin || origin === "null" || window.location.protocol === "file:";
    originEl.textContent = isFileProtocol ? "(로컬 서버로 열어야 주소가 표시됩니다)" : origin;
    if (isFileProtocol) u.show($("oauth-origin-warning"));

    var copyBtn = $("btn-copy-origin");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        if (isFileProtocol) return;
        var done = function () {
          var t = copyBtn.textContent;
          copyBtn.textContent = "✓ 복사됨";
          setTimeout(function () { copyBtn.textContent = t; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(origin).then(done, function () {});
        } else {
          var ta = document.createElement("textarea");
          ta.value = origin; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (e) {}
          document.body.removeChild(ta);
        }
      });
    }
  })();

  // 자막(체크박스 켜짐) 요청 시: 로그인 → 본인 채널 확인 → 대표 샘플 자막 수집.
  // 실패해도 절대 메인 흐름을 막지 않고, 안내 문구(note)만 반환합니다.
  function maybeAttachTranscripts(channel, videos) {
    var cb = $("chk-transcript");
    if (!cb || !cb.checked) return Promise.resolve(null);

    if (!storage.hasOAuth()) {
      updateOauthSetupVisibility();
      return Promise.resolve("자막 분석에 필요한 Google OAuth 클라이언트 ID가 아직 입력되지 않았습니다. 체크박스 아래 입력란에 입력하고 저장한 뒤 다시 분석해 주세요. 이번 분석은 제목·설명 기반으로 진행합니다.");
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

  /* ---------- 📄 내 대본(TXT) 업로드 ---------- */
  var attachedScripts = [];   // [{name, text}] — 브라우저 메모리에만 존재, 어디로도 전송되지 않음

  function renderScriptFileList() {
    var el = $("script-file-list");
    if (!el) return;
    if (!attachedScripts.length) { el.innerHTML = ""; return; }
    el.innerHTML = attachedScripts.map(function (s, i) {
      return '<div class="script-file-item">' +
        '<span class="sf-name">📄 ' + u.esc(s.name) + '</span>' +
        '<span class="sf-len">' + s.text.length.toLocaleString("ko-KR") + '자</span>' +
        '<button type="button" class="btn mini ghost sf-remove" data-idx="' + i + '">✕</button>' +
        '</div>';
    }).join("");
    el.querySelectorAll(".sf-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        attachedScripts.splice(Number(btn.getAttribute("data-idx")), 1);
        renderScriptFileList();
      });
    });
  }

  var scriptFileInput = $("script-file-input");
  if (scriptFileInput) {
    scriptFileInput.addEventListener("change", function () {
      var files = Array.prototype.slice.call(scriptFileInput.files || []);
      scriptFileInput.value = "";   // 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
      var maxFiles = P.config.SCRIPT_UPLOAD_MAX_FILES || 5;
      var maxChars = P.config.SCRIPT_UPLOAD_MAX_CHARS_PER_FILE || 4000;
      files.forEach(function (file) {
        if (attachedScripts.length >= maxFiles) {
          ui.banner("대본은 최대 " + maxFiles + "개까지 추가할 수 있습니다.", "info");
          return;
        }
        if (!/\.txt$/i.test(file.name) && file.type && file.type.indexOf("text/plain") === -1) {
          ui.banner("TXT 텍스트 파일만 추가할 수 있습니다: " + u.esc(file.name), "error");
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var text = String(reader.result || "").trim();
          if (!text) return;
          if (text.length > maxChars) text = text.slice(0, maxChars);
          attachedScripts.push({ name: file.name, text: text });
          renderScriptFileList();
        };
        reader.onerror = function () {
          ui.banner("파일을 읽지 못했습니다: " + u.esc(file.name), "error");
        };
        reader.readAsText(file);
      });
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

        // 이 채널을 예전에도 분석한 적 있으면(지속 상담), 그 기록을 프롬프트/화면에 함께 반영
        var pastHistory = P.history.getHistory(channelObj.id);
        var scriptsForThisRun = attachedScripts.length ? attachedScripts.slice() : null;

        P.state.set({ channel: channelObj, videos: videos, signals: sig, scripts: scriptsForThisRun });

        ui.renderResults(channelObj, videos, sig, pastHistory, scriptsForThisRun);
        if (bundle.transcriptNote) ui.banner(u.esc(bundle.transcriptNote), "info");

        if (!videos.length) {
          ui.aiError("영상이 없어 서사 분석을 진행할 수 없습니다.");
          return;
        }

        var prompt = P.prompts.build(channelObj, videos, sig, pastHistory, scriptsForThisRun);

        P.gemini.analyze(prompt)
          .then(function (out) {
            P.history.saveAnalysis(channelObj, sig, out.result, out.model);
            var fullHistory = P.history.getHistory(channelObj.id);   // 방금 저장한 기록 포함, 최신순
            P.state.set({ lastResult: out.result, lastModel: out.model });
            ui.renderAnalysis(out.result, out.model, fullHistory);
            var chanTitle = (channelObj.snippet && channelObj.snippet.title) || "이 채널";
            P.chat.enable(chanTitle, channelObj.id);
            ui.renderChannelDashboard();
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

  /* ---------- 📁 내 채널 상담 기록: 다시 분석 / 상담 계속하기 / 삭제 ---------- */

  // "다시 분석" — 전체 재분석(YouTube+Gemini 새로 호출). 기존 analyze() 흐름을 그대로 재사용.
  function rerunAnalysis(channelId) {
    $("chan-input").value = channelId;
    window.scrollTo(0, 0);
    analyze();
  }

  // "상담 계속하기" — Gemini 를 다시 호출하지 않고, 저장된 마지막 분석 결과를 그대로 불러와
  // 화면에 표시하고 채팅(대화 기록 포함)을 바로 이어갑니다. YouTube 데이터만 가볍게 새로고침.
  function continueConsulting(channelId) {
    var latest = P.history.getLatest(channelId);
    if (!latest) {
      ui.banner("이 채널의 저장된 상담 기록을 찾을 수 없습니다.", "error");
      return;
    }

    ui.banner("");
    u.hide($("results"));
    P.state.reset();
    P.chat.reset();
    P.chat.disable();

    $("btn-analyze").disabled = true;
    setLoadingText("저장된 상담 기록을 불러오는 중입니다...");
    u.show($("loading"));

    yt.resolveChannel({ type: "id", value: channelId })
      .then(function (channel) {
        setLoadingText("최신 채널 데이터를 가볍게 확인하는 중입니다...");
        return yt.fetchAllVideos(channel, { cap: P.config.MAX_VIDEOS_FETCH }).then(function (fetchOut) {
          return { channel: channel, fetchOut: fetchOut };
        });
      })
      .then(function (bundle) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;

        var channel = bundle.channel;
        var videos = bundle.fetchOut.videos;
        videos.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });

        var sig = P.analysis.computeSignals(channel, videos, {
          fetchedCount: bundle.fetchOut.fetchedCount,
          truncated: bundle.fetchOut.truncated,
          channelVideoCount: channel.statistics ? Number(channel.statistics.videoCount || 0) : null
        });

        var fullHistory = P.history.getHistory(channelId);
        // 실시간 채팅 그라운딩에는 현재 첨부된 대본을 활용하되(채팅은 매번 새로 호출되므로),
        // 이미 캐시된 이 분석 결과 자체의 출처 표시(provenance)는 그 당시 그대로 두기 위해
        // renderResults 에는 넘기지 않습니다.
        var scriptsForChat = attachedScripts.length ? attachedScripts.slice() : null;
        P.state.set({ channel: channel, videos: videos, signals: sig, lastResult: latest.result, lastModel: latest.model, scripts: scriptsForChat });

        ui.renderResults(channel, videos, sig, fullHistory.slice(1));
        ui.renderAnalysis(latest.result, latest.model, fullHistory);
        ui.banner("💬 저장된 상담 기록(" + u.fmtDate(latest.at) + " 분석)을 불러왔습니다. 대화를 이어가 보세요.", "info");

        var chanTitle = (channel.snippet && channel.snippet.title) || "이 채널";
        P.chat.enable(chanTitle, channelId);
      })
      .catch(function (err) {
        u.hide($("loading"));
        $("btn-analyze").disabled = false;
        ui.banner(u.esc((err && err.message) || "채널 데이터를 불러오지 못했습니다."), "error");
      });
  }

  /* ---------- 🆚 참고 채널 비교 ---------- */

  // '내 채널' 또는 참고 채널 하나의 YouTube 데이터(채널+영상+신호)를 가볍게 수집.
  // 참고 채널은 별도 상한(MAX_VIDEOS_FETCH_REFERENCE)을 써 비용을 낮춥니다.
  function fetchChannelBundle(parsedOrId, cap) {
    var parsed = (typeof parsedOrId === "string") ? { type: "id", value: parsedOrId } : parsedOrId;
    return yt.resolveChannel(parsed).then(function (channel) {
      return yt.fetchAllVideos(channel, { cap: cap }).then(function (fetchOut) {
        var videos = fetchOut.videos;
        var sig = P.analysis.computeSignals(channel, videos, {
          fetchedCount: fetchOut.fetchedCount,
          truncated: fetchOut.truncated,
          channelVideoCount: channel.statistics ? Number(channel.statistics.videoCount || 0) : null
        });
        return { channel: channel, videos: videos, sig: sig };
      });
    });
  }

  function runComparison() {
    var myId = P.history.getMyChannelId();
    if (!myId) {
      ui.banner("먼저 채널을 분석한 뒤 결과 화면의 '⭐ 내 채널로 표시' 버튼으로 내 채널을 지정해 주세요.", "info");
      return;
    }
    if (!storage.hasKeys()) {
      ui.banner("먼저 API 키를 입력해야 합니다. 설정 화면으로 이동합니다.", "info");
      openSettings();
      return;
    }

    var refInputs = Array.prototype.slice.call(document.querySelectorAll("#channel-comparison .cmp-ref-input"))
      .map(function (inp) { return inp.value.trim(); })
      .filter(function (v) { return v; });
    if (!refInputs.length) {
      ui.banner("비교할 참고 채널을 최소 1개 입력해 주세요.", "error");
      return;
    }
    var maxRef = P.config.MAX_REFERENCE_CHANNELS || 3;
    if (refInputs.length > maxRef) refInputs = refInputs.slice(0, maxRef);

    var parsedRefs = [];
    for (var i = 0; i < refInputs.length; i++) {
      var p = yt.parseInput(refInputs[i]);
      if (!p) {
        ui.banner("참고 채널 주소를 다시 확인해 주세요: " + u.esc(refInputs[i]), "error");
        return;
      }
      parsedRefs.push(p);
    }

    var b = storage.usingBuiltin();
    var usingShared = b.yt || b.gm;
    if (usingShared) {
      var gate = P.ratelimit.check();
      if (!gate.allowed) {
        ui.banner(u.esc(gate.message), "info");
        return;
      }
    }

    var runBtn = document.querySelector("#channel-comparison [data-action='run-comparison']");
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = "비교 분석 중..."; }
    ui.renderComparisonLoading();
    if (usingShared) P.ratelimit.record();

    fetchChannelBundle(myId, P.config.MAX_VIDEOS_FETCH)
      .then(function (myFetched) {
        var myBundle = {
          channel: myFetched.channel, videos: myFetched.videos, sig: myFetched.sig,
          lastResult: (P.history.getLatest(myId) || {}).result || null
        };
        return Promise.all(parsedRefs.map(function (p) { return fetchChannelBundle(p, P.config.MAX_VIDEOS_FETCH_REFERENCE); }))
          .then(function (refFetched) {
            var referenceBundles = refFetched.map(function (f) { return { channel: f.channel, videos: f.videos, sig: f.sig }; });
            return { myBundle: myBundle, referenceBundles: referenceBundles };
          });
      })
      .then(function (bundles) {
        var prompt = P.prompts.buildComparisonPrompt(bundles.myBundle, bundles.referenceBundles);
        var myTitle = (bundles.myBundle.channel.snippet && bundles.myBundle.channel.snippet.title) || "내 채널";
        return P.gemini.analyze(prompt).then(function (out) {
          P.history.saveComparison(myId, { at: new Date().toISOString(), model: out.model, result: out.result });
          ui.renderComparisonResult(out.result, myTitle);
        });
      })
      .catch(function (err) {
        ui.renderComparisonError((err && err.message) || "비교 분석 중 오류가 발생했습니다.");
      })
      .finally(function () {
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = "🆚 비교 분석하기"; }
      });
  }

  var channelComparisonEl = $("channel-comparison");
  if (channelComparisonEl) {
    channelComparisonEl.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "unset-mine") {
        P.history.setMyChannel(null);
        ui.renderChannelDashboard();
        ui.renderComparisonSection();
      } else if (action === "run-comparison") {
        runComparison();
      }
    });
  }

  function deleteChannelRecord(channelId, title) {
    var ok = window.confirm("“" + title + "” 채널의 상담 기록과 대화 내용을 삭제할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;
    P.history.deleteChannel(channelId);
    ui.renderChannelDashboard();
  }

  var channelHistoryEl = $("channel-history");
  if (channelHistoryEl) {
    channelHistoryEl.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var channelId = btn.getAttribute("data-channel-id");
      if (!channelId) return;
      if (action === "reanalyze") rerunAnalysis(channelId);
      else if (action === "consult") continueConsulting(channelId);
      else if (action === "delete") {
        var card = btn.closest(".chd-card");
        var titleEl = card && card.querySelector(".chd-name");
        deleteChannelRecord(channelId, titleEl ? titleEl.textContent : "이");
      }
    });
  }

  /* ---------- 초기화 ---------- */
  P.chat.init();
  ui.renderChannelDashboard();
  ui.renderComparisonSection();
  if (!storage.hasKeys()) openSettings();
})();
