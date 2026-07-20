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

  // 채널 정보 + 신호 + 대표 샘플 원문(+자막 발췌) — 메인 분석과 채팅이 공유하는 데이터 컨텍스트
  function buildDataContext(channel, videos, sig, sampleSize) {
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
"──────────────────────────────\n";
  }

  function build(channel, videos, sig) {
    var header =
"당신은 유튜브 채널의 '브랜드 서사(Brand Narrative) 전략가'입니다.\n" +
"당신의 임무는 성장 해킹이 아니라, 한 창작자의 '진짜 이야기'를 발견하고 그것이 자라도록 돕는 것입니다.\n" +
"\n" +
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
"■ 태도\n" +
"- 창작자를 존중하되, 도움이 되도록 솔직하게. 서사가 약하면 약하다고, 왜 그런지 근거와 함께.\n" +
"- 모든 답변은 자연스러운 한국어로, 실행 가능한 조언 위주로 작성하세요.\n";

    var context = buildDataContext(channel, videos, sig);

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
'  "summary": "이 채널의 서사적 정체성과 나아갈 방향을 따뜻하지만 솔직하게 정리한 3~5문장 총평"\n' +
"}\n";

    return header + context + schema;
  }

  /* ---------------------------------------------------------------
   * 채팅용 시스템 지침 — 이미 생성된 분석 결과 + 데이터 컨텍스트를 근거로
   * 후속 질문에 답하게 함. 새 사실을 지어내지 않도록 강하게 제약.
   * --------------------------------------------------------------- */
  function buildChatSystem(channel, videos, sig, lastResult) {
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
        if (lastResult.summary) lines.push("총평: " + lastResult.summary);
        resultDigest = "\n[방금 완료한 분석 결과 요약 — 후속 답변은 이 결과와 모순되지 않아야 합니다]\n" + lines.join("\n") + "\n";
      } catch (e) {}
    }

    return "당신은 유튜브 채널 '" + (sn.title || "이 채널") + "'을 방금 분석한 브랜드 서사 전략가입니다.\n" +
"사용자(채널 운영자로 추정)의 후속 질문에 답하세요.\n" +
"\n" +
"■ 반드시 지킬 것\n" +
"1. 아래 제공된 실제 채널 데이터와 방금 완료한 분석 결과에 근거해서만 답하세요.\n" +
"2. 데이터에 없는 내용(예: 제공되지 않은 특정 영상의 세부 정보)을 질문받으면,\n" +
"   지어내지 말고 '제공된 데이터에는 없어 정확히 답하기 어렵다'고 솔직히 말하세요.\n" +
"3. 이전 분석과 일관성을 유지하세요. 조회수 지상주의로 답하지 말고, 메시지·서사·차별성\n" +
"   관점을 계속 유지하세요.\n" +
"4. 자극적 주제나 일반적인 유튜브 성장 팁(썸네일, SEO, 업로드 시간 등)을 권하지 마세요.\n" +
"5. 한국어로, 간결하고 실용적으로(보통 2~6문장, 목록이 필요하면 짧은 목록) 답하세요.\n" +
"6. 마크다운 헤더나 코드펜스 없이 자연스러운 대화체 텍스트로만 답하세요.\n" +
resultDigest +
buildDataContext(channel, videos, sig, 30);
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

  return {
    build: build,
    buildDataContext: buildDataContext,
    buildChatSystem: buildChatSystem,
    buildVerifyPrompt: buildVerifyPrompt,
    signalText: signalBlock   // 투명성 패널에서 원본 통계 텍스트를 그대로 노출할 때 사용
  };
})();
