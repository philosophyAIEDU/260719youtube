/* =====================================================================
 * config.js — 전역 설정
 * 모든 모듈은 window.PhilApp 네임스페이스 하나를 공유합니다.
 * (ES 모듈이 아니라 클래식 스크립트 방식이라 file:// 로 바로 열어도 동작합니다)
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.config = {
  /* ===================================================================
   * ⭐ 공용(내장) API 키 — 여기에 '제한 걸린' 무료 티어 키를 붙여넣으면
   *    방문자가 각자 키를 발급받지 않아도 앱이 바로 동작합니다.
   *    (비워두면 예전처럼 사용자가 설정에서 직접 입력해야 합니다)
   *
   *  ‼️ 반드시 아래 '제한'을 걸고 넣으세요. 클라이언트 앱에서는 키가 공개됩니다.
   *   1) YouTube 키 (Google Cloud Console → 사용자 인증 정보 → 키 편집)
   *        · 애플리케이션 제한: HTTP 리퍼러 →  당신앱.netlify.app/*
   *        · API 제한: 'YouTube Data API v3' 만 선택
   *   2) Gemini 키 (같은 콘솔에서 키 편집)
   *        · API 제한: 'Generative Language API' 만 선택
   *  ‼️ 그리고 두 프로젝트 모두 '결제(빌링) 연결 안 함' → 무료 한도 초과 시
   *     요금이 청구되지 않고 그냥 멈췄다가 다음 날 초기화됩니다.
   * =================================================================== */
  BUILTIN_YT_KEY: "",   // 예: "AIzaSy...(제한 걸린 YouTube 키)"
  BUILTIN_GM_KEY: "",   // 예: "AIzaSy...(제한 걸린 Gemini 키)"

  /* 브라우저별 사용 제한 — 공용 키를 한 사람이 태워버리지 못하게 보호.
   * (서버가 없어 전체 합산은 불가. 한 방문자당 한도 + API 자동정지의 2중 보호) */
  RATE_LIMIT: { perHour: 8, perDay: 25 },

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

  // Gemini 생성 파라미터 (JSON 분석 모드)
  GEMINI_GENERATION: {
    temperature: 0.65,       // 분석의 일관성을 위해 다소 낮게
    topP: 0.95,
    maxOutputTokens: 8192,
    responseMimeType: "application/json"
  },

  // Gemini 생성 파라미터 (자유 대화 모드 — 채팅용, JSON 강제 안 함)
  GEMINI_CHAT_GENERATION: {
    temperature: 0.6,
    topP: 0.95,
    maxOutputTokens: 2048
  },

  // 채널 전체 영상을 수집합니다. 극단적으로 영상이 많은 채널(수천 개)에서
  // 브라우저가 멈추거나 무료 할당량을 과도하게 쓰지 않도록 안전 상한만 둡니다.
  // 상한 이하의 채널은 '전수 수집'됩니다.
  MAX_VIDEOS_FETCH: 500,

  // Gemini 프롬프트에 실제 제목/설명 원문으로 포함할 대표 샘플 개수
  // (전체 통계는 위 상한 내 모든 영상으로 계산하되, 원문 인용은 대표 샘플만 사용해
  //  프롬프트 크기를 합리적으로 유지합니다)
  PROMPT_SAMPLE_SIZE: 40,

  // 영상 데이터 표 한 페이지당 행 수
  TABLE_PAGE_SIZE: 25,

  // 채팅에서 유지할 최근 대화 턴 수 (오래된 턴은 잘라 프롬프트 크기 제어)
  CHAT_MAX_TURNS: 12,

  LS_YT: "phil_yt_api_key",  // localStorage 키
  LS_GM: "phil_gm_api_key"
};
