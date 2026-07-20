/* =====================================================================
 * chat.js — 하단 고정 후속 질문 채팅 위젯.
 *   분석이 끝난 채널에 대해 자유롭게 후속 질문을 할 수 있습니다.
 *   그라운딩: 실제 채널 데이터 + 방금 완료한 분석 결과 (prompts.buildChatSystem)
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.chat = (function () {
  var u, P, $;
  var history = [];   // [{role:"user"|"model", text}]
  var enabled = false;
  var busy = false;

  function init() {
    u = PhilApp.utils; P = PhilApp; $ = u.$;

    $("chat-toggle").addEventListener("click", toggleOpen);
    $("chat-close").addEventListener("click", function () { setOpen(false); });
    $("chat-send").addEventListener("click", send);
    $("chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function setOpen(open) {
    var w = $("chat-widget");
    if (open) w.classList.add("open"); else w.classList.remove("open");
  }
  function toggleOpen() {
    if (!enabled) return;
    var w = $("chat-widget");
    setOpen(!w.classList.contains("open"));
    if (w.classList.contains("open")) $("chat-input").focus();
  }

  function reset() {
    history = [];
    $("chat-messages").innerHTML = "";
    setOpen(false);
  }

  function enable(channelTitle) {
    enabled = true;
    var w = $("chat-widget");
    w.classList.remove("disabled");
    $("chat-input").disabled = false;
    $("chat-send").disabled = false;
    $("chat-hint").textContent = "“" + channelTitle + "” 채널의 서사·점수·조언에 대해 무엇이든 물어보세요.";
    if (!history.length) {
      addMessage("model",
        "분석이 끝났습니다. “" + channelTitle + "” 채널의 브랜드 서사, 점수, 다음 영상 아이디어 등에 대해 " +
        "궁금한 점을 편하게 물어보세요. 실제 수집된 데이터에 근거해서만 답변드립니다.");
    }
  }

  function disable() {
    enabled = false;
    var w = $("chat-widget");
    w.classList.add("disabled");
    $("chat-input").disabled = true;
    $("chat-send").disabled = true;
    $("chat-hint").textContent = "먼저 채널을 분석해야 질문할 수 있습니다.";
  }

  function addMessage(role, text, opts) {
    var box = $("chat-messages");
    var div = document.createElement("div");
    div.className = "chat-msg " + (role === "user" ? "from-user" : "from-ai") + (opts && opts.error ? " is-error" : "");
    div.innerHTML = '<div class="chat-bubble">' + u.escMultiline(text) + '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function addTyping() {
    var box = $("chat-messages");
    var div = document.createElement("div");
    div.className = "chat-msg from-ai typing";
    div.id = "chat-typing";
    div.innerHTML = '<div class="chat-bubble"><span class="chat-dot"></span><span class="chat-dot"></span><span class="chat-dot"></span></div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function removeTyping() {
    var el = $("chat-typing");
    if (el) el.parentNode.removeChild(el);
  }

  function send() {
    if (busy || !enabled) return;
    var input = $("chat-input");
    var q = input.value.trim();
    if (!q) return;

    if (!P.state.isReady()) {
      addMessage("model", "먼저 채널을 분석해 주세요.", { error: true });
      return;
    }

    // 공용(내장) Gemini 키를 쓸 때만 사용량 보호(브라우저별 제한) 적용
    var usingShared = P.storage.usingBuiltin().gm;
    if (usingShared) {
      var gate = P.ratelimit.check();
      if (!gate.allowed) {
        addMessage("model", gate.message, { error: true });
        return;
      }
    }

    input.value = "";
    addMessage("user", q);
    history.push({ role: "user", text: q });

    // 대화가 길어지면 오래된 턴을 잘라 프롬프트 크기 제어
    var maxMsgs = (P.config.CHAT_MAX_TURNS || 12) * 2;
    if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);

    busy = true;
    $("chat-send").disabled = true;
    addTyping();
    if (usingShared) P.ratelimit.record();

    var systemText = P.prompts.buildChatSystem(P.state.channel, P.state.videos, P.state.signals, P.state.lastResult);

    P.gemini.chat(history, systemText)
      .then(function (out) {
        removeTyping();
        addMessage("model", out.text);
        history.push({ role: "model", text: out.text });
      })
      .catch(function (err) {
        removeTyping();
        // 실패한 사용자 질문은 히스토리에서 제거(다음 질문 문맥 오염 방지)
        history.pop();
        addMessage("model", (err && err.message) || "답변 생성 중 오류가 발생했습니다.", { error: true });
      })
      .finally(function () {
        busy = false;
        $("chat-send").disabled = !enabled;
      });
  }

  return { init: init, reset: reset, enable: enable, disable: disable };
})();
