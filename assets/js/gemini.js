/* =====================================================================
 * gemini.js — Google Generative Language API 클라이언트
 *   기본 모델: gemini-3.1-flash-lite (필수)
 *   해당 모델이 404 일 때에만 동일 계열 Flash-Lite 후보로 자동 대체.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.gemini = (function () {
  var cfg = PhilApp.config;
  var storage = PhilApp.storage;

  // 실제로 어떤 모델이 응답했는지 기록 (UI 표시용)
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

  function generate(promptText) {
    var key = storage.getGM();
    var body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: cfg.GEMINI_GENERATION
    });

    var candidates = [cfg.GEMINI_MODEL].concat(cfg.GEMINI_FALLBACKS);

    function attempt(i) {
      if (i >= candidates.length) {
        return Promise.reject(new Error(
          "필수 모델 '" + cfg.GEMINI_MODEL + "' 및 대체 모델을 사용할 수 없습니다. " +
          "Gemini API 키 권한 또는 모델 접근 가능 여부를 확인해 주세요."));
      }
      var model = candidates[i];
      return callModel(model, key, body).then(function (res) {
        if (res.ok) {
          lastModelUsed = model;
          return { data: res.data, model: model };
        }
        var reason = reasonOf(res.data);
        // 인증/키/한도 오류는 다음 모델로 넘겨도 동일하므로 즉시 중단
        if (res.status === 429) {
          throw new Error("Gemini API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.");
        }
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(reason)) {
          throw new Error("Gemini API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.");
        }
        if (res.status === 403) {
          throw new Error("Gemini API 접근이 거부되었습니다. 키 권한 또는 API 활성화 여부를 확인해 주세요.");
        }
        // 404 / 미지원 → 다음 후보 모델로 자동 대체
        if (res.status === 404 || /not.?found|not supported|unsupported|NOT_FOUND/i.test(reason)) {
          return attempt(i + 1);
        }
        // 그 외 일시적 오류도 다음 후보 시도
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  function extractText(data) {
    try {
      var parts = data.candidates[0].content.parts;
      return parts.map(function (p) { return p.text || ""; }).join("");
    } catch (e) { return ""; }
  }

  function parseJSON(text) {
    if (!text) return null;
    var t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try { return JSON.parse(t); } catch (e) {}
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) {}
    }
    return null;
  }

  // 프롬프트 → 파싱된 분석 객체
  function analyze(promptText) {
    return generate(promptText).then(function (res) {
      var parsed = parseJSON(extractText(res.data));
      if (!parsed) throw new Error("AI 분석 결과(JSON)를 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return { result: parsed, model: res.model };
    });
  }

  return { analyze: analyze, getLastModel: getLastModel };
})();
