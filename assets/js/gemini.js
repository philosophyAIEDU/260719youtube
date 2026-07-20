/* =====================================================================
 * gemini.js — Google Generative Language API 클라이언트
 *   기본 모델: gemini-3.1-flash-lite. 설정 화면에서 사용자가 다른 모델
 *   (예: gemini-3.5-flash)을 고르면 storage.apiModel() 이 그 값을 우선
 *   사용합니다. 선택된 모델이 404 일 때에만 동일 계열 후보로 자동 대체.
 *
 *   analyze() : JSON 스키마 강제 분석 모드 (스코어카드/재검증 등)
 *   chat()    : 자유 대화 모드 (후속 질문 채팅용, 일반 텍스트 응답)
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.gemini = (function () {
  var cfg = PhilApp.config;
  var storage = PhilApp.storage;

  var lastModelUsed = null;
  function getLastModel() { return lastModelUsed; }

  function endpoint(model, key) {
    return cfg.GEMINI_API_BASE + model + ":generateContent?key=" + encodeURIComponent(key);
  }

  function callModel(model, key, body) {
    return fetch(endpoint(model, key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; });
    });
  }

  function reasonOf(data) {
    try { return (data.error.status || "") + " " + (data.error.message || ""); }
    catch (e) { return ""; }
  }

  // contents: [{role:"user"|"model", parts:[{text}]}, ...]
  // systemText: 선택적 system instruction (없으면 생략)
  function generateRaw(contents, generationConfig, systemText) {
    var key = storage.apiGM();
    var payload = { contents: contents, generationConfig: generationConfig };
    if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
    var body = JSON.stringify(payload);

    var primaryModel = storage.apiModel();
    var candidates = [primaryModel].concat(cfg.GEMINI_FALLBACKS).filter(function (m, i, arr) {
      return m && arr.indexOf(m) === i;   // 중복 제거 (선택 모델이 fallback 목록에도 있을 경우 대비)
    });

    function attempt(i) {
      if (i >= candidates.length) {
        return Promise.reject(new Error(
          "선택한 모델 '" + primaryModel + "' 및 대체 모델을 사용할 수 없습니다. " +
          "Gemini API 키 권한 또는 모델 접근 가능 여부를 확인해 주세요."));
      }
      var model = candidates[i];
      return callModel(model, key, body).then(function (res) {
        if (res.ok) {
          lastModelUsed = model;
          return { data: res.data, model: model };
        }
        var reason = reasonOf(res.data);
        if (res.status === 429) {
          throw new Error("Gemini 무료 사용 한도(분당/일일)에 도달했습니다. 잠시 후 또는 내일 다시 시도해 주세요. (설정에서 본인의 Gemini API 키를 입력하면 바로 사용할 수 있습니다.)");
        }
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(reason)) {
          throw new Error("Gemini API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.");
        }
        if (res.status === 403) {
          throw new Error("Gemini API 접근이 거부되었습니다. 키 권한 또는 API 활성화 여부를 확인해 주세요.");
        }
        if (res.status === 404 || /not.?found|not supported|unsupported|NOT_FOUND/i.test(reason)) {
          return attempt(i + 1);
        }
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  // 'thinking' 지원 모델은 최종 답변과 별개로 내부 추론을 parts[].thought=true 로 반환할 수
  // 있습니다. 그걸 답변 텍스트와 합치면 JSON 앞뒤에 잡텍스트가 붙어 파싱이 깨지므로 제외합니다.
  // 단, 이 플래그를 다르게 쓰는 모델도 있을 수 있으므로 — 필터링했더니 텍스트가 통째로
  // 사라지면(=이 모델이 답변 자체를 thought 로 표시하는 경우) 안전하게 필터링 전 전체
  // 텍스트로 되돌아갑니다(구버전 동작과 동일).
  function extractText(data) {
    try {
      var parts = data.candidates[0].content.parts;
      var filtered = parts.filter(function (p) { return !p.thought; })
        .map(function (p) { return p.text || ""; }).join("");
      if (filtered.trim()) return filtered;
      return parts.map(function (p) { return p.text || ""; }).join("");
    } catch (e) { return ""; }
  }

  function extractFinishReason(data) {
    try { return data.candidates[0].finishReason || ""; } catch (e) { return ""; }
  }

  // 문자열 리터럴 안의 원문 개행/탭만 이스케이프합니다(그 밖의 위치는 건드리지 않음).
  // 일부 모델이 JSON 문자열 값 안에 이스케이프 없는 개행을 그대로 넣는 경우를 복구합니다.
  function escapeControlCharsInStrings(t) {
    var out = "", inString = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === '"' && t[i - 1] !== "\\") { inString = !inString; out += ch; continue; }
      if (inString && ch === "\n") { out += "\\n"; continue; }
      if (inString && ch === "\r") { out += "\\r"; continue; }
      if (inString && ch === "\t") { out += "\\t"; continue; }
      out += ch;
    }
    return out;
  }

  function parseJSON(text) {
    if (!text) return null;
    var t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    try { return JSON.parse(t); } catch (e) {}

    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    var core = t.slice(a, b + 1);

    try { return JSON.parse(core); } catch (e2) {}

    // 흔한 LLM 출력 실수 복구: 문자열 안 원문 개행 이스케이프 + 끝쪽 trailing comma 제거
    var repaired = escapeControlCharsInStrings(core).replace(/,(\s*[}\]])/g, "$1");
    try { return JSON.parse(repaired); } catch (e3) {}

    console.error("[PhilApp.gemini] JSON 파싱 실패. 원본 응답(진단용):", text.slice(0, 4000));
    return null;
  }

  // 프롬프트 → 파싱된 분석 객체 (JSON 스키마 강제)
  // 응답이 토큰 한도에 걸려 잘린 경우, 한 번에 한해 더 큰 한도로 자동 재시도합니다.
  function analyze(promptText, _retry) {
    var genConfig = cfg.GEMINI_GENERATION;
    if (_retry) {
      genConfig = Object.assign({}, cfg.GEMINI_GENERATION, {
        maxOutputTokens: Math.min((cfg.GEMINI_GENERATION.maxOutputTokens || 8192) * 2, 32768)
      });
    }
    return generateRaw(
      [{ role: "user", parts: [{ text: promptText }] }],
      genConfig
    ).then(function (res) {
      var text = extractText(res.data);
      var parsed = parseJSON(text);
      if (!parsed) {
        var reason = extractFinishReason(res.data);
        if (reason === "MAX_TOKENS" && !_retry) {
          return analyze(promptText, true);   // 응답이 잘렸을 가능성 — 더 큰 토큰 한도로 1회 재시도
        }
        var hint = reason ? " (사유: " + reason + ")" : "";
        throw new Error("AI 분석 결과(JSON)를 해석하지 못했습니다" + hint + ". 잠시 후 다시 시도해 주세요.");
      }
      return { result: parsed, model: res.model };
    });
  }

  // 자유 대화 (채팅) — history: [{role:"user"|"model", text}], systemText: 그라운딩 컨텍스트
  function chat(history, systemText) {
    var contents = history.map(function (m) {
      return { role: m.role, parts: [{ text: m.text }] };
    });
    return generateRaw(contents, cfg.GEMINI_CHAT_GENERATION, systemText).then(function (res) {
      var text = extractText(res.data).trim();
      if (!text) throw new Error("AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return { text: text, model: res.model };
    });
  }

  return { analyze: analyze, chat: chat, getLastModel: getLastModel };
})();
