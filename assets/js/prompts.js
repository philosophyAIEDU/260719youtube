/* =====================================================================
 * prompts.js — 이 앱의 심장.
 *
 * 이 프롬프트의 목표는 단 하나:
 *   "이 사람이 '왜' 이 채널을 시작했는가(메시지·사명)를 발견하고,
 *    그 메시지가 콘텐츠에 진정성 있게 녹아 있는지, 에피소드들이 하나의
 *    서사로 축적되는지, 다른 창작자와 차별화되는지"를 깊이 진단하고,
 *    정량 점수와 실행 가능한 조언을 주는 것.
 *
 * 조회수·구독자·알고리즘·자극적 주제는 '성공의 기준'이 아니라 '맥락'일 뿐이다.
 *
 * 신빙성 원칙: 채널의 (사실상) 전체 영상 이력을 기반으로 통계를 계산하고,
 * 그 통계 + 대표 샘플 영상 원문을 근거로만 판단하게 한다. 근거 없는 주장을
 * 막기 위해 evidence(인용) 필드를 스키마에 강제한다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.prompts = (function () {
  var u = PhilApp.utils;
  var A = PhilApp.analysis;

  function summarizeVideos(videos) {
    return videos.map(function (v, i) {
      var desc = (v.description || "").replace(/\s+/g, " ").trim().slice(0, 220);
      return (i + 1) + ") 「" + v.title + "」\n" +
        "   · 업로드: " + u.fmtDate(v.publishedAt) +
        " | 조회수 " + (v.views || 0).toLocaleString("ko-KR") +
        " | 좋아요 " + (v.likes == null ? "비공개" : v.likes.toLocaleString("ko-KR")) +
        " | 댓글 " + (v.comments == null ? "비공개" : v.comments.toLocaleString("ko-KR")) + "\n" +
        (desc ? "   · 설명 요약: " + desc + "\n" : "");
    }).join("\n");
  }

  function signalBlock(sig) {
    var lines = [];
    var coverageNote = sig.truncated
      ? "전체 " + (sig.channelVideoCount != null ? sig.channelVideoCount.toLocaleString("ko-KR") + "개 중 " : "") +
        "최신 " + sig.fetchedCount.toLocaleString("ko-KR") + "개 (안전 상한으로 인한 부분 수집)"
      : "전체 " + sig.fetchedCount.toLocaleString("ko-KR") + "개 전수 수집";
    lines.push("· 데이터 수집 범위: " + coverageNote);
    lines.push("· 통계 계산 대상: " + sig.count + "개 (아래 모든 수치는 이 전체 데이터 기준)");
    if (sig.dateRange) {
      lines.push("· 활동 기간: " + u.fmtDate(sig.dateRange.oldest) + " ~ " + u.fmtDate(sig.dateRange.newest) +
        " (약 " + Math.round(sig.spanDays / 30) + "개월)");
    }
    lines.push("· 평균 조회수: " + sig.avgViews.toLocaleString("ko-KR") +
               " / 중앙값 조회수: " + sig.medianViews.toLocaleString("ko-KR") +
               "  (평균과 중앙값 차이가 크면 소수 영상에만 도달이 쏠렸다는 뜻)");
    if (sig.avgUploadGapDays != null)
      lines.push("· 평균 업로드 간격: 약 " + sig.avgUploadGapDays + "일");
    lines.push("· 평균 제목 길이: " + sig.avgTitleLen + "자");

    if (sig.keywords.length) {
      lines.push("· 제목에서 반복되는 키워드(전체 영상 기준 빈도): " +
        sig.keywords.map(function (k) { return k.word + "(" + k.count + ")"; }).join(", "));
    }

    if (sig.eras) {
      lines.push("");
      lines.push("[시기별 추이 — 채널 전체 이력을 초기/중기/최근 3구간으로 나눈 통계. 성장/정체/변화를 판단하는 근거]");
      sig.eras.forEach(function (e) {
        lines.push("  · " + e.label + " (" + e.count + "개" +
          (e.range ? ", " + u.fmtDate(e.range.from) + "~" + u.fmtDate(e.range.to) : "") + "): " +
          "평균 조회수 " + e.avgViews.toLocaleString("ko-KR") +
          " / 평균 참여율 " + u.pct(e.avgEngagement, 2));
      });
    }

    lines.push("");
    lines.push("[도달 상위 5개 — 전체 데이터 중 조회수 기준]");
    sig.topByViews.forEach(function (v, i) {
      lines.push("  " + (i + 1) + ". 「" + v.title + "」 조회수 " + (v.views || 0).toLocaleString("ko-KR"));
    });

    lines.push("");
    lines.push("[공명 상위 5개 — 전체 데이터 중 참여율((좋아요+댓글)/조회수) 기준 · 메시지가 사람에게 가 닿았을 가능성이 큰 영상]");
    sig.topByEngagement.forEach(function (v, i) {
      lines.push("  " + (i + 1) + ". 「" + v.title + "」 참여율 " +
        u.pct(v.engagementRate, 2) + " (조회수 " + (v.views || 0).toLocaleString("ko-KR") + ")");
    });

    return lines.join("\n");
  }

  // 자막(스크립트) 발췌 블록 — 본인 채널 인증 후에만 존재. 제목보다 신뢰도 높은 근거.
  function transcriptBlock(videos) {
    var withT = videos.filter(function (v) { return v.transcriptExcerpt; });
    if (!withT.length) return "";
    var lines = ["", "[실제 발화 내용 발췌 " + withT.length + "개 — 본인 채널 로그인 인증 후 자막에서 직접 추출됨. " +
      "제목/설명보다 신뢰도 높은 1차 근거로 우선 활용하세요]"];
    withT.forEach(function (v, i) {
      lines.push((i + 1) + ") 「" + v.title + "」");
      lines.push("   " + v.transcriptExcerpt);
    });
    return lines.join("\n") + "\n";
  }

  // 사용자가 직접 업로드한 대본(TXT) 블록 — 로그인·소유권 확인 없이도, 사용자가
  // 직접 제공한 가장 신뢰도 높은 1차 자료. scripts: [{name, text}]
  function uploadedScriptsBlock(scripts) {
    if (!scripts || !scripts.length) return "";
    var lines = ["", "[사용자가 직접 업로드한 대본 " + scripts.length + "개(TXT) — 본인이 직접 제공한 원문입니다. " +
      "채널 데이터의 어떤 근거보다도 가장 신뢰도 높은 1차 자료로 취급하세요]"];
    scripts.forEach(function (s, i) {
      lines.push((i + 1) + ") 파일명: " + s.name);
      lines.push("   " + s.text);
    });
    return lines.join("\n") + "\n";
  }

  // 이 채널의 과거 분석 기록(최신순 배열, PhilApp.history.getHistory 결과)을
  // "지난 상담 요약" 텍스트로 압축. 메인 분석(트렌드 인지)과 채팅(상담 연속성) 양쪽에 사용.
  function buildHistoryDigest(history, maxItems) {
    if (!history || !history.length) return "";
    var items = history.slice(0, maxItems || PhilApp.config.MAX_HISTORY_DIGEST_ITEMS || 5);
    var lines = ["", "[이 채널의 지난 상담 기록 " + items.length + "건 — 최신순. " +
      "당신이 예전에 이 채널을 상담했던 세션들입니다. 이번 답변은 이 흐름을 이어가며,\n" +
      "무엇이 나아졌는지/제자리인지/후퇴했는지 언급하세요]"];
    items.forEach(function (r, i) {
      var sc = (r.result && r.result.scorecard) || {};
      lines.push((i + 1) + ") " + u.fmtDate(r.at) + " — 종합 " + (sc.overall != null ? sc.overall : "-") +
        "점(" + (sc.grade || "-") + ") — " + (sc.oneLineVerdict || ""));
      if (r.result && r.result.priorityActions && r.result.priorityActions.length) {
        lines.push("   그때 제안했던 최우선 액션: " + r.result.priorityActions[0].action);
      }
    });
    return lines.join("\n") + "\n";
  }

  // 채널 정보 + 신호 + 대표 샘플 원문(+자막 발췌/업로드 대본) — 메인 분석과 채팅이 공유하는 데이터 컨텍스트
  function buildDataContext(channel, videos, sig, sampleSize, scripts) {
    var sn = channel.snippet || {};
    var st = channel.statistics || {};
    var bs = (channel.brandingSettings && channel.brandingSettings.channel) || {};
    var channelDesc = (sn.description || bs.description || "").trim();
    var keywords = (bs.keywords || "").trim();
    var sample = A.selectSample(videos, sampleSize || PhilApp.config.PROMPT_SAMPLE_SIZE);

    return "\n──────────────────────────────\n" +
"[채널 정보]\n" +
"채널명: " + (sn.title || "-") + "\n" +
"채널 소개글: " + (channelDesc || "(소개글 없음)") + "\n" +
(keywords ? "채널 키워드 태그: " + keywords + "\n" : "") +
"개설일: " + u.fmtDate(sn.publishedAt) + "\n" +
"구독자 수: " + (st.hiddenSubscriberCount ? "비공개" : Number(st.subscriberCount || 0).toLocaleString("ko-KR")) + "\n" +
"총 영상 수(채널 공식): " + Number(st.videoCount || 0).toLocaleString("ko-KR") + "\n" +
"총 조회수: " + Number(st.viewCount || 0).toLocaleString("ko-KR") +
"  (※ 위 수치는 '맥락'일 뿐, 평가 기준이 아닙니다)\n" +
"\n[데이터 신호 — 채널 전체 이력 기준 통계. 표면 지표가 아니라 서사 판단의 재료로 쓰세요]\n" +
signalBlock(sig) + "\n" +
"\n[대표 샘플 영상 원문 " + sample.length + "개 — 상위 조회수·상위 참여율·최신·초창기·시간축 균등분포를 섞어 선정. 최신순 정렬]\n" +
summarizeVideos(sample) +
transcriptBlock(videos) +
uploadedScriptsBlock(scripts) +
"──────────────────────────────\n";
  }

  function build(channel, videos, sig, history, scripts) {
    var hasHistory = !!(history && history.length);
    var hasScripts = !!(scripts && scripts.length);
    var isEarlyStage = videos.length <= (PhilApp.config.LOW_VIDEO_THRESHOLD || 5);
    var header =
"당신은 유튜브 채널의 '브랜드 서사(Brand Narrative) 전략가'" + (hasHistory ? "이자, 이 채널을 꾸준히 지켜봐 온 담당 컨설턴트" : "") + "입니다.\n" +
"당신의 임무는 성장 해킹이 아니라, 한 창작자의 '진짜 이야기'를 발견하고 그것이 자라도록 돕는 것입니다.\n" +
"\n" +
(hasHistory ?
"■ 이번은 첫 분석이 아니라 " + (history.length + 1) + "번째 상담입니다\n" +
"- 아래 [지난 상담 기록]을 반드시 참고해, 이전에 지적한 부분이 이번엔 나아졌는지/그대로인지/\n" +
"  더 나빠졌는지 짚으세요. 단순 반복이 아니라 '지속 상담'으로서 진전을 평가하세요.\n" +
"- scorecard.dimensions 의 점수를 지난 기록과 비교해 냉정하게 매기세요. 근거 없이 점수를\n" +
"  올리거나 내리지 말고, 실제 데이터(제목/통계) 변화가 있을 때만 점수를 움직이세요.\n\n"
: "") +
(isEarlyStage ?
"■ 이 채널은 영상이 " + videos.length + "개뿐인 '초기 단계' 채널입니다 — 매우 중요한 태도 전환\n" +
"- 영상이 적어 '지금까지 어떤 패턴이 있었는지'를 단정할 근거가 부족합니다. 소수 영상에서 억지로\n" +
"  패턴을 만들어내지 마세요(contentReview, resonanceInsight 등에서 과잉 일반화 금지).\n" +
"- 대신 '지금까지 무엇을 했는가'보다 '앞으로 어떤 방향으로 나아가야 하는가'에 무게를 실으세요.\n" +
"  아래 스키마의 directionConsulting 필드를 반드시 실질적으로 채우세요.\n" +
"- coreMessage.confidence 는 솔직하게 '보통' 또는 '낮음'으로, 소개글과 몇 안 되는 영상에서\n" +
"  탐색적으로 추론한 '가설'이라는 점을 inferredWhy 문장에 자연스럽게 드러내세요.\n" +
"- scorecard.dimensions 중 '서사 축적력'은 데이터가 없어 냉정히 낮게 매기되(축적을 판단할 근거\n" +
"  자체가 없다는 게 이유), diagnosis 에는 비판이 아니라 '아직 판단하기 이른 단계'라고 설명하세요.\n" +
"- priorityActions·roadmap 은 '무엇을 고쳐라'가 아니라 '무엇을 처음 시도해보라'는 톤으로 쓰세요.\n\n"
: "") +
"■ 반드시 지켜야 할 분석 원칙 (이것이 이 분석의 전부입니다)\n" +
"1. 이 창작자가 '왜(Why)' 이 채널을 시작했는지 — 어떤 문제의식, 사명, 하고 싶은 말이 있었는지 —\n" +
"   를 채널 소개글·영상 제목 패턴·반복 주제·설명글의 어조에서 추론하는 것을 최우선으로 하세요.\n" +
"2. 그 '왜(메시지)'가 실제 콘텐츠에 얼마나 진정성 있게, 일관되게 녹아 있는지 평가하세요.\n" +
"3. 개별 영상이 흩어진 정보 조각인지, 아니면 하나의 관점·캐릭터·세계관·여정으로 축적되며\n" +
"   '서사'를 쌓고 있는지 판단하세요. 아래 [시기별 추이]를 반드시 참고해 초기→최근 변화를 짚으세요.\n" +
"4. 같은 분야의 다른 창작자와 무엇이 다른지 — 이 채널만의 관점/톤/캐릭터 —, 차별점을 짚으세요.\n" +
"\n" +
"■ 신빙성(근거) 지침 — 매우 중요\n" +
"- 이 데이터는 채널의 (사실상) 전체 영상 이력을 기반으로 계산된 통계입니다. 추측이 아니라\n" +
"  이 통계와 아래 제공되는 실제 영상 제목/설명을 반드시 인용하며 판단하세요.\n" +
"- evidence, aligned, drifting 등 '근거' 필드에는 실제 제공된 영상 제목을 그대로(따옴표 없이,\n" +
"  원문 그대로) 적으세요. 지어내지 마세요. 제공되지 않은 영상 제목을 인용하면 안 됩니다.\n" +
"- 확신이 낮으면 confidence 를 낮게 표시하세요. 데이터가 부족해 판단이 어려우면 그렇다고 명시하세요.\n" +
"- [실제 발화 내용 발췌]가 제공된 경우, 그것은 채널 소유자 인증 후 자막에서 직접 추출한 1차 자료입니다.\n" +
"  제목만으로 추측하는 것보다 그 발화 내용을 우선적인 근거로 삼아 메시지·톤·일관성을 판단하세요.\n" +
(hasScripts ?
"- [사용자가 직접 업로드한 대본]이 제공된 경우, 이것이 이 분석에서 가장 신뢰도 높은 1차 자료입니다.\n" +
"  자막 발췌나 제목/설명보다도 이 대본 원문을 최우선 근거로 삼아 메시지(Why)·톤·일관성을 판단하고,\n" +
"  coreMessage.evidence 나 contentReview 등에서 이 대본의 실제 문장·표현을 적극 인용하세요.\n"
: "") +
"\n" +
"■ 정량 평가(스코어카드) 지침\n" +
"- 5개 지표를 각각 0~100점으로 매기세요. 반드시 냉정하고 솔직하게. 점수를 부풀리지 마세요.\n" +
"- 점수 기준: 90~100 탁월 / 75~89 우수 / 55~74 보통(방향은 있으나 일관성·축적 부족) /\n" +
"  35~54 약함 / 0~34 부재. 종합 점수와 등급(A~D)도 이 기준에 맞추세요.\n" +
"- 각 지표마다 '왜 이 점수인지' 진단과 '이 점수를 올리려면 구체적으로 무엇을 할지'를 함께 쓰세요.\n" +
"\n" +
"■ 절대 하지 말아야 할 것 (매우 중요)\n" +
"- 조회수·구독자 수가 높다는 이유만으로 '좋은 콘텐츠'라고 판단하지 마세요. 도달과 공명은 다릅니다.\n" +
"- 조회수를 끌어올리기 위한 자극적 주제, 트렌드 편승, 낚시성 제목을 추천하지 마세요.\n" +
"- '썸네일을 개선하라', '업로드 시간을 바꿔라', 'SEO를 신경 써라' 같은 일반적인 유튜브 성장 팁을\n" +
"  나열하지 마세요. 그것은 이 분석의 목적이 아닙니다.\n" +
"- 근거 없는 칭찬이나 막연한 덕담을 하지 마세요. 반드시 실제 데이터(제목/설명/참여 패턴)를 인용하세요.\n" +
"\n" +
"■ 수익화 컨설팅 지침 (monetizationAdvice)\n" +
"- 광고 수익·브랜드 협찬·멤버십/슈퍼챗·디지털 상품(전자책, 템플릿 등)·강의/컨설팅·제휴 마케팅 등\n" +
"  구체적 방법 중, 이 채널의 메시지(Why)·니치·오디언스에 실제로 맞는 것만 골라 제안하세요.\n" +
"- 채널의 진정성/서사를 해칠 수 있는 수익화 방법(예: 메시지와 무관한 협찬 남발)은 risk 필드에\n" +
"  명시하고, fit 을 낮게 매기세요. 돈이 된다고 다 추천하지 마세요.\n" +
"- 지금 구독자·조회수 규모에서 비현실적인 방법(예: 팔로워 100명인데 대형 브랜드 협찬)은 제안하지\n" +
"  말고, 지금 단계에서 실제로 시작 가능한 것 위주로 제안하세요.\n" +
(isEarlyStage ? "" :
"- 이 채널은 데이터가 충분합니다(영상 " + videos.length + "개, 구독자 " +
  (channel.statistics && channel.statistics.hiddenSubscriberCount ? "비공개" : Number((channel.statistics && channel.statistics.subscriberCount) || 0).toLocaleString("ko-KR") + "명") +
  ", 평균 조회수 " + sig.avgViews.toLocaleString("ko-KR") + "). 막연한 조언 대신 이 실제 규모와\n" +
"  [공명 상위 5개]/[도달 상위 5개]에 드러난 실제 패턴을 근거로 삼아 훨씬 더 구체적이고 현실적으로\n" +
"  제안하세요. 가능하면 이 규모대에서 통상적인 단가·전환율 감(예: '이 정도 평균 조회수·참여율이면\n" +
"  스폰서십 단가는 대략 얼마 선대, 멤버십 전환은 구독자의 몇 % 정도가 현실적')을 근거와 함께 제시하세요.\n" +
"  단, 구체적인 서비스·플랫폼 브랜드명(예: 특정 회사명)은 절대 언급하지 마세요 — 시간이 지나며\n" +
"  바뀌거나 틀린 정보를 줄 수 있으니, '멤버십 플랫폼', '디지털 상품 판매 플랫폼'처럼 일반적인\n" +
"  카테고리로만 표현하세요.\n" +
"- 공명 상위 영상에서 반복되는 주제를 수익화 아이디어와 직접 연결하세요(예: '「실제 영상 제목」류가\n" +
"  참여율이 특히 높았으니, 이 주제를 확장한 미니 코스/디지털 상품이 적합').\n" +
"- 방법 하나만 나열하지 말고, monetizationPortfolioNote 에 2~3개 방법이 서로 어떻게 보완되는\n" +
"  조합(포트폴리오)을 이루는지, 왜 이 조합이 지금 이 채널에 맞는지 구체적으로 설명하세요.\n"
) +
"\n" +
"■ 태도\n" +
"- 창작자를 존중하되, 도움이 되도록 솔직하게. 서사가 약하면 약하다고, 왜 그런지 근거와 함께.\n" +
"- 모든 답변은 자연스러운 한국어로, 실행 가능한 조언 위주로 작성하세요.\n";

    var context = buildDataContext(channel, videos, sig, null, scripts) + buildHistoryDigest(history);

    var schema =
"\n위 데이터를 근거로 아래 JSON 스키마에 '정확히' 맞춰서만 응답하세요.\n" +
"마크다운·코드펜스·설명 문장 없이, 순수 JSON 객체 하나만 출력하세요. 모든 값은 한국어입니다.\n" +
"각 필드는 반드시 실제 영상 제목이나 데이터를 근거로 인용하며 작성하세요.\n" +
"\n" +
"{\n" +
'  "coreMessage": {\n' +
'    "inferredWhy": "이 창작자가 왜 이 채널을 시작했는지, 무엇을 전하고 싶어 하는지에 대한 2~4문장 추론",\n' +
'    "confidence": "높음" | "보통" | "낮음",\n' +
'    "evidence": ["근거가 된 실제 영상 제목 2~4개 (제공된 목록의 제목을 그대로 인용)"]\n' +
"  },\n" +
(isEarlyStage ?
'  "directionConsulting": {   // 영상이 적은 초기 단계라 특별히 채우는 방향성 탐색 상담\n' +
'    "stageNote": "지금이 어떤 단계인지, 왜 패턴 단정 대신 방향 탐색이 필요한지 1~2문장",\n' +
'    "whyHypothesis": "소개글과 소수 영상에서 탐색적으로 추론한 이 채널의 방향성 가설 2~3문장 (가설임을 명시)",\n' +
'    "experimentsToTry": ["이 단계에서 시도해볼 구체적 콘텐츠 실험/방향 3~4개 — 무엇을 왜 시도하는지"],\n' +
'    "whatToWatchNext": "다음 몇 개 영상을 만들며 무엇을 관찰하면 방향이 좁혀질지 1~2문장"\n' +
"  },\n"
: "") +
'  "scorecard": {\n' +
'    "overall": 0~100 사이 정수,\n' +
'    "grade": "A" | "B" | "C" | "D",\n' +
'    "oneLineVerdict": "이 채널의 브랜드 서사 상태를 한 문장으로 냉정하게 요약",\n' +
'    "dimensions": [   // 반드시 아래 5개를 이 순서·이름 그대로\n' +
'      { "key": "메시지 선명도", "score": 0~100, "diagnosis": "왜 이 점수인지 1~2문장(근거 인용)", "toImprove": "이 점수를 올리기 위한 구체적 행동 1~2문장" },\n' +
'      { "key": "메시지 일관성", "score": 0~100, "diagnosis": "...", "toImprove": "..." },\n' +
'      { "key": "서사 축적력", "score": 0~100, "diagnosis": "시기별 추이를 근거로", "toImprove": "..." },\n' +
'      { "key": "차별성",      "score": 0~100, "diagnosis": "...", "toImprove": "..." },\n' +
'      { "key": "오디언스 공명", "score": 0~100, "diagnosis": "참여율/댓글 등 근거", "toImprove": "..." }\n' +
"    ]\n" +
"  },\n" +
'  "positioningStatement": "이 채널의 한 문장 포지셔닝. \'누구를 위해, 무엇을, 어떻게 다르게\' 형식으로.",\n' +
'  "brandTaglines": ["채널의 Why 를 압축한 기억에 남는 한 줄 슬로건 후보 3개"],\n' +
'  "topics": ["최근 콘텐츠의 핵심 주제 3~5개, 짧은 태그 형태"],\n' +
'  "contentPillars": [   // 이 채널이 소유해야 할 콘텐츠 기둥 3~4개\n' +
'    { "name": "기둥 이름", "desc": "이 기둥이 다루는 것 1문장", "example": "예시 영상 주제 하나" }\n' +
"  ],\n" +
'  "contentReview": [   // 지금까지 콘텐츠를 브랜드/서사 관점에서 리뷰 3~5개\n' +
'    { "pattern": "발견된 콘텐츠 패턴", "brandFit": "높음"|"보통"|"낮음", "note": "브랜드 메시지에 기여/방해하는지 1~2문장" }\n' +
"  ],\n" +
'  "resonanceInsight": "조회수(도달)와 참여율(공명)을 대조해 \'어떤 유형의 영상이 실제로 마음에 가 닿았는지\'의 공통 패턴 3~5문장. 단순 최다 조회수 나열 금지.",\n' +
'  "aboutRewrite": {\n' +
'    "current": "현재 소개글 한 줄 요약(없으면 \'소개글 없음\')",\n' +
'    "suggested": "메시지가 선명히 드러나도록 새로 제안하는 채널 소개글 3~5문장"\n' +
"  },\n" +
'  "priorityActions": [   // 가장 낮은 점수부터 보완하는 우선순위 실행안 4~5개\n' +
'    { "priority": "높음"|"중간"|"낮음", "targetScore": "이 액션이 올리려는 지표 이름", "action": "할 일(짧게)", "why": "왜 이게 그 점수를 올리는지 1문장", "how": "구체적 실행 방법 1~2문장" }\n' +
"  ],\n" +
'  "roadmap": [   // 90일 브랜딩 로드맵, 3단계\n' +
'    { "phase": "1단계 · 0~30일", "focus": "핵심 목표 1문장", "actions": ["구체적 행동 2~3개"] },\n' +
'    { "phase": "2단계 · 30~60일", "focus": "...", "actions": ["..."] },\n' +
'    { "phase": "3단계 · 60~90일", "focus": "...", "actions": ["..."] }\n' +
"  ],\n" +
'  "nextVideos": [   // 다음에 만들면 좋을 영상 4~5개 (서사를 확장하는 방향, 조회수 노림수 아님)\n' +
'    { "title": "구체적 영상 제목 후보", "reason": "이 채널의 메시지·서사에 맞는 이유", "howItBuildsNarrative": "채널 서사를 어떻게 한 걸음 더 쌓는지 1~2문장" }\n' +
"  ],\n" +
'  "monetizationAdvice": [   // 이 채널의 메시지·니치·오디언스·현재 규모에 맞는 수익화 방법 3~5개\n' +
'    { "method": "구체적 수익화 방법(예: 브랜드 협찬, 멤버십, 디지털 상품, 강의/컨설팅, 제휴 마케팅 등)",\n' +
'      "fit": "높음"|"보통"|"낮음", "why": "왜 이 채널에 맞는지(또는 안 맞는지) 데이터·니치 근거. 데이터가\n' +
'        충분하면 실제 규모(구독자/평균 조회수)와 공명 상위 영상의 실제 주제·제목을 인용해 구체적으로",\n' +
'      "howToStart": "지금 단계에서 구체적으로 어떻게 시작할지 1~2문장. (데이터가 충분하면) 이\n' +
'        규모대의 통상적인 단가/전환율 감을 포함. 특정 서비스·플랫폼 브랜드명은 언급하지 말 것",\n' +
'      "risk": "이 방법이 브랜드 서사·진정성을 해칠 수 있는 지점 (없으면 빈 문자열)" }\n' +
"  ],\n" +
'  "monetizationPortfolioNote": "위 방법들을 조합했을 때의 전체 수익화 전략 2~3문장. 왜 이 조합이\n' +
'    지금 이 채널에 맞는지, 데이터가 충분하면 실제 수치·공명 패턴을 근거로. 방법이 1개뿐이면 빈 문자열",\n' +
'  "summary": "이 채널의 서사적 정체성과 나아갈 방향을 따뜻하지만 솔직하게 정리한 3~5문장 총평"' + (hasHistory ? ",\n" : "\n") +
(hasHistory ?
'  "trendNote": "지난 상담(들) 대비 이번엔 무엇이 나아졌는지/그대로인지/후퇴했는지 데이터 근거와 함께 2~4문장. 반드시 구체적 변화(점수, 업로드 패턴, 새 시도 등)를 언급"\n'
: "") +
"}\n";

    return header + context + schema;
  }

  /* ---------------------------------------------------------------
   * 채팅용 시스템 지침 — 이미 생성된 분석 결과 + 데이터 컨텍스트를 근거로
   * 후속 질문에 답하게 함. 새 사실을 지어내지 않도록 강하게 제약.
   * --------------------------------------------------------------- */
  function buildChatSystem(channel, videos, sig, lastResult, history, scripts) {
    var sn = channel.snippet || {};
    var resultDigest = "";
    if (lastResult) {
      try {
        var sc = lastResult.scorecard || {};
        var lines = [];
        lines.push("종합 점수: " + sc.overall + "/100 (" + sc.grade + ") — " + (sc.oneLineVerdict || ""));
        (sc.dimensions || []).forEach(function (d) { lines.push("- " + d.key + ": " + d.score + "점 — " + (d.diagnosis || "")); });
        if (lastResult.coreMessage) lines.push("핵심 메시지(Why): " + lastResult.coreMessage.inferredWhy);
        if (lastResult.positioningStatement) lines.push("포지셔닝: " + lastResult.positioningStatement);
        if (lastResult.directionConsulting) {
          lines.push("방향성 상담(초기 단계 채널): " + lastResult.directionConsulting.whyHypothesis);
        }
        if (lastResult.monetizationAdvice && lastResult.monetizationAdvice.length) {
          lines.push("제안했던 수익화 방법: " + lastResult.monetizationAdvice.map(function (m) { return m.method; }).join(", "));
          if (lastResult.monetizationPortfolioNote) lines.push("수익화 조합 전략: " + lastResult.monetizationPortfolioNote);
        }
        if (lastResult.summary) lines.push("총평: " + lastResult.summary);
        resultDigest = "\n[가장 최근 분석 결과 요약 — 후속 답변은 이 결과와 모순되지 않아야 합니다]\n" + lines.join("\n") + "\n";
      } catch (e) {}
    }

    var isOngoing = history && history.length > 1;   // 최신 기록 1건은 위 resultDigest와 중복이므로 2건 이상일 때만 별도 표기
    return "당신은 유튜브 채널 '" + (sn.title || "이 채널") + "'을 " +
(isOngoing ? "꾸준히 상담해 온 담당 AI 유튜브 컨설턴트" : "방금 분석한 브랜드 서사 전략가") + "입니다.\n" +
"사용자(채널 운영자로 추정)의 후속 질문에 답하세요.\n" +
"\n" +
"■ 반드시 지킬 것\n" +
"1. 아래 제공된 실제 채널 데이터와 분석 결과(및 지난 상담 기록이 있다면 그것)에 근거해서만 답하세요.\n" +
"2. 데이터에 없는 내용(예: 제공되지 않은 특정 영상의 세부 정보)을 질문받으면,\n" +
"   지어내지 말고 '제공된 데이터에는 없어 정확히 답하기 어렵다'고 솔직히 말하세요.\n" +
"3. 메시지·서사·차별성 관점을 계속 유지하세요. 조회수 지상주의로 답하지 마세요.\n" +
"4. 자극적 주제나 일반적인 유튜브 성장 팁(썸네일, SEO, 업로드 시간 등)을 권하지 마세요.\n" +
"5. 한국어로, 간결하고 실용적으로(보통 2~6문장, 목록이 필요하면 짧은 목록) 답하세요.\n" +
"6. 마크다운 헤더나 코드펜스 없이 자연스러운 대화체 텍스트로만 답하세요.\n" +
"7. 채널 방향성·Why를 더 명확히 하는 상담, 수익화 방법 상담은 이 앱의 정식 상담 범위입니다.\n" +
"   사용자가 물어보면 채널의 메시지·니치·규모에 맞게 적극적으로 조언하세요(4번의 '성장 팁 금지'는\n" +
"   썸네일/SEO 같은 얕은 트릭에 대한 것이지, 방향성이나 수익화 상담을 피하라는 뜻이 아닙니다).\n" +
"8. 영상이 매우 적은 초기 채널이라면, 데이터로 단정하기보다 가설과 다음 실험을 제안하는 톤을 쓰세요.\n" +
(isOngoing ? "9. 이 채널을 여러 번 상담해왔다는 사실을 자연스럽게 활용하세요(예: '지난번에 말씀드린 ~은 어떻게 되셨나요').\n" : "") +
resultDigest +
buildHistoryDigest(history) +
buildDataContext(channel, videos, sig, 30, scripts);
  }

  /* ---------------------------------------------------------------
   * 재검증(자체 교차검증) 프롬프트 — 방금 낸 분석이 실제 통계와
   * 모순되지 않는지 스스로 재검토하게 해 신빙성을 높인다.
   * --------------------------------------------------------------- */
  function buildVerifyPrompt(channel, sig, lastResult) {
    var sc = (lastResult && lastResult.scorecard) || {};
    var digestLines = [];
    digestLines.push("종합 점수: " + sc.overall + "/100 (" + sc.grade + ")");
    (sc.dimensions || []).forEach(function (d) {
      digestLines.push("- " + d.key + ": " + d.score + "점 — 진단: " + (d.diagnosis || "") + " / 근거: " + (d.toImprove || ""));
    });
    if (lastResult && lastResult.coreMessage) {
      digestLines.push("핵심 메시지 추론: " + lastResult.coreMessage.inferredWhy +
        " (근거 인용: " + (lastResult.coreMessage.evidence || []).join(" / ") + ")");
    }
    if (lastResult && lastResult.resonanceInsight) {
      digestLines.push("공명 분석: " + lastResult.resonanceInsight);
    }

    return "당신은 독립적인 감사자(auditor)입니다. 다른 애널리스트가 아래 [원본 통계 데이터]를 보고 내린\n" +
"[분석 결과]가 데이터와 모순되지 않는지, 근거가 실제로 존재하는지 냉정하게 재검토하세요.\n" +
"칭찬이 목적이 아니라 오류·과장·비약을 찾아내는 것이 목적입니다.\n" +
"\n[원본 통계 데이터]\n" + signalBlock(sig) + "\n" +
"\n[검토 대상 분석 결과]\n" + digestLines.join("\n") + "\n" +
"\n아래 JSON 스키마로만 응답하세요 (마크다운/코드펜스 금지):\n" +
"{\n" +
'  "verified": true | false,   // 전반적으로 데이터와 부합하면 true, 심각한 모순이 있으면 false\n' +
'  "confidence": "높음" | "보통" | "낮음",\n' +
'  "checks": [   // 점수/주장 3~5개에 대해 데이터 정합성 개별 판정\n' +
'    { "claim": "검토한 주장(점수나 진단 요약)", "consistent": true|false, "note": "왜 그렇게 판단했는지 1문장, 실제 수치를 인용" }\n' +
"  ],\n" +
'  "issues": ["발견된 과장/근거부족/모순 (없으면 빈 배열)"],\n' +
'  "note": "감사 총평 1~2문장"\n' +
"}\n";
  }

  /* ---------------------------------------------------------------
   * 참고 채널 비교 프롬프트 — '내 채널'로 지정한 채널과 참고 채널(들)을
   * 같은 기준(브랜드 서사·차별성)으로 나란히 놓고 비교한다.
   * bundle: { channel, videos, sig, lastResult? } — youtube.js/analysis.js 로 만든 데이터를
   * app.js 가 그대로 조립해 넘긴다. 참고 채널마다 별도 Gemini 호출을 하지 않고
   * (비용 보호) 이 함수 하나로 전체 비교를 1번의 호출로 처리한다.
   * --------------------------------------------------------------- */
  function comparisonChannelBlock(bundle, label) {
    var sampleSize = PhilApp.config.REFERENCE_SAMPLE_SIZE || 15;
    var sn = bundle.channel.snippet || {};
    var st = bundle.channel.statistics || {};
    var bs = (bundle.channel.brandingSettings && bundle.channel.brandingSettings.channel) || {};
    var sample = A.selectSample(bundle.videos, sampleSize);
    var lines = ["", "──────────────────────────────",
      "[" + label + "] " + (sn.title || "-"),
      "채널 소개글: " + ((sn.description || bs.description || "").trim() || "(소개글 없음)"),
      "구독자 수: " + (st.hiddenSubscriberCount ? "비공개" : Number(st.subscriberCount || 0).toLocaleString("ko-KR")),
      "총 영상 수(채널 공식): " + Number(st.videoCount || 0).toLocaleString("ko-KR"),
      ""];
    lines.push(signalBlock(bundle.sig));
    lines.push("");
    lines.push("[대표 샘플 영상 " + sample.length + "개 — 제목 + 설명 요약. 이 채널의 메시지·톤·서사를 읽는 근거로 쓰세요]");
    lines.push(sample.map(function (v, i) {
      var desc = (v.description || "").replace(/\s+/g, " ").trim().slice(0, 120);
      return (i + 1) + ") 「" + v.title + "」" + (desc ? "\n   · 설명: " + desc : "");
    }).join("\n"));
    if (bundle.lastResult && bundle.lastResult.coreMessage) {
      lines.push("");
      lines.push("이전 분석에서 추론된 이 채널의 핵심 메시지(Why): " + bundle.lastResult.coreMessage.inferredWhy);
      if (bundle.lastResult.positioningStatement) lines.push("이전 분석 포지셔닝: " + bundle.lastResult.positioningStatement);
    }
    lines.push("──────────────────────────────");
    return lines.join("\n") + "\n";
  }

  function buildComparisonPrompt(myBundle, referenceBundles) {
    var myTitle = (myBundle.channel.snippet && myBundle.channel.snippet.title) || "내 채널";
    var refTitles = referenceBundles.map(function (b) { return (b.channel.snippet && b.channel.snippet.title) || "참고 채널"; });

    var header =
"당신은 유튜브 채널의 '브랜드 서사(Brand Narrative) 전략가'입니다.\n" +
"아래에는 [내 채널] " + myTitle + " 과, 사용자가 비교하고 싶어 선택한 [참고 채널] " +
refTitles.length + "개(" + refTitles.join(", ") + ")의 데이터가 있습니다.\n" +
"당신의 임무는 두 가지입니다.\n" +
"  (1) 참고 채널 하나하나를 '제대로 분석'하기 — 각 참고 채널의 메시지(Why)·서사·톤·차별점을\n" +
"      실제 데이터로 읽어내세요. 단순히 '무엇을 잘한다' 한 줄로 넘기지 말고, 내 채널을 분석하듯\n" +
"      그 채널의 정체성을 깊이 있게 파악하세요.\n" +
"  (2) 그 분석을 바탕으로 내 채널을 참고 채널들과 나란히 놓고, 내 채널만의 강점과 보완할 점을\n" +
"      찾아주기. 기준은 조회수·구독자 수 경쟁이 아니라 '메시지(Why)·일관성·차별성'입니다.\n" +
"\n" +
"■ 반드시 지켜야 할 원칙\n" +
"1. 절대 구독자 수·조회수·업로드 빈도의 크고 작음만으로 우열을 논하지 마세요. 참고 채널이\n" +
"   더 크더라도, 내 채널이 메시지·차별성 면에서 나은 점이 있다면 그것을 분명히 짚으세요.\n" +
"2. 모든 분석·비교·주장은 아래 제공된 각 채널의 실제 소개글·영상 제목·설명·통계(참여율/시기별\n" +
"   추이 등)를 근거로만 하세요. 제공되지 않은 내용을 지어내지 마세요. 근거 성격의 필드에는 실제\n" +
"   제공된 그 채널의 제목을 원문 그대로 인용하세요(내 채널 제목과 참고 채널 제목을 섞지 마세요).\n" +
"3. 참고 채널을 깎아내리는 톤이 아니라, '그 채널은 무엇을 잘 하는지'를 먼저 존중하고, 그것과\n" +
"   대비해 내 채널이 다른 점(다르다≠나쁘다)을 설명하세요. 다만 서사 관점의 빈틈(weakness)은\n" +
"   솔직하게 짚어, 내 채널이 파고들 수 있는 지점을 드러내세요.\n" +
"4. 구체적인 서비스·플랫폼 브랜드명은 언급하지 마세요.\n" +
"5. 한국어로, 실행 가능한 조언 위주로 작성하세요.\n";

    var context = "\n[내 채널]\n" + comparisonChannelBlock(myBundle, "내 채널") +
      referenceBundles.map(function (b, i) { return comparisonChannelBlock(b, "참고 채널 " + (i + 1)); }).join("");

    var schema =
"\n위 데이터를 근거로 아래 JSON 스키마에 '정확히' 맞춰서만 응답하세요.\n" +
"마크다운·코드펜스·설명 문장 없이, 순수 JSON 객체 하나만 출력하세요. 모든 값은 한국어입니다.\n" +
"\n" +
"{\n" +
'  "referenceComparisons": [   // 참고 채널마다 하나씩, 반드시 ' + refTitles.length + '개. 각 채널을 제대로 분석할 것\n' +
'    { "channelTitle": "참고 채널 이름(제공된 그대로)",\n' +
'      "inferredMessage": "이 참고 채널이 전하려는 메시지(Why)·정체성 추론 1~2문장 (그 채널의 실제 제목/소개글 근거)",\n' +
'      "narrativeStrengths": "이 채널이 브랜드 서사·일관성 면에서 잘하는 점 1~2문장 (실제 제목 근거)",\n' +
'      "differentiation": "이 채널만의 차별점·톤·관점 1문장",\n' +
'      "weakness": "이 채널의 서사 관점 빈틈·약점 1문장 (내 채널이 파고들 수 있는 지점, 없으면 빈 문자열)",\n' +
'      "howMyChannelDiffers": "내 채널이 이 채널과 다른 점 1~2문장 (우열이 아니라 차이로 서술, 실제 제목 근거)" }\n' +
"  ],\n" +
'  "myStrengths": [   // 참고 채널들과 비교했을 때 드러나는 내 채널만의 강점 2~4개\n' +
'    { "point": "강점 요약", "evidence": "근거가 된 내 채널의 실제 데이터/제목 인용" }\n' +
"  ],\n" +
'  "myGaps": [   // 참고 채널들과 비교했을 때 드러나는 내 채널의 보완점 2~4개\n' +
'    { "point": "보완점 요약", "evidence": "근거가 된 데이터/비교 관찰", "suggestion": "구체적으로 무엇을 어떻게 보완할지 1~2문장" }\n' +
"  ],\n" +
'  "overallPositioningVsPeers": "참고 채널들 사이에서 내 채널이 어떤 위치·역할을 차지할 수 있는지 정리한 3~4문장 총평"\n' +
"}\n";

    return header + context + schema;
  }

  return {
    build: build,
    buildDataContext: buildDataContext,
    buildChatSystem: buildChatSystem,
    buildVerifyPrompt: buildVerifyPrompt,
    buildHistoryDigest: buildHistoryDigest,
    buildComparisonPrompt: buildComparisonPrompt,
    signalText: signalBlock   // 투명성 패널에서 원본 통계 텍스트를 그대로 노출할 때 사용
  };
})();
