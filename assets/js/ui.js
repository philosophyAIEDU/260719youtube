/* =====================================================================
 * ui.js — 프로페셔널 분석 대시보드 렌더링.
 *   · 브랜드 스코어카드(종합 링 게이지 + 지표별 바) = 결과의 중심
 *   · 브랜딩 자산(슬로건/포지셔닝/소개글 리라이트/콘텐츠 기둥/90일 로드맵)
 *   · 점수를 올리는 우선순위 액션
 *   · 리포트 복사/인쇄
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.ui = (function () {
  var u = PhilApp.utils;
  var $ = u.$, esc = u.esc, escML = u.escMultiline;

  var sortState = { key: "views", dir: -1 };
  var currentVideos = [];
  var lastReport = null;   // 리포트 복사용

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
      '<h2>' + title + (badge ? ' <span class="tag ' + badge.cls + '">' + badge.txt + '</span>' : '') + '</h2></div>' +
      '<div id="' + id + '-body"></div></section>';
  }

  function renderResults(channel, videos) {
    currentVideos = videos.slice();
    sortState = { key: "views", dir: -1 };
    var sn = channel.snippet || {}, st = channel.statistics || {};
    var thumb = "";
    try { thumb = sn.thumbnails.medium.url || sn.thumbnails.default.url; } catch (e) {}

    var html = "";

    // 채널 헤더 + 액션 바
    html += '<div class="result-topbar">';
    html += '<div class="chan-head">';
    if (thumb) html += '<img src="' + esc(thumb) + '" alt="채널 썸네일" />';
    html += '<div><h2>' + esc(sn.title || "채널") + '</h2>';
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

    // 01 스코어카드 (중심)
    html += sec("01", "ai-score", "브랜드 서사 스코어카드", { cls: "ai", txt: "AI 정량 평가" });
    // 02 핵심 메시지
    html += sec("02", "ai-core", "핵심 메시지 · 왜 이 채널을 시작했는가", { cls: "ai", txt: "AI" });
    // 03 포지셔닝 + 슬로건
    html += sec("03", "ai-brand", "브랜드 한 줄 · 포지셔닝 & 슬로건", { cls: "ai", txt: "AI" });
    // 04 우선순위 액션
    html += sec("04", "ai-actions", "점수를 올리는 우선순위 액션", { cls: "ai", txt: "AI" });
    // 05 90일 로드맵
    html += sec("05", "ai-roadmap", "90일 브랜딩 로드맵", { cls: "ai", txt: "AI" });
    // 06 콘텐츠 기둥
    html += sec("06", "ai-pillars", "콘텐츠 기둥 · 이 채널이 소유할 축", { cls: "ai", txt: "AI" });
    // 07 주제 태그
    html += sec("07", "ai-topics", "주제 태그", { cls: "ai", txt: "AI" });
    // 08 콘텐츠 리뷰
    html += sec("08", "ai-review", "지금까지 콘텐츠 리뷰 · 브랜드 관점", { cls: "ai", txt: "AI" });
    // 09 공명 분석
    html += sec("09", "ai-resonance", "공명 분석 · 어떤 영상이 마음에 가 닿았나", { cls: "ai", txt: "AI" });
    // 10 소개글 리라이트
    html += sec("10", "ai-about", "채널 소개글 리라이트 제안", { cls: "ai", txt: "AI" });
    // 11 다음 영상 제안
    html += sec("11", "ai-next", "다음 영상 제안 · 서사를 확장하는 방향", { cls: "ai", txt: "AI" });
    // 12 최근 영상 (데이터)
    html += sec("12", "video", "최근 영상 데이터", { cls: "ctx", txt: "데이터" });
    // 13 총평
    html += sec("13", "ai-summary", "종합 총평", { cls: "ai", txt: "AI" });

    $("results").innerHTML = html;
    u.show($("results"));

    // 영상 표 렌더 (데이터는 즉시)
    renderTable();

    // 버튼 바인딩
    $("btn-print").addEventListener("click", function () { window.print(); });
    $("btn-copy-report").addEventListener("click", copyReport);

    // AI 로딩
    var loading = '<div class="card"><div class="ai-loading"><div class="spinner"></div>Gemini 3.1 Flash Lite 가 브랜드 서사를 정량 분석하고 있습니다...</div></div>';
    ["ai-score","ai-core","ai-brand","ai-actions","ai-roadmap","ai-pillars","ai-topics","ai-review","ai-resonance","ai-about","ai-next","ai-summary"]
      .forEach(function (id) { $(id + "-body").innerHTML = loading; });
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

  function renderAnalysis(res, modelUsed) {
    var r = res || {};
    lastReport = { res: r, model: modelUsed };

    // 01 스코어카드
    var sc = r.scorecard || {};
    var dims = sc.dimensions || [];
    var scHtml = '<div class="card score-card">';
    scHtml += '<div class="score-hero">';
    scHtml += ringGauge(sc.overall, sc.grade);
    scHtml += '<div class="score-verdict">' +
      '<div class="sv-label">종합 브랜드 서사 점수</div>' +
      '<div class="sv-text">' + esc(sc.oneLineVerdict || "") + '</div>' +
      '</div></div>';
    scHtml += '<div class="dims">' + dims.map(scoreBar).join("") + '</div>';
    scHtml += '</div>';
    $("ai-score-body").innerHTML = scHtml;

    // 02 핵심 메시지
    var cm = r.coreMessage || {};
    $("ai-core-body").innerHTML = '<div class="card prose">' +
      (cm.confidence ? levelBadge(cm.confidence, "메시지 선명도") : "") +
      '<p class="lead">' + escML(cm.inferredWhy || "메시지를 추론하지 못했습니다.") + '</p>' +
      (cm.evidence && cm.evidence.length ? '<div class="evi"><span class="evi-t">근거</span>' + bullets(cm.evidence, "evi-list") + '</div>' : "") +
      '</div>';

    // 03 포지셔닝 + 슬로건
    var tags = r.brandTaglines || [];
    $("ai-brand-body").innerHTML = '<div class="card">' +
      (r.positioningStatement ? '<div class="positioning"><span class="evi-t">포지셔닝 한 문장</span><p class="lead">' + escML(r.positioningStatement) + '</p></div>' : "") +
      (tags.length ? '<div class="taglines"><span class="evi-t">브랜드 슬로건 후보</span>' +
        tags.map(function (t) { return '<div class="tagline">“' + esc(t) + '”</div>'; }).join("") + '</div>' : "") +
      '</div>';

    // 04 우선순위 액션
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

    // 05 로드맵
    var rm = r.roadmap || [];
    $("ai-roadmap-body").innerHTML = '<div class="card"><div class="timeline">' +
      (rm.length ? rm.map(function (p, i) {
        return '<div class="phase"><div class="phase-dot">' + (i + 1) + '</div>' +
          '<div class="phase-body"><div class="phase-name">' + esc(p.phase || "") + '</div>' +
          (p.focus ? '<div class="phase-focus">' + esc(p.focus) + '</div>' : '') +
          bullets(p.actions, "phase-actions") + '</div></div>';
      }).join("") : '<span class="prose">로드맵을 생성하지 못했습니다.</span>') + '</div></div>';

    // 06 콘텐츠 기둥
    var cp = r.contentPillars || [];
    $("ai-pillars-body").innerHTML =
      (cp.length ? '<div class="pillars">' + cp.map(function (p) {
        return '<div class="pillar"><div class="pillar-name">' + esc(p.name || "") + '</div>' +
          '<div class="pillar-desc">' + esc(p.desc || "") + '</div>' +
          (p.example ? '<div class="pillar-ex">예: ' + esc(p.example) + '</div>' : '') + '</div>';
      }).join("") + '</div>' : '<div class="card prose">콘텐츠 기둥을 생성하지 못했습니다.</div>');

    // 07 주제 태그
    $("ai-topics-body").innerHTML = '<div class="card">' +
      (r.topics && r.topics.length ? chips(r.topics) : '<span class="prose">주제를 추출하지 못했습니다.</span>') + '</div>';

    // 08 콘텐츠 리뷰
    var cr = r.contentReview || [];
    $("ai-review-body").innerHTML = '<div class="card">' +
      (cr.length ? cr.map(function (x) {
        return '<div class="review-row"><div class="review-head">' +
          levelBadge(x.brandFit, "브랜드 적합도") +
          '<span class="review-pat">' + esc(x.pattern || "") + '</span></div>' +
          '<div class="review-note">' + esc(x.note || "") + '</div></div>';
      }).join("") : '<span class="prose">리뷰를 생성하지 못했습니다.</span>') + '</div>';

    // 09 공명 분석
    $("ai-resonance-body").innerHTML = '<div class="card prose"><p>' +
      escML(r.resonanceInsight || "공명 분석을 생성하지 못했습니다.") + '</p></div>';

    // 10 소개글 리라이트
    var ab = r.aboutRewrite || {};
    $("ai-about-body").innerHTML = '<div class="card"><div class="rewrite">' +
      '<div class="rw-col before"><span class="rw-label">현재</span><p>' + escML(ab.current || "소개글 없음") + '</p></div>' +
      '<div class="rw-arrow">→</div>' +
      '<div class="rw-col after"><span class="rw-label">제안</span><p>' + escML(ab.suggested || "제안을 생성하지 못했습니다.") + '</p></div>' +
      '</div></div>';

    // 11 다음 영상
    var nv = r.nextVideos || [];
    $("ai-next-body").innerHTML = '<div class="card">' +
      (nv.length ? nv.map(function (v) {
        return '<div class="video-idea"><div class="t">🎬 ' + esc(v.title || "제목 미정") + '</div>' +
          (v.reason ? '<div class="why"><span class="lbl">왜</span> ' + esc(v.reason) + '</div>' : "") +
          (v.howItBuildsNarrative ? '<div class="why narr"><span class="lbl">서사 기여</span> ' + esc(v.howItBuildsNarrative) + '</div>' : "") +
          '</div>';
      }).join("") : '<div class="prose">제안을 생성하지 못했습니다.</div>') + '</div>';

    // 13 총평
    $("ai-summary-body").innerHTML = '<div class="card prose summary-card"><p>' +
      escML(r.summary || "총평을 생성하지 못했습니다.") + '</p>' +
      (modelUsed ? '<div class="model-tag">분석 모델: ' + esc(modelUsed) + '</div>' : "") + '</div>';
  }

  /* ---------- 영상 표 ---------- */
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

    var h = '<p class="section-note">열 제목을 클릭하면 정렬됩니다. <b>참여율</b>((좋아요+댓글)/조회수)이 높은 영상이 메시지가 실제로 가 닿은 영상일 가능성이 큽니다.</p>';
    h += '<div class="tablewrap"><table><thead><tr>';
    h += '<th>#</th>';
    h += '<th class="sortable" data-k="title">제목<span class="arrow">' + arw("title") + '</span></th>';
    h += '<th class="sortable" data-k="publishedAt">업로드일<span class="arrow">' + arw("publishedAt") + '</span></th>';
    h += '<th class="sortable num" data-k="views">조회수<span class="arrow">' + arw("views") + '</span></th>';
    h += '<th class="sortable num" data-k="likes">좋아요<span class="arrow">' + arw("likes") + '</span></th>';
    h += '<th class="sortable num" data-k="comments">댓글<span class="arrow">' + arw("comments") + '</span></th>';
    h += '<th class="sortable num" data-k="engagement">참여율<span class="arrow">' + arw("engagement") + '</span></th>';
    h += '</tr></thead><tbody>';
    vids.forEach(function (v, i) {
      var er = PhilApp.analysis.engagementRate(v);
      h += '<tr>';
      h += '<td class="num">' + (i + 1) + '</td>';
      h += '<td class="title"><a href="https://youtu.be/' + esc(v.id) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a></td>';
      h += '<td>' + u.fmtDate(v.publishedAt) + '</td>';
      h += '<td class="num">' + u.fmtInt(v.views) + '</td>';
      h += '<td class="num">' + (v.likes == null ? "비공개" : u.fmtInt(v.likes)) + '</td>';
      h += '<td class="num">' + (v.comments == null ? "비공개" : u.fmtInt(v.comments)) + '</td>';
      h += '<td class="num er">' + (v.views ? u.pct(er, 2) : "-") + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    $("video-body").innerHTML = h;

    $("video-body").querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-k");
        if (sortState.key === k) sortState.dir *= -1;
        else { sortState.key = k; sortState.dir = (k === "title") ? 1 : -1; }
        renderTable();
      });
    });
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
    ["ai-score","ai-core","ai-brand","ai-actions","ai-roadmap","ai-pillars","ai-topics","ai-review","ai-resonance","ai-about","ai-next","ai-summary"]
      .forEach(function (id) { if ($(id + "-body")) $(id + "-body").innerHTML = html; });
  }

  return {
    banner: banner,
    renderResults: renderResults,
    renderAnalysis: renderAnalysis,
    aiError: aiError
  };
})();
