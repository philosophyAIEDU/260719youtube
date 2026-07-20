/* =====================================================================
 * ui.js — 프로페셔널 분석 대시보드 렌더링.
 *   · 브랜드 스코어카드(종합 링 게이지 + 지표별 바) = 결과의 중심
 *   · 브랜딩 자산(슬로건/포지셔닝/소개글 리라이트/콘텐츠 기둥/90일 로드맵)
 *   · 점수를 올리는 우선순위 액션
 *   · 신빙성: 데이터 수집 현황 · 근거(evidence) 실제 영상 대조 검증 ·
 *            원본 데이터 투명 공개 · AI 자체 재검증(감사) 기능
 *   · 리포트 복사/인쇄
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.ui = (function () {
  var u = PhilApp.utils, P = PhilApp;
  var $ = u.$, esc = u.esc, escML = u.escMultiline;

  var sortState = { key: "views", dir: -1 };
  var pageState = { page: 0 };
  var currentVideos = [];
  var lastReport = null;   // 리포트 복사용
  var currentAiIds = [];   // 이번 렌더에 실제로 존재하는 AI 섹션 id 목록 (조건부 섹션 대응)

  function banner(html, type) {
    $("global-banner").innerHTML = html
      ? '<div class="banner ' + (type || "info") + '">' + html + "</div>"
      : "";
  }

  function levelClass(level) {
    if (/높음|서사 축적|강함/.test(level)) return "lv-high";
    if (/낮음|약함|단발/.test(level)) return "lv-low";
    return "lv-mid";
  }
  function priClass(p) {
    if (/높음/.test(p)) return "pri-high";
    if (/낮음/.test(p)) return "pri-low";
    return "pri-mid";
  }

  /* section wrapper with index number */
  function sec(idx, id, title, badge) {
    return '<section class="block" id="' + id + '">' +
      '<div class="block-head"><span class="idx">' + idx + '</span>' +
      '<h2>' + title + (badge ? ' <span class="tag ' + badge.cls + '">' + esc(badge.txt) + '</span>' : '') + '</h2></div>' +
      '<div id="' + id + '-body"></div></section>';
  }

  /* ---------- 데이터 출처(Provenance) 배너 — 신빙성 기능 ① ---------- */
  function provenanceBanner(sig, history) {
    var now = new Date();
    var stamp = now.getFullYear() + "." + String(now.getMonth() + 1).padStart(2, "0") + "." +
      String(now.getDate()).padStart(2, "0") + " " + String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0");
    var coverage = sig.truncated
      ? "⚠️ 영상이 많아(채널 공식 " + (sig.channelVideoCount != null ? u.fmtInt(sig.channelVideoCount) : "다수") +
        "개) 안전 상한으로 최신 " + u.fmtInt(sig.fetchedCount) + "개까지 수집"
      : "✅ 전체 영상 " + u.fmtInt(sig.fetchedCount) + "개 전수 수집";
    var range = sig.dateRange ? u.fmtDate(sig.dateRange.oldest) + " ~ " + u.fmtDate(sig.dateRange.newest) : "-";

    return '<div class="provenance">' +
      '<div class="prov-row">' +
      '<span class="prov-item">' + esc(coverage) + '</span>' +
      '<span class="prov-sep">·</span><span class="prov-item">활동 기간 ' + esc(range) + '</span>' +
      '<span class="prov-sep">·</span><span class="prov-item">분석 시각 ' + esc(stamp) + '</span>' +
      (sig.transcriptCount ? '<span class="prov-sep">·</span><span class="prov-item prov-transcript">🎙️ 자막 기반 분석 포함 (본인 채널 인증, ' + sig.transcriptCount + '개 영상)</span>' : '') +
      '</div>' +
      (history && history.length ? historyTimeline(history) : '') +
      '<details class="data-transparency">' +
      '<summary>🔍 AI가 실제로 참고한 원본 데이터 통계 보기 <span class="dt-hint">(신빙성 검증용 원문 공개)</span></summary>' +
      '<pre>' + esc(P.prompts.signalText(sig)) + '</pre>' +
      '</details>' +
      '</div>';
  }

  /* ---------- 이 채널의 지난 상담 이력 (지속 상담 기능) ---------- */
  function historyTimeline(history) {
    return '<details class="history-timeline">' +
      '<summary>🕓 이 채널 상담 이력 보기 (' + history.length + '건) <span class="dt-hint">지금까지의 점수 추이</span></summary>' +
      '<ul class="history-list">' + history.map(function (r) {
        var sc = (r.result && r.result.scorecard) || {};
        return '<li>' +
          '<span class="hl-date">' + u.fmtDate(r.at) + '</span>' +
          '<span class="hl-score ' + u.scoreClass(sc.overall) + '">' + (sc.overall != null ? sc.overall : "-") + '점 (' + esc(sc.grade || "-") + ')</span>' +
          '<span class="hl-verdict">' + esc(sc.oneLineVerdict || "") + '</span>' +
          '</li>';
      }).join("") + '</ul>' +
      '</details>';
  }

  function renderResults(channel, videos, sig, history) {
    currentVideos = videos.slice();
    sortState = { key: "views", dir: -1 };
    pageState = { page: 0 };
    var sn = channel.snippet || {}, st = channel.statistics || {};
    var thumb = "";
    try { thumb = sn.thumbnails.medium.url || sn.thumbnails.default.url; } catch (e) {}
    var channelUrl = "https://www.youtube.com/channel/" + encodeURIComponent(channel.id || "");

    var html = "";

    // 채널 헤더 + 액션 바
    html += '<div class="result-topbar">';
    html += '<div class="chan-head">';
    if (thumb) html += '<img src="' + esc(thumb) + '" alt="채널 썸네일" />';
    html += '<div><h2><a href="' + esc(channelUrl) + '" target="_blank" rel="noopener" class="chan-link">' + esc(sn.title || "채널") + ' ↗</a></h2>';
    if (sn.description) {
      var d = sn.description.slice(0, 160);
      html += '<p>' + esc(d) + (sn.description.length > 160 ? "…" : "") + '</p>';
    }
    html += '</div></div>';
    html += '<div class="topbar-actions">' +
      '<button class="btn mini" id="btn-copy-report">📋 리포트 복사</button>' +
      '<button class="btn mini" id="btn-print">🖨️ 인쇄/PDF</button>' +
      '</div></div>';

    // 성장 지표 (맥락) — 얇은 스트립
    html += '<div class="metric-strip">';
    html += metric(st.hiddenSubscriberCount ? "비공개" : u.fmtCompact(st.subscriberCount), "구독자");
    html += metric(u.fmtInt(st.videoCount), "총 영상");
    html += metric(u.fmtCompact(st.viewCount), "총 조회수");
    html += metric(u.fmtDate(sn.publishedAt), "개설일");
    html += '<span class="metric-note">이 수치는 <b>맥락</b>일 뿐, 평가 기준이 아닙니다</span>';
    html += '</div>';

    // 데이터 출처 배너 (신빙성) + 지난 상담 이력
    html += provenanceBanner(sig, history);

    // 영상이 적은 초기 단계 채널인지 — prompts.js 와 같은 기준으로 판단
    var isEarlyStage = sig.count <= (P.config.LOW_VIDEO_THRESHOLD || 5);

    // 섹션 번호를 자동 채번(조건부 섹션이 있어도 항상 순서대로 매겨짐)
    var secIdx = 0;
    var aiIds = [];
    function next(id, title, badge, isAi) {
      secIdx++;
      if (isAi !== false) aiIds.push(id);
      return sec(String(secIdx).padStart(2, "0"), id, title, badge);
    }

    html += next("ai-score", "브랜드 서사 스코어카드", { cls: "ai", txt: "AI 정량 평가" });
    html += next("ai-core", "핵심 메시지 · 왜 이 채널을 시작했는가", { cls: "ai", txt: "AI" });
    if (isEarlyStage) {
      html += next("ai-direction", "방향성 상담 · 초기 단계 채널을 위한 가설과 다음 실험", { cls: "ai", txt: "AI 컨설팅" });
    }
    html += next("ai-brand", "브랜드 한 줄 · 포지셔닝 & 슬로건", { cls: "ai", txt: "AI" });
    html += next("ai-actions", "점수를 올리는 우선순위 액션", { cls: "ai", txt: "AI" });
    html += next("ai-roadmap", "90일 브랜딩 로드맵", { cls: "ai", txt: "AI" });
    html += next("ai-pillars", "콘텐츠 기둥 · 이 채널이 소유할 축", { cls: "ai", txt: "AI" });
    html += next("ai-topics", "주제 태그", { cls: "ai", txt: "AI" });
    html += next("ai-review", "지금까지 콘텐츠 리뷰 · 브랜드 관점", { cls: "ai", txt: "AI" });
    html += next("ai-resonance", "공명 분석 · 어떤 영상이 마음에 가 닿았나", { cls: "ai", txt: "AI" });
    html += next("ai-about", "채널 소개글 리라이트 제안", { cls: "ai", txt: "AI" });
    html += next("ai-next", "다음 영상 제안 · 서사를 확장하는 방향", { cls: "ai", txt: "AI" });
    html += next("ai-monetize", "수익화 컨설팅 · 이 채널에 맞는 방법", { cls: "ai", txt: "AI 컨설팅" });
    html += next("video",
      "영상 데이터 전수 분석 <span class=\"count-badge\">" + u.fmtInt(sig.fetchedCount) + "개</span>",
      { cls: "ctx", txt: sig.truncated ? "부분 수집" : "전수 수집" }, false);
    html += next("ai-summary", "종합 총평", { cls: "ai", txt: "AI" });

    currentAiIds = aiIds;

    $("results").innerHTML = html;
    u.show($("results"));

    // 영상 표 렌더 (데이터는 즉시)
    renderTable();

    // 버튼 바인딩
    $("btn-print").addEventListener("click", function () { window.print(); });
    $("btn-copy-report").addEventListener("click", copyReport);

    // AI 로딩 (실제 선택된 모델명을 그대로 표시)
    var loading = '<div class="card"><div class="ai-loading"><div class="spinner"></div>' + esc(P.storage.apiModel()) + ' 가 전체 ' +
      u.fmtInt(sig.fetchedCount) + '개 영상 데이터를 바탕으로 브랜드 서사를 정량 분석하고 있습니다...</div></div>';
    aiIds.forEach(function (id) { $(id + "-body").innerHTML = loading; });
  }

  function metric(v, k) {
    return '<div class="metric"><span class="mv">' + esc(v) + '</span><span class="mk">' + esc(k) + '</span></div>';
  }

  /* ---------- SVG 링 게이지 ---------- */
  function ringGauge(score, grade) {
    var s = u.clampScore(score);
    var r = 62, c = 2 * Math.PI * r;
    var off = c * (1 - s / 100);
    var cls = u.scoreClass(s);
    return '<div class="gauge ' + cls + '">' +
      '<svg viewBox="0 0 160 160" width="160" height="160">' +
      '<circle class="g-track" cx="80" cy="80" r="' + r + '"></circle>' +
      '<circle class="g-fill" cx="80" cy="80" r="' + r + '" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
      'transform="rotate(-90 80 80)"></circle>' +
      '</svg>' +
      '<div class="g-center"><span class="g-score">' + s + '</span>' +
      '<span class="g-of">/ 100</span>' +
      (grade ? '<span class="g-grade">' + esc(grade) + '</span>' : '') + '</div>' +
      '</div>';
  }

  // 지난 분석 대비 점수 변화 — AI 서술이 아니라 JS로 직접 계산해 신뢰도 확보
  function trendDelta(sc, previous) {
    if (!previous) return "";
    var prevSc = (previous.result && previous.result.scorecard) || {};
    if (sc.overall == null || prevSc.overall == null) return "";
    var delta = sc.overall - prevSc.overall;
    var cls = delta > 0 ? "trend-up" : delta < 0 ? "trend-down" : "trend-flat";
    var arrow = delta > 0 ? "▲ +" + delta : delta < 0 ? "▼ " + delta : "− 변화 없음";
    return '<div class="trend-delta ' + cls + '">' +
      '<span class="trend-arrow">' + esc(arrow) + '</span>' +
      '<span class="trend-detail">지난 분석(' + esc(u.fmtDate(previous.at)) + ', ' + prevSc.overall + '점) 대비</span>' +
      '</div>';
  }

  function scoreBar(dim) {
    var s = u.clampScore(dim.score);
    var cls = u.scoreClass(s);
    return '<div class="dim ' + cls + '">' +
      '<div class="dim-top"><span class="dim-name">' + esc(dim.key) + '</span>' +
      '<span class="dim-score">' + s + '<em>' + esc(u.scoreLabel(s)) + '</em></span></div>' +
      '<div class="dim-track"><div class="dim-fill" style="width:' + s + '%"></div></div>' +
      (dim.diagnosis ? '<div class="dim-diag">' + esc(dim.diagnosis) + '</div>' : '') +
      (dim.toImprove ? '<div class="dim-improve"><span class="lbl">↑ 올리려면</span> ' + esc(dim.toImprove) + '</div>' : '') +
      '</div>';
  }

  /* ---------- 렌더 헬퍼 ---------- */
  function chips(arr) {
    if (!arr || !arr.length) return "";
    return '<div class="tags">' + arr.map(function (t) {
      return '<span class="topic">#' + esc(String(t).replace(/^#/, "")) + '</span>';
    }).join("") + '</div>';
  }
  function bullets(arr, cls) {
    if (!arr || !arr.length) return "";
    return '<ul class="' + (cls || "plain") + '">' + arr.map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join("") + '</ul>';
  }
  function levelBadge(level, label) {
    if (!level) return "";
    return '<span class="level ' + levelClass(level) + '">' + esc((label ? label + " " : "") + level) + '</span>';
  }

  /* ---------- 근거(evidence) 실제 영상 대조 검증 — 신빙성 기능 ② ---------- */
  function matchVideo(text, videos) {
    var t = String(text || "").trim();
    if (!t || !videos || !videos.length) return null;
    var tl = t.toLowerCase();
    for (var i = 0; i < videos.length; i++) {
      var vt = String(videos[i].title || "").toLowerCase();
      if (!vt) continue;
      if (vt === tl) return videos[i];
      if (vt.length >= 4 && tl.indexOf(vt) !== -1) return videos[i];
      if (tl.length >= 4 && vt.indexOf(tl) !== -1) return videos[i];
    }
    return null;
  }
  function evidenceList(arr) {
    if (!arr || !arr.length) return "";
    var videos = P.state.videos || [];
    return '<ul class="evi-list">' + arr.map(function (e) {
      var m = matchVideo(e, videos);
      if (m) {
        return '<li class="evi-verified">' +
          '<a href="https://youtu.be/' + esc(m.id) + '" target="_blank" rel="noopener">' + esc(e) + '</a>' +
          ' <span class="evi-check" title="실제 수집된 영상 제목과 대조해 확인됨">✓ 데이터 확인됨</span></li>';
      }
      return '<li class="evi-unverified">' + esc(e) +
        ' <span class="evi-check unverified" title="수집된 영상 목록에서 일치하는 제목을 자동으로 찾지 못했습니다. 패턴에 대한 AI의 해석일 수 있습니다.">AI 해석</span></li>';
    }).join("") + '</ul>';
  }

  function renderAnalysis(res, modelUsed, fullHistory) {
    var r = res || {};
    lastReport = { res: r, model: modelUsed };

    // fullHistory: PhilApp.history.getHistory(channelId) 호출 결과(최신순, 방금 저장된 현재 기록이 [0])
    var previous = (fullHistory && fullHistory.length > 1) ? fullHistory[1] : null;

    // 스코어카드
    var sc = r.scorecard || {};
    var dims = sc.dimensions || [];
    var scHtml = '<div class="card score-card">';
    scHtml += '<div class="score-hero">';
    scHtml += ringGauge(sc.overall, sc.grade);
    scHtml += '<div class="score-verdict">' +
      '<div class="sv-label">종합 브랜드 서사 점수</div>' +
      '<div class="sv-text">' + esc(sc.oneLineVerdict || "") + '</div>' +
      trendDelta(sc, previous) +
      '</div></div>';
    if (r.trendNote) {
      scHtml += '<div class="trend-note"><span class="evi-t">📈 지난 상담 대비 변화</span><p>' + escML(r.trendNote) + '</p></div>';
    }
    scHtml += '<div class="dims">' + dims.map(scoreBar).join("") + '</div>';
    scHtml += '<div class="verify-row">' +
      '<button class="btn mini" id="btn-verify">🔎 결과 재검증 (AI 자체 감사)</button>' +
      '<span class="verify-hint">AI가 자신의 점수·진단을 원본 통계와 다시 대조해 과장·모순이 없는지 스스로 검토합니다.</span>' +
      '</div><div id="verify-panel"></div>';
    scHtml += '</div>';
    $("ai-score-body").innerHTML = scHtml;
    var vbtn = $("btn-verify");
    if (vbtn) vbtn.addEventListener("click", runVerification);

    // 핵심 메시지 (근거 검증 포함)
    var cm = r.coreMessage || {};
    $("ai-core-body").innerHTML = '<div class="card prose">' +
      (cm.confidence ? levelBadge(cm.confidence, "메시지 선명도") : "") +
      '<p class="lead">' + escML(cm.inferredWhy || "메시지를 추론하지 못했습니다.") + '</p>' +
      (cm.evidence && cm.evidence.length ? '<div class="evi"><span class="evi-t">근거 (실제 영상과 자동 대조)</span>' + evidenceList(cm.evidence) + '</div>' : "") +
      '</div>';

    // 방향성 상담 (초기 단계 채널일 때만 섹션 자체가 존재)
    if ($("ai-direction-body")) {
      var dc = r.directionConsulting || {};
      $("ai-direction-body").innerHTML = '<div class="card prose">' +
        (dc.stageNote ? '<p class="lead">' + escML(dc.stageNote) + '</p>' : '<p class="prose">아직 데이터가 적어 방향성을 함께 탐색해 보아요.</p>') +
        (dc.whyHypothesis ? '<div class="evi"><span class="evi-t">🧭 방향성 가설</span><p>' + escML(dc.whyHypothesis) + '</p></div>' : '') +
        (dc.experimentsToTry && dc.experimentsToTry.length ?
          '<div class="evi"><span class="evi-t">시도해볼 실험</span>' + bullets(dc.experimentsToTry) + '</div>' : '') +
        (dc.whatToWatchNext ? '<div class="dim-improve"><span class="lbl">👀 다음에 확인할 것</span> ' + esc(dc.whatToWatchNext) + '</div>' : '') +
        '</div>';
    }

    // 포지셔닝 + 슬로건
    var tags = r.brandTaglines || [];
    $("ai-brand-body").innerHTML = '<div class="card">' +
      (r.positioningStatement ? '<div class="positioning"><span class="evi-t">포지셔닝 한 문장</span><p class="lead">' + escML(r.positioningStatement) + '</p></div>' : "") +
      (tags.length ? '<div class="taglines"><span class="evi-t">브랜드 슬로건 후보</span>' +
        tags.map(function (t) { return '<div class="tagline">“' + esc(t) + '”</div>'; }).join("") + '</div>' : "") +
      '</div>';

    // 우선순위 액션
    var pa = r.priorityActions || [];
    $("ai-actions-body").innerHTML = '<div class="card">' +
      (pa.length ? pa.map(function (a) {
        return '<div class="action-row">' +
          '<span class="pri ' + priClass(a.priority) + '">' + esc(a.priority || "중간") + '</span>' +
          '<div class="action-body"><div class="action-title">' + esc(a.action || "") +
          (a.targetScore ? ' <span class="target">→ ' + esc(a.targetScore) + '</span>' : '') + '</div>' +
          (a.why ? '<div class="action-why"><span class="lbl">이유</span> ' + esc(a.why) + '</div>' : '') +
          (a.how ? '<div class="action-how"><span class="lbl">방법</span> ' + esc(a.how) + '</div>' : '') +
          '</div></div>';
      }).join("") : '<span class="prose">액션을 생성하지 못했습니다.</span>') + '</div>';

    // 로드맵
    var rm = r.roadmap || [];
    $("ai-roadmap-body").innerHTML = '<div class="card"><div class="timeline">' +
      (rm.length ? rm.map(function (p, i) {
        return '<div class="phase"><div class="phase-dot">' + (i + 1) + '</div>' +
          '<div class="phase-body"><div class="phase-name">' + esc(p.phase || "") + '</div>' +
          (p.focus ? '<div class="phase-focus">' + esc(p.focus) + '</div>' : '') +
          bullets(p.actions, "phase-actions") + '</div></div>';
      }).join("") : '<span class="prose">로드맵을 생성하지 못했습니다.</span>') + '</div></div>';

    // 콘텐츠 기둥
    var cp = r.contentPillars || [];
    $("ai-pillars-body").innerHTML =
      (cp.length ? '<div class="pillars">' + cp.map(function (p) {
        return '<div class="pillar"><div class="pillar-name">' + esc(p.name || "") + '</div>' +
          '<div class="pillar-desc">' + esc(p.desc || "") + '</div>' +
          (p.example ? '<div class="pillar-ex">예: ' + esc(p.example) + '</div>' : '') + '</div>';
      }).join("") + '</div>' : '<div class="card prose">콘텐츠 기둥을 생성하지 못했습니다.</div>');

    // 주제 태그
    $("ai-topics-body").innerHTML = '<div class="card">' +
      (r.topics && r.topics.length ? chips(r.topics) : '<span class="prose">주제를 추출하지 못했습니다.</span>') + '</div>';

    // 콘텐츠 리뷰
    var cr = r.contentReview || [];
    $("ai-review-body").innerHTML = '<div class="card">' +
      (cr.length ? cr.map(function (x) {
        return '<div class="review-row"><div class="review-head">' +
          levelBadge(x.brandFit, "브랜드 적합도") +
          '<span class="review-pat">' + esc(x.pattern || "") + '</span></div>' +
          '<div class="review-note">' + esc(x.note || "") + '</div></div>';
      }).join("") : '<span class="prose">리뷰를 생성하지 못했습니다.</span>') + '</div>';

    // 공명 분석
    $("ai-resonance-body").innerHTML = '<div class="card prose"><p>' +
      escML(r.resonanceInsight || "공명 분석을 생성하지 못했습니다.") + '</p></div>';

    // 소개글 리라이트
    var ab = r.aboutRewrite || {};
    $("ai-about-body").innerHTML = '<div class="card"><div class="rewrite">' +
      '<div class="rw-col before"><span class="rw-label">현재</span><p>' + escML(ab.current || "소개글 없음") + '</p></div>' +
      '<div class="rw-arrow">→</div>' +
      '<div class="rw-col after"><span class="rw-label">제안</span><p>' + escML(ab.suggested || "제안을 생성하지 못했습니다.") + '</p></div>' +
      '</div></div>';

    // 다음 영상
    var nv = r.nextVideos || [];
    $("ai-next-body").innerHTML = '<div class="card">' +
      (nv.length ? nv.map(function (v) {
        return '<div class="video-idea"><div class="t">🎬 ' + esc(v.title || "제목 미정") + '</div>' +
          (v.reason ? '<div class="why"><span class="lbl">왜</span> ' + esc(v.reason) + '</div>' : "") +
          (v.howItBuildsNarrative ? '<div class="why narr"><span class="lbl">서사 기여</span> ' + esc(v.howItBuildsNarrative) + '</div>' : "") +
          '</div>';
      }).join("") : '<div class="prose">제안을 생성하지 못했습니다.</div>') + '</div>';

    // 수익화 컨설팅
    var ma = r.monetizationAdvice || [];
    $("ai-monetize-body").innerHTML = '<div class="card">' +
      (r.monetizationPortfolioNote ?
        '<div class="positioning"><span class="evi-t">💼 조합 전략</span><p class="lead">' + escML(r.monetizationPortfolioNote) + '</p></div>' : '') +
      (ma.length ? ma.map(function (m) {
        return '<div class="review-row"><div class="review-head">' +
          levelBadge(m.fit, "적합도") +
          '<span class="review-pat">💰 ' + esc(m.method || "") + '</span></div>' +
          (m.why ? '<div class="review-note">' + esc(m.why) + '</div>' : '') +
          (m.howToStart ? '<div class="action-how" style="margin-top:6px;"><span class="lbl">시작 방법</span> ' + esc(m.howToStart) + '</div>' : '') +
          (m.risk ? '<div class="action-why" style="color:#ff9a97;"><span class="lbl">주의</span> ' + esc(m.risk) + '</div>' : '') +
          '</div>';
      }).join("") : '<span class="prose">수익화 제안을 생성하지 못했습니다.</span>') + '</div>';

    // 총평
    $("ai-summary-body").innerHTML = '<div class="card prose summary-card"><p>' +
      escML(r.summary || "총평을 생성하지 못했습니다.") + '</p>' +
      (modelUsed ? '<div class="model-tag">분석 모델: ' + esc(modelUsed) + '</div>' : "") + '</div>';
  }

  /* ---------- 재검증(자체 감사) — 신빙성 기능 ③ ---------- */
  function runVerification() {
    if (!P.state.isReady() || !P.state.lastResult) return;

    var usingShared = P.storage.usingBuiltin().gm;
    if (usingShared) {
      var gate = P.ratelimit.check();
      if (!gate.allowed) {
        $("verify-panel").innerHTML = '<div class="banner info" style="margin-top:12px;">' + esc(gate.message) + '</div>';
        return;
      }
    }

    var btn = $("btn-verify"), panel = $("verify-panel");
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "검증 중...";
    panel.innerHTML = '<div class="ai-loading" style="margin-top:14px;"><div class="spinner"></div>' +
      'Gemini 가 분석 결과를 원본 통계와 다시 대조해 검증하고 있습니다...</div>';

    if (usingShared) P.ratelimit.record();

    var prompt = P.prompts.buildVerifyPrompt(P.state.channel, P.state.signals, P.state.lastResult);
    P.gemini.analyze(prompt)
      .then(function (out) { renderVerification(out.result); })
      .catch(function (err) {
        panel.innerHTML = '<div class="banner error" style="margin-top:12px;">' +
          esc((err && err.message) || "검증 중 오류가 발생했습니다.") + '</div>';
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = origText;
      });
  }

  function renderVerification(v) {
    v = v || {};
    var checks = v.checks || [];
    var issues = v.issues || [];
    var cls = v.verified ? "verify-pass" : "verify-fail";
    var html = '<div class="verify-result ' + cls + '">';
    html += '<div class="verify-head"><span class="verify-badge">' +
      (v.verified ? "✓ 검증 통과 — 데이터와 부합" : "⚠ 검토 필요 — 일부 불일치 가능성") + '</span>' +
      (v.confidence ? levelBadge(v.confidence, "검증 신뢰도") : "") + '</div>';
    if (v.note) html += '<p class="verify-note">' + escML(v.note) + '</p>';
    if (checks.length) {
      html += '<ul class="verify-checks">' + checks.map(function (c) {
        return '<li class="' + (c.consistent ? "ok" : "warn") + '">' +
          '<span class="vc-icon">' + (c.consistent ? "✓" : "△") + '</span>' +
          '<div><div class="vc-claim">' + esc(c.claim || "") + '</div>' +
          '<div class="vc-note">' + esc(c.note || "") + '</div></div></li>';
      }).join("") + '</ul>';
    }
    if (issues.length) {
      html += '<div class="evi warn-evi"><span class="evi-t">발견된 이슈</span>' + bullets(issues) + '</div>';
    }
    html += '</div>';
    $("verify-panel").innerHTML = html;
  }

  /* ---------- 영상 표 (전수, 페이지네이션) ---------- */
  function renderTable() {
    var vids = currentVideos.slice();
    var key = sortState.key, dir = sortState.dir;
    vids.sort(function (a, b) {
      var av, bv;
      if (key === "publishedAt") { av = new Date(a.publishedAt).getTime(); bv = new Date(b.publishedAt).getTime(); return (av - bv) * dir; }
      if (key === "title") { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
      if (key === "engagement") { av = PhilApp.analysis.engagementRate(a); bv = PhilApp.analysis.engagementRate(b); return (av - bv) * dir; }
      av = a[key] == null ? -1 : a[key]; bv = b[key] == null ? -1 : b[key];
      return (av - bv) * dir;
    });
    function arw(k) { return key === k ? (dir === 1 ? " ▲" : " ▼") : ""; }

    var pageSize = P.config.TABLE_PAGE_SIZE || 25;
    var totalPages = Math.max(1, Math.ceil(vids.length / pageSize));
    if (pageState.page >= totalPages) pageState.page = totalPages - 1;
    if (pageState.page < 0) pageState.page = 0;
    var startIdx = pageState.page * pageSize;
    var pageVids = vids.slice(startIdx, startIdx + pageSize);

    var h = '<p class="section-note">열 제목을 클릭하면 전체 ' + vids.length + '개 기준으로 정렬됩니다. ' +
      '<b>참여율</b>((좋아요+댓글)/조회수)이 높은 영상이 메시지가 실제로 가 닿은 영상일 가능성이 큽니다.</p>';
    h += '<div class="tablewrap"><table><thead><tr>';
    h += '<th>#</th>';
    h += '<th class="sortable" data-k="title">제목<span class="arrow">' + arw("title") + '</span></th>';
    h += '<th class="sortable" data-k="publishedAt">업로드일<span class="arrow">' + arw("publishedAt") + '</span></th>';
    h += '<th class="sortable num" data-k="views">조회수<span class="arrow">' + arw("views") + '</span></th>';
    h += '<th class="sortable num" data-k="likes">좋아요<span class="arrow">' + arw("likes") + '</span></th>';
    h += '<th class="sortable num" data-k="comments">댓글<span class="arrow">' + arw("comments") + '</span></th>';
    h += '<th class="sortable num" data-k="engagement">참여율<span class="arrow">' + arw("engagement") + '</span></th>';
    h += '</tr></thead><tbody>';
    pageVids.forEach(function (v, i) {
      var er = PhilApp.analysis.engagementRate(v);
      h += '<tr>';
      h += '<td class="num">' + (startIdx + i + 1) + '</td>';
      h += '<td class="title"><a href="https://youtu.be/' + esc(v.id) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></td>';
      h += '<td>' + u.fmtDate(v.publishedAt) + '</td>';
      h += '<td class="num">' + u.fmtInt(v.views) + '</td>';
      h += '<td class="num">' + (v.likes == null ? "비공개" : u.fmtInt(v.likes)) + '</td>';
      h += '<td class="num">' + (v.comments == null ? "비공개" : u.fmtInt(v.comments)) + '</td>';
      h += '<td class="num er">' + (v.views ? u.pct(er, 2) : "-") + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="table-pagination">' +
      '<button class="btn mini" id="tbl-prev"' + (pageState.page === 0 ? " disabled" : "") + '>‹ 이전</button>' +
      '<span class="tbl-page-info">' + (pageState.page + 1) + ' / ' + totalPages + ' 페이지 · 총 ' + vids.length + '개</span>' +
      '<button class="btn mini" id="tbl-next"' + (pageState.page >= totalPages - 1 ? " disabled" : "") + '>다음 ›</button>' +
      '</div>';

    $("video-body").innerHTML = h;

    $("video-body").querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-k");
        if (sortState.key === k) sortState.dir *= -1;
        else { sortState.key = k; sortState.dir = (k === "title") ? 1 : -1; }
        pageState.page = 0;
        renderTable();
      });
    });
    var prevBtn = $("tbl-prev"), nextBtn = $("tbl-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { pageState.page--; renderTable(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { pageState.page++; renderTable(); });
  }

  /* ---------- 리포트 복사 (Markdown) ---------- */
  function copyReport() {
    if (!lastReport) return;
    var r = lastReport.res, sc = r.scorecard || {};
    var L = [];
    L.push("# 브랜드 서사 분석 리포트");
    L.push("");
    L.push("## 종합 점수: " + (sc.overall != null ? sc.overall : "-") + "/100 (등급 " + (sc.grade || "-") + ")");
    if (sc.oneLineVerdict) L.push("> " + sc.oneLineVerdict);
    L.push("");
    (sc.dimensions || []).forEach(function (d) {
      L.push("- **" + d.key + "**: " + d.score + "/100 — " + (d.diagnosis || ""));
      if (d.toImprove) L.push("  - ↑ " + d.toImprove);
    });
    L.push("");
    if (r.coreMessage) { L.push("## 핵심 메시지"); L.push(r.coreMessage.inferredWhy || ""); L.push(""); }
    if (r.directionConsulting) {
      L.push("## 방향성 상담 (초기 단계)");
      if (r.directionConsulting.whyHypothesis) L.push(r.directionConsulting.whyHypothesis);
      (r.directionConsulting.experimentsToTry || []).forEach(function (x) { L.push("- " + x); });
      L.push("");
    }
    if (r.positioningStatement) { L.push("## 포지셔닝"); L.push(r.positioningStatement); L.push(""); }
    if (r.brandTaglines && r.brandTaglines.length) { L.push("## 슬로건 후보"); r.brandTaglines.forEach(function (t) { L.push("- " + t); }); L.push(""); }
    if (r.priorityActions && r.priorityActions.length) {
      L.push("## 우선순위 액션");
      r.priorityActions.forEach(function (a) { L.push("- [" + (a.priority || "") + "] " + (a.action || "") + " — " + (a.how || "")); });
      L.push("");
    }
    if (r.roadmap && r.roadmap.length) {
      L.push("## 90일 로드맵");
      r.roadmap.forEach(function (p) {
        L.push("### " + (p.phase || "") + " — " + (p.focus || ""));
        (p.actions || []).forEach(function (x) { L.push("- " + x); });
      });
      L.push("");
    }
    if (r.monetizationAdvice && r.monetizationAdvice.length) {
      L.push("## 수익화 컨설팅");
      if (r.monetizationPortfolioNote) { L.push("> " + r.monetizationPortfolioNote); L.push(""); }
      r.monetizationAdvice.forEach(function (m) {
        L.push("- **" + (m.method || "") + "** [" + (m.fit || "") + "] — " + (m.why || ""));
        if (m.howToStart) L.push("  - 시작: " + m.howToStart);
        if (m.risk) L.push("  - 주의: " + m.risk);
      });
      L.push("");
    }
    if (r.summary) { L.push("## 총평"); L.push(r.summary); }
    var text = L.join("\n");

    var done = function () {
      var b = $("btn-copy-report");
      if (b) { var t = b.textContent; b.textContent = "✓ 복사됨"; setTimeout(function () { b.textContent = t; }, 1600); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function aiError(msg) {
    var html = '<div class="card"><div class="banner error">' + esc(msg) + '</div></div>';
    currentAiIds.forEach(function (id) { if ($(id + "-body")) $(id + "-body").innerHTML = html; });
  }

  /* =====================================================================
   * 📁 내 채널 상담 기록 대시보드 — 메인 화면. 지속 상담의 시작점.
   *   버튼은 data-action(consult|reanalyze|delete) + data-channel-id 로
   *   렌더링만 하고, 실제 동작은 app.js 가 이벤트 위임으로 처리합니다.
   * ===================================================================== */
  function renderChannelDashboard() {
    var container = $("channel-history");
    if (!container) return;
    var channels = P.history.listChannels();
    if (!channels.length) { container.innerHTML = ""; u.hide(container); return; }

    var html = '<div class="chd-head"><h2>📁 내 채널 상담 기록</h2>' +
      '<span class="tag ctx">' + channels.length + '개 채널</span></div>';
    html += '<div class="chd-grid">';
    channels.forEach(function (c) {
      var scoreCls = c.lastScore != null ? u.scoreClass(c.lastScore) : "";
      html += '<div class="chd-card">';
      html += c.thumbnail ? '<img class="chd-thumb" src="' + esc(c.thumbnail) + '" alt="" />' : '<div class="chd-thumb chd-thumb-empty">🎬</div>';
      html += '<div class="chd-info">';
      html += '<div class="chd-name">' + esc(c.title) + '</div>';
      html += '<div class="chd-meta">';
      if (c.lastScore != null) html += '<span class="chd-score ' + scoreCls + '">' + c.lastScore + '점 (' + esc(c.lastGrade || "-") + ')</span>';
      html += '<span class="chd-date">' + esc(u.fmtDate(c.lastAnalyzedAt)) + ' · ' + (c.analysisCount || 1) + '회 상담</span>';
      html += '</div></div>';
      html += '<div class="chd-actions">';
      html += '<button class="btn mini" data-action="consult" data-channel-id="' + esc(c.id) + '">💬 상담 계속하기</button>';
      html += '<button class="btn mini primary" data-action="reanalyze" data-channel-id="' + esc(c.id) + '">🔄 다시 분석</button>';
      html += '<button class="btn mini ghost chd-del" data-action="delete" data-channel-id="' + esc(c.id) + '" title="이 채널 기록 삭제">🗑</button>';
      html += '</div></div>';
    });
    html += '</div>';

    container.innerHTML = html;
    u.show(container);
  }

  return {
    banner: banner,
    renderResults: renderResults,
    renderAnalysis: renderAnalysis,
    renderChannelDashboard: renderChannelDashboard,
    aiError: aiError
  };
})();
