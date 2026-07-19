/* =====================================================================
 * ui.js — 화면 렌더링. 브랜드 서사 섹션을 전면에, 성장 지표는 '맥락'으로.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.ui = (function () {
  var u = PhilApp.utils;
  var $ = u.$, esc = u.esc, escML = u.escMultiline;

  var sortState = { key: "views", dir: -1 };
  var currentVideos = [];

  function banner(html, type) {
    $("global-banner").innerHTML = html
      ? '<div class="banner ' + (type || "info") + '">' + html + "</div>"
      : "";
  }

  function statCard(v, k, sub) {
    return '<div class="stat"><div class="v">' + esc(v) + '</div>' +
      '<div class="k">' + esc(k) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function levelClass(level) {
    if (/높음|서사 축적|강함/.test(level)) return "lv-high";
    if (/낮음|약함|단발/.test(level)) return "lv-low";
    return "lv-mid";
  }

  function renderResults(channel, videos) {
    currentVideos = videos.slice();
    sortState = { key: "views", dir: -1 };
    var sn = channel.snippet || {}, st = channel.statistics || {};
    var thumb = "";
    try { thumb = sn.thumbnails.medium.url || sn.thumbnails.default.url; } catch (e) {}

    var html = "";

    // 채널 헤더
    html += '<section class="block"><div class="card chan-card">';
    html += '<div class="chan-head">';
    if (thumb) html += '<img src="' + esc(thumb) + '" alt="채널 썸네일" />';
    html += '<div><h2>' + esc(sn.title || "채널") + '</h2>';
    if (sn.description) {
      var d = sn.description.slice(0, 220);
      html += '<p>' + esc(d) + (sn.description.length > 220 ? "…" : "") + '</p>';
    }
    html += '</div></div></div></section>';

    // 성장 지표 (맥락)
    html += '<section class="block"><h2>📊 채널 지표 <span class="tag ctx">맥락</span></h2>';
    html += '<p class="section-note">아래 수치는 참고용 맥락입니다. 이 앱은 조회수·구독자가 아니라 <strong>메시지와 서사</strong>를 평가합니다.</p>';
    html += '<div class="stats">';
    html += statCard(st.hiddenSubscriberCount ? "비공개" : u.fmtCompact(st.subscriberCount), "구독자 수");
    html += statCard(u.fmtInt(st.videoCount), "총 영상 개수");
    html += statCard(u.fmtCompact(st.viewCount), "총 조회수");
    html += statCard(u.fmtDate(sn.publishedAt), "채널 개설일");
    html += '</div></section>';

    // 영상 표
    html += '<section class="block"><h2>🎬 최근 영상 <span class="tag">' + videos.length + '개</span></h2>';
    html += '<p class="section-note">열 제목을 클릭하면 정렬됩니다. <strong>참여율</strong>((좋아요+댓글)/조회수)이 높은 영상이 메시지가 실제로 가 닿은 영상일 가능성이 큽니다.</p>';
    html += '<div id="video-table"></div></section>';

    // AI 섹션 (플레이스홀더)
    html += aiPlaceholder("ai-core", "🎯 핵심 메시지 · 이 채널을 왜 시작했는가");
    html += aiPlaceholder("ai-consistency", "🧵 메시지 일관성 · 그 메시지가 콘텐츠에 녹아있는가");
    html += aiPlaceholder("ai-narrative", "📖 서사 축적 진단 · 단발성인가, 이야기를 쌓는가");
    html += aiPlaceholder("ai-diff", "💠 차별성 진단 · 이 채널만의 것은 무엇인가");
    html += aiPlaceholder("ai-topics", "🏷️ 주제 태그");
    html += aiPlaceholder("ai-review", "🔍 지금까지 콘텐츠 리뷰 · 브랜드 관점");
    html += aiPlaceholder("ai-resonance", "💗 공명 분석 · 어떤 영상이 마음에 가 닿았나");
    html += aiPlaceholder("ai-advice", "🛠️ 서사 강화 조언");
    html += aiPlaceholder("ai-next", "💡 다음 영상 제안 · 서사를 확장하는 방향");
    html += aiPlaceholder("ai-summary", "🌱 종합 총평");

    $("results").innerHTML = html;
    u.show($("results"));
    renderTable();

    var loading = '<div class="card"><div class="ai-loading"><div class="spinner"></div>Gemini 3.1 Flash Lite 가 브랜드 서사를 분석하고 있습니다...</div></div>';
    ["ai-core","ai-consistency","ai-narrative","ai-diff","ai-topics","ai-review","ai-resonance","ai-advice","ai-next","ai-summary"]
      .forEach(function (id) { $(id + "-body").innerHTML = loading; });
  }

  function aiPlaceholder(id, title) {
    return '<section class="block" id="' + id + '"><h2>' + title +
      ' <span class="tag ai">AI</span></h2><div id="' + id + '-body"></div></section>';
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

    var h = '<div class="tablewrap"><table><thead><tr>';
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
    $("video-table").innerHTML = h;

    $("video-table").querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-k");
        if (sortState.key === k) sortState.dir *= -1;
        else { sortState.key = k; sortState.dir = (k === "title") ? 1 : -1; }
        renderTable();
      });
    });
  }

  /* ---------- AI 결과 렌더 ---------- */
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
    return '<span class="level ' + levelClass(level) + '">' + esc((label ? label + ": " : "") + level) + '</span>';
  }

  function renderAnalysis(res, modelUsed) {
    var r = res || {};

    // 핵심 메시지
    var cm = r.coreMessage || {};
    $("ai-core-body").innerHTML = '<div class="card prose">' +
      (cm.confidence ? levelBadge(cm.confidence, "메시지 선명도") : "") +
      '<p class="lead">' + escML(cm.inferredWhy || "메시지를 추론하지 못했습니다.") + '</p>' +
      (cm.evidence && cm.evidence.length ? '<div class="evi"><span class="evi-t">근거</span>' + bullets(cm.evidence, "evi-list") + '</div>' : "") +
      '</div>';

    // 메시지 일관성
    var mc = r.messageConsistency || {};
    var mcHtml = '<div class="card prose">' + levelBadge(mc.level, "일관성") +
      '<p>' + escML(mc.assessment || "") + '</p>';
    if (mc.aligned && mc.aligned.length) mcHtml += '<div class="dual"><div class="good"><span class="dt">✓ 메시지가 잘 드러남</span>' + bullets(mc.aligned) + '</div>';
    if (mc.drifting && mc.drifting.length) mcHtml += '<div class="warn"><span class="dt">△ 결이 다름/이탈</span>' + bullets(mc.drifting) + '</div>';
    if (mc.aligned && mc.aligned.length) mcHtml += '</div>';
    mcHtml += '</div>';
    $("ai-consistency-body").innerHTML = mcHtml;

    // 서사 축적
    var nb = r.narrativeBuilding || {};
    $("ai-narrative-body").innerHTML = '<div class="card prose">' +
      (nb.verdict ? '<span class="verdict ' + levelClass(nb.verdict) + '">' + esc(nb.verdict) + '</span>' : "") +
      '<p>' + escML(nb.assessment || "") + '</p>' +
      (nb.throughlines && nb.throughlines.length ? '<div class="evi"><span class="evi-t">채널을 관통하는 축</span>' + chips(nb.throughlines) + '</div>' : "") +
      '</div>';

    // 차별성
    var df = r.differentiation || {};
    var dfHtml = '<div class="card prose"><p>' + escML(df.assessment || "") + '</p>';
    if (df.uniqueAngles && df.uniqueAngles.length) dfHtml += '<div class="evi"><span class="evi-t">이 채널만의 강점</span>' + chips(df.uniqueAngles) + '</div>';
    if (df.risks && df.risks.length) dfHtml += '<div class="evi warn-evi"><span class="evi-t">차별성을 약화시키는 지점</span>' + bullets(df.risks) + '</div>';
    dfHtml += '</div>';
    $("ai-diff-body").innerHTML = dfHtml;

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

    // 서사 강화 조언
    var na = r.narrativeAdvice || [];
    $("ai-advice-body").innerHTML = '<div class="card"><ul class="advice">' +
      (na.length ? na.map(function (a) {
        return '<li><strong>' + esc(a.title || "조언") + '</strong><div>' + escML(a.detail || "") + '</div></li>';
      }).join("") : '<li>조언을 생성하지 못했습니다.</li>') + '</ul></div>';

    // 다음 영상 제안
    var nv = r.nextVideos || [];
    $("ai-next-body").innerHTML = '<div class="card">' +
      (nv.length ? nv.map(function (v) {
        return '<div class="video-idea"><div class="t">🎬 ' + esc(v.title || "제목 미정") + '</div>' +
          (v.reason ? '<div class="why"><span class="lbl">왜</span> ' + esc(v.reason) + '</div>' : "") +
          (v.howItBuildsNarrative ? '<div class="why narr"><span class="lbl">서사 기여</span> ' + esc(v.howItBuildsNarrative) + '</div>' : "") +
          '</div>';
      }).join("") : '<div class="prose">제안을 생성하지 못했습니다.</div>') + '</div>';

    // 총평
    $("ai-summary-body").innerHTML = '<div class="card prose summary-card"><p>' +
      escML(r.summary || "총평을 생성하지 못했습니다.") + '</p>' +
      (modelUsed ? '<div class="model-tag">분석 모델: ' + esc(modelUsed) + '</div>' : "") + '</div>';
  }

  function aiError(msg) {
    var html = '<div class="card"><div class="banner error">' + esc(msg) + '</div></div>';
    ["ai-core","ai-consistency","ai-narrative","ai-diff","ai-topics","ai-review","ai-resonance","ai-advice","ai-next","ai-summary"]
      .forEach(function (id) { if ($(id + "-body")) $(id + "-body").innerHTML = html; });
  }

  return {
    banner: banner,
    renderResults: renderResults,
    renderAnalysis: renderAnalysis,
    aiError: aiError
  };
})();
