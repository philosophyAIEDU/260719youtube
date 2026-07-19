/* =====================================================================
 * analysis.js — 원시 영상 데이터를 '서사 분석용 신호'로 가공.
 *
 * 핵심 철학: 조회수(도달)와 '참여 깊이'(공명)를 분리해서 본다.
 *   - 조회수가 높다고 좋은 콘텐츠가 아니다.
 *   - 오히려 (좋아요+댓글)/조회수 = 참여율이 높은 영상이
 *     "메시지가 사람에게 가 닿은" 영상일 가능성이 크다.
 * 이 신호들을 프롬프트 컨텍스트로 넘겨, Gemini 가 표면 지표가 아니라
 * 브랜드 메시지·서사 관점으로 판단하도록 돕는다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.analysis = (function () {
  var u = PhilApp.utils;

  var STOPWORDS = {
    "그리고": 1, "그런데": 1, "하지만": 1, "그러나": 1, "정말": 1, "너무": 1,
    "이것": 1, "저것": 1, "그것": 1, "여기": 1, "우리": 1, "당신": 1, "오늘": 1,
    "the": 1, "and": 1, "for": 1, "you": 1, "this": 1, "that": 1, "with": 1,
    "vlog": 1, "shorts": 1, "ep": 1
  };

  function median(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function engagementRate(v) {
    if (!v.views) return 0;
    var likes = v.likes || 0;
    var comments = v.comments || 0;
    return (likes + comments) / v.views;
  }

  // 제목에서 반복 키워드 추출 (한국어/영어 혼용 대응)
  function keywordFrequency(videos, topN) {
    var counts = {};
    videos.forEach(function (v) {
      var tokens = String(v.title)
        .toLowerCase()
        .split(/[\s,.\-\[\]()·|!?~"'“”‘’…:;/\\#@%&*+=<>{}]+/);
      tokens.forEach(function (t) {
        t = t.trim();
        if (t.length < 2) return;
        if (STOPWORDS[t]) return;
        if (/^\d+$/.test(t)) return;
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(function (k) { return { word: k, count: counts[k] }; })
      .filter(function (x) { return x.count >= 2; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, topN || 12);
  }

  function computeSignals(channel, videos) {
    var withViews = videos.filter(function (v) { return v.views > 0; });
    var views = videos.map(function (v) { return v.views; });

    var avgViews = views.length ? views.reduce(function (a, b) { return a + b; }, 0) / views.length : 0;
    var medViews = median(views);

    // 참여율 계산 후 순위
    var rated = videos.map(function (v) {
      return { v: v, er: engagementRate(v) };
    });
    var byEngagement = rated.slice().sort(function (a, b) { return b.er - a.er; });
    var byViews = videos.slice().sort(function (a, b) { return b.views - a.views; });

    // 업로드 주기 (일)
    var sortedByDate = videos.slice().sort(function (a, b) {
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });
    var gaps = [];
    for (var i = 0; i < sortedByDate.length - 1; i++) {
      gaps.push(u.daysBetween(sortedByDate[i].publishedAt, sortedByDate[i + 1].publishedAt));
    }
    var avgGap = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null;

    // 제목 길이
    var titleLens = videos.map(function (v) { return v.title.length; });
    var avgTitleLen = titleLens.length ? titleLens.reduce(function (a, b) { return a + b; }, 0) / titleLens.length : 0;

    return {
      count: videos.length,
      avgViews: Math.round(avgViews),
      medianViews: Math.round(medViews),
      avgUploadGapDays: avgGap == null ? null : Math.round(avgGap * 10) / 10,
      avgTitleLen: Math.round(avgTitleLen),
      keywords: keywordFrequency(videos, 12),
      // 도달 상위 (조회수) vs 공명 상위 (참여율) — AI 가 대조하도록
      topByViews: byViews.slice(0, 5).map(fmtV),
      topByEngagement: byEngagement.slice(0, 5).map(function (x) {
        var o = fmtV(x.v); o.engagementRate = x.er; return o;
      }),
      dateRange: sortedByDate.length
        ? { newest: sortedByDate[0].publishedAt, oldest: sortedByDate[sortedByDate.length - 1].publishedAt }
        : null,
      likesHidden: videos.some(function (v) { return v.likes == null; }),
      commentsHidden: videos.some(function (v) { return v.comments == null; })
    };
  }

  function fmtV(v) {
    return {
      title: v.title,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      publishedAt: v.publishedAt
    };
  }

  return { computeSignals: computeSignals, engagementRate: engagementRate };
})();
