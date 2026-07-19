/* =====================================================================
 * prompts.js — 이 앱의 심장.
 *
 * 이 프롬프트의 목표는 단 하나:
 *   "이 사람이 '왜' 이 채널을 시작했는가(메시지·사명)를 발견하고,
 *    그 메시지가 콘텐츠에 진정성 있게 녹아 있는지, 에피소드들이 하나의
 *    서사로 축적되는지, 다른 창작자와 차별화되는지"를 깊이 진단하고,
 *    지금까지의 콘텐츠와 앞으로의 콘텐츠에 대한 조언을 주는 것.
 *
 * 조회수·구독자·알고리즘·자극적 주제는 '성공의 기준'이 아니라 '맥락'일 뿐이다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.prompts = (function () {
  var u = PhilApp.utils;

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
    lines.push("· 분석 대상 영상 수: " + sig.count + "개");
    lines.push("· 평균 조회수: " + sig.avgViews.toLocaleString("ko-KR") +
               " / 중앙값 조회수: " + sig.medianViews.toLocaleString("ko-KR") +
               "  (평균과 중앙값 차이가 크면 소수 영상에만 도달이 쏠렸다는 뜻)");
    if (sig.avgUploadGapDays != null)
      lines.push("· 평균 업로드 간격: 약 " + sig.avgUploadGapDays + "일");
    lines.push("· 평균 제목 길이: " + sig.avgTitleLen + "자");

    if (sig.keywords.length) {
      lines.push("· 제목에서 반복되는 키워드(빈도): " +
        sig.keywords.map(function (k) { return k.word + "(" + k.count + ")"; }).join(", "));
    }

    lines.push("");
    lines.push("[도달 상위 5개 — 조회수 기준]");
    sig.topByViews.forEach(function (v, i) {
      lines.push("  " + (i + 1) + ". 「" + v.title + "」 조회수 " + (v.views || 0).toLocaleString("ko-KR"));
    });

    lines.push("");
    lines.push("[공명 상위 5개 — 참여율((좋아요+댓글)/조회수) 기준 · 메시지가 사람에게 가 닿았을 가능성이 큰 영상]");
    sig.topByEngagement.forEach(function (v, i) {
      lines.push("  " + (i + 1) + ". 「" + v.title + "」 참여율 " +
        u.pct(v.engagementRate, 2) +
        " (조회수 " + (v.views || 0).toLocaleString("ko-KR") + ")");
    });

    return lines.join("\n");
  }

  function build(channel, videos, sig) {
    var sn = channel.snippet || {};
    var st = channel.statistics || {};
    var bs = (channel.brandingSettings && channel.brandingSettings.channel) || {};

    var channelDesc = (sn.description || bs.description || "").trim();
    var keywords = (bs.keywords || "").trim();

    var header =
"당신은 유튜브 채널의 '브랜드 서사(Brand Narrative) 전략가'입니다.\n" +
"당신의 임무는 성장 해킹이 아니라, 한 창작자의 '진짜 이야기'를 발견하고 그것이 자라도록 돕는 것입니다.\n" +
"\n" +
"■ 반드시 지켜야 할 분석 원칙 (이것이 이 분석의 전부입니다)\n" +
"1. 이 창작자가 '왜(Why)' 이 채널을 시작했는지 — 어떤 문제의식, 사명, 하고 싶은 말이 있었는지 —\n" +
"   를 채널 설명·영상 제목 패턴·반복 주제·설명글의 어조에서 추론하는 것을 최우선으로 하세요.\n" +
"2. 그 '왜(메시지)'가 실제 콘텐츠에 얼마나 진정성 있게, 일관되게 녹아 있는지 평가하세요.\n" +
"3. 개별 영상이 흩어진 정보 조각인지, 아니면 하나의 관점·캐릭터·세계관·여정으로 축적되며\n" +
"   '서사'를 쌓고 있는지 판단하세요.\n" +
"4. 같은 분야의 다른 창작자와 무엇이 다른지 — 이 채널만의 관점/톤/캐릭터 —, 차별점을 짚으세요.\n" +
"\n" +
"■ 절대 하지 말아야 할 것 (매우 중요)\n" +
"- 조회수·구독자 수가 높다는 이유만으로 '좋은 콘텐츠'라고 판단하지 마세요. 도달과 공명은 다릅니다.\n" +
"- 조회수를 끌어올리기 위한 자극적 주제, 트렌드 편승, 낚시성 제목을 추천하지 마세요.\n" +
"- '썸네일을 개선하라', '업로드 시간을 바꿔라', 'SEO를 신경 써라' 같은 일반적인 유튜브 성장 팁을\n" +
"  나열하지 마세요. 그것은 이 분석의 목적이 아닙니다.\n" +
"- 근거 없는 칭찬이나 막연한 덕담을 하지 마세요. 반드시 실제 데이터(제목/설명/참여 패턴)를 인용하세요.\n" +
"\n" +
"■ 태도\n" +
"- 창작자를 존중하되, 도움이 되도록 솔직하게 말하세요. 서사가 약하면 약하다고, 왜 그런지 근거와 함께.\n" +
"- 모든 답변은 자연스러운 한국어로, 실행 가능한 조언 위주로 작성하세요.\n";

    var context =
"\n──────────────────────────────\n" +
"[채널 정보]\n" +
"채널명: " + (sn.title || "-") + "\n" +
"채널 소개글: " + (channelDesc || "(소개글 없음)") + "\n" +
(keywords ? "채널 키워드 태그: " + keywords + "\n" : "") +
"개설일: " + u.fmtDate(sn.publishedAt) + "\n" +
"구독자 수: " + (st.hiddenSubscriberCount ? "비공개" : Number(st.subscriberCount || 0).toLocaleString("ko-KR")) + "\n" +
"총 영상 수: " + Number(st.videoCount || 0).toLocaleString("ko-KR") + "\n" +
"총 조회수: " + Number(st.viewCount || 0).toLocaleString("ko-KR") +
"  (※ 위 수치는 '맥락'일 뿐, 평가 기준이 아닙니다)\n" +
"\n[데이터 신호 — 표면 지표가 아니라 서사 판단의 재료로 쓰세요]\n" +
signalBlock(sig) + "\n" +
"\n[최근 영상 목록 (최신순)]\n" +
summarizeVideos(videos) +
"──────────────────────────────\n";

    var schema =
"\n위 데이터를 근거로 아래 JSON 스키마에 '정확히' 맞춰서만 응답하세요.\n" +
"마크다운·코드펜스·설명 문장 없이, 순수 JSON 객체 하나만 출력하세요. 모든 값은 한국어입니다.\n" +
"각 필드는 반드시 실제 영상 제목이나 데이터를 근거로 인용하며 작성하세요.\n" +
"\n" +
"{\n" +
'  "coreMessage": {\n' +
'    "inferredWhy": "이 창작자가 왜 이 채널을 시작했는지, 무엇을 전하고 싶어 하는지에 대한 2~4문장 추론",\n' +
'    "confidence": "높음" | "보통" | "낮음",   // 데이터에서 그 Why 가 얼마나 뚜렷이 읽히는지\n' +
'    "evidence": ["근거가 된 영상 제목/설명/패턴 인용 2~4개"]\n' +
"  },\n" +
'  "messageConsistency": {\n' +
'    "level": "높음" | "보통" | "낮음",\n' +
'    "assessment": "그 메시지가 콘텐츠에 얼마나 일관되게 녹아 있는지 3~5문장 평가",\n' +
'    "aligned": ["메시지가 잘 드러난 영상/패턴 예시"],\n' +
'    "drifting": ["메시지에서 벗어났거나 결이 다른 영상/패턴 예시 (없으면 빈 배열)"]\n' +
"  },\n" +
'  "narrativeBuilding": {\n' +
'    "verdict": "단발성 정보전달형" | "서사 축적 브랜드형" | "혼합형",\n' +
'    "assessment": "에피소드들이 하나의 관점/캐릭터/여정으로 이어지는지 3~5문장 진단, 근거 포함",\n' +
'    "throughlines": ["채널을 관통하는 축(반복되는 관점·캐릭터·형식)이 있다면 나열, 없으면 빈 배열"]\n' +
"  },\n" +
'  "differentiation": {\n' +
'    "assessment": "같은 분야 다른 채널과 비교해 이 채널만의 차별점을 3~5문장",\n' +
'    "uniqueAngles": ["이 채널만의 강점/각도 2~4개"],\n' +
'    "risks": ["차별성을 약화시키는 요소나 남들과 비슷해지는 지점 1~3개 (없으면 빈 배열)"]\n' +
"  },\n" +
'  "topics": ["최근 콘텐츠의 핵심 주제 3~5개, 짧은 태그 형태"],\n' +
'  "contentReview": [   // 지금까지의 콘텐츠를 \'브랜드/서사 관점\'에서 리뷰 (3~5개 패턴)\n' +
'    { "pattern": "발견된 콘텐츠 패턴", "brandFit": "높음"|"보통"|"낮음", "note": "이 패턴이 브랜드 메시지에 기여하는지/방해하는지 1~2문장" }\n' +
"  ],\n" +
'  "resonanceInsight": "조회수(도달)와 참여율(공명) 데이터를 대조해, 표면적 조회수가 아니라 \'어떤 유형의 영상이 사람들의 마음에 실제로 가 닿았는지\'의 공통 패턴을 3~5문장으로. 단순 최다 조회수 나열 금지.",\n' +
'  "narrativeAdvice": [   // 브랜드 서사를 더 단단히 쌓기 위한 구체적 조언 4~5개\n' +
'    { "title": "조언 제목(짧게)", "detail": "구체적 실행 방법 2~3문장. 시리즈물화, 고정 인트로/캐릭터, 특정 관점 유지, 창작 동기를 콘텐츠에 드러내는 방법 등" }\n' +
"  ],\n" +
'  "nextVideos": [   // 다음에 만들면 좋을 영상 4~5개 (조회수 노림수가 아니라 서사를 확장하는 방향)\n' +
'    { "title": "구체적인 영상 제목 후보", "reason": "왜 이 영상이 이 채널의 메시지·서사에 맞는지", "howItBuildsNarrative": "이 영상이 채널 서사를 어떻게 한 걸음 더 쌓는지 1~2문장" }\n' +
"  ],\n" +
'  "summary": "이 채널의 서사적 정체성과 앞으로 나아갈 방향을 따뜻하지만 솔직하게 정리한 3~5문장 총평"\n' +
"}\n";

    return header + context + schema;
  }

  return { build: build };
})();
