/* =====================================================================
 * config.js — 전역 설정
 * 모든 모듈은 window.PhilApp 네임스페이스 하나를 공유합니다.
 * (ES 모듈이 아니라 클래식 스크립트 방식이라 file:// 로 바로 열어도 동작합니다)
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.config = {
  YT_API_BASE: "https://www.googleapis.com/youtube/v3/",
  GEMINI_API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",

  // ⭐ 반드시 Gemini 3.1 Flash Lite 를 사용합니다. (사용자 요구사항)
  GEMINI_MODEL: "gemini-3.1-flash-lite",

  // 위 모델 ID 가 아직 API 에 노출되지 않아 404 가 날 때에만 자동 대체하는 안전망.
  // (동일 계열 Flash-Lite 만 후보로 둡니다. 정상 상황에서는 위 모델이 그대로 쓰입니다.)
  GEMINI_FALLBACKS: [
    "gemini-3.1-flash-lite-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite"
  ],

  // Gemini 생성 파라미터
  GEMINI_GENERATION: {
    temperature: 0.65,       // 분석의 일관성을 위해 다소 낮게
    topP: 0.95,
    maxOutputTokens: 8192,
    responseMimeType: "application/json"
  },

  MAX_VIDEOS: 20,            // 분석에 사용할 최근 영상 개수

  LS_YT: "phil_yt_api_key",  // localStorage 키
  LS_GM: "phil_gm_api_key"
};
