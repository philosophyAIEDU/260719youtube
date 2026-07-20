/* =====================================================================
 * analysis.js — 원시 영상 데이터를 '서사 분석용 신호'로 가공.
 *
 * 핵심 철학: 조회수(도달)와 '참여 깊이'(공명)를 분리해서 본다.
 *   - 조회수가 높다고 좋은 콘텐츠가 아니다.
 *   - 오히려 (좋아요+댓글)/조회수 = 참여율이 높은 영상이
 *     "메시지가 사람에게 가 닿은" 영상일 가능성이 크다.
 *
 * 이제 채널의 (사실상) 전체 영상 이력을 대상으로 통계를 계산합니다.
 *   - 전체 이력을 초기/중기/최근 3개 시기로 나눠 추이(트렌드)를 본다.
 *   - Gemini 에게는 전체 통계 + '대표 샘플'(상위 조회수/상위 참여율/최신/
 *     초기/균등 분포)만 원문으로 보내 프롬프트 크기를 합리적으로 유지하되,
 *     통계 자체는 전체 데이터를 기반으로 계산해 신뢰도를 높인다.
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
  function avg(nums) {
    return nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : 0;
  }

  function engagementRate(v) {
    if (!v.views) return 0;
    var likes = v.likes || 0;
    var comments = v.comments || 0;
    return (likes + comments) / v.views;
  }

  // 제목에서 반복 키워드 추출 (한국어/영어 혼용 대응) — 전체 영상 대상
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

  function fmtV(v) {
    return { title: v.title, views: v.views, likes: v.likes, comments: v.comments, publishedAt: v.publishedAt };
  }

  // 시간순(오래된→최신) 정렬된 영상을 3등분해 초기/중기/최근 구간 통계 비교
  function eraBreakdown(sortedAsc) {
    if (sortedAsc.length < 6) return null; // 너무 적으면 추이 비교 의미 없음
    var n = sortedAsc.length;
    var third = Math.ceil(n / 3);
    var early = sortedAsc.slice(0, third);
    var mid = sortedAsc.slice(third, third * 2);
    var recent = sortedAsc.slice(third * 2);

    function stat(arr, label) {
      var views = arr.map(function (v) { return v.views; });
      var ers = arr.map(engagementRate);
      return {
        label: label,
        count: arr.length,
        range: arr.length ? { from: arr[0].publishedAt, to: arr[arr.length - 1].publishedAt } : null,
        avgViews: Math.round(avg(views)),
        avgEngagement: avg(ers)
      };
    }
    return [stat(early, "초기"), stat(mid, "중기"), stat(recent, "최근")];
  }

  // Gemini 프롬프트에 원문으로 넣을 '대표 샘플' 선택
  // (상위 조회수 + 상위 참여율 + 최신 + 최초기 + 시간축 균등분포를 섞어 중복 제거)
  function selectSample(videos, n) {
    if (videos.length <= n) return videos.slice();

    var byViews = videos.slice().sort(function (a, b) { return b.views - a.views; });
    var byEngagement = videos.slice().sort(function (a, b) { return engagementRate(b) - engagementRate(a); });
    var byDateDesc = videos.slice().sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
    var byDateAsc = byDateDesc.slice().reverse();

    var picked = [];
    var seen = {};
    function add(v) { if (!seen[v.id]) { seen[v.id] = 1; picked.push(v); } }

    var quota = Math.max(2, Math.round(n * 0.25));
    byViews.slice(0, quota).forEach(add);
    byEngagement.slice(0, quota).forEach(add);
    byDateDesc.slice(0, quota).forEach(add);       // 최신
    byDateAsc.slice(0, Math.max(2, Math.round(n * 0.15))).forEach(add); // 초창기(뿌리)

    // 남는 자리는 시간축 균등 분포로 채워 '흐름'을 놓치지 않게 함
    if (picked.length < n) {
      var step = Math.max(1, Math.floor(byDateAsc.length / (n - picked.length + 1)));
      for (var i = 0; i < byDateAsc.length && picked.length < n; i += step) add(byDateAsc[i]);
    }
    // 여전히 부족하면 조회수 순으로 채움
    var idx = 0;
    while (picked.length < n && idx < byViews.length) { add(byViews[idx]); idx++; }

    // 최신순으로 정렬해 반환 (프롬프트에서 읽기 자연스럽게)
    return picked.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); }).slice(0, n);
  }

  function computeSignals(channel, videos, meta) {
    meta = meta || {};
    var views = videos.map(function (v) { return v.views; });
    var avgViews = avg(views);
    var medViews = median(views);

    var rated = videos.map(function (v) { return { v: v, er: engagementRate(v) }; });
    var byEngagement = rated.slice().sort(function (a, b) { return b.er - a.er; });
    var byViews = videos.slice().sort(function (a, b) { return b.views - a.views; });

    var sortedDesc = videos.slice().sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
    var sortedAsc = sortedDesc.slice().reverse();

    var gaps = [];
    for (var i = 0; i < sortedDesc.length - 1; i++) {
      gaps.push(u.daysBetween(sortedDesc[i].publishedAt, sortedDesc[i + 1].publishedAt));
    }
    var avgGap = gaps.length ? avg(gaps) : null;

    var titleLens = videos.map(function (v) { return v.title.length; });
    var avgTitleLen = avg(titleLens);

    var spanDays = sortedAsc.length >= 2 ? u.daysBetween(sortedAsc[0].publishedAt, sortedDesc[0].publishedAt) : 0;

    return {
      count: videos.length,
      fetchedCount: meta.fetchedCount != null ? meta.fetchedCount : videos.length,
      truncated: !!meta.truncated,
      channelVideoCount: meta.channelVideoCount != null ? meta.channelVideoCount : null,
      transcriptCount: videos.filter(function (v) { return !!v.transcriptExcerpt; }).length,

      avgViews: Math.round(avgViews),
      medianViews: Math.round(medViews),
      avgUploadGapDays: avgGap == null ? null : Math.round(avgGap * 10) / 10,
      avgTitleLen: Math.round(avgTitleLen),
      spanDays: Math.round(spanDays),

      keywords: keywordFrequency(videos, 14),
      topByViews: byViews.slice(0, 5).map(fmtV),
      topByEngagement: byEngagement.slice(0, 5).map(function (x) { var o = fmtV(x.v); o.engagementRate = x.er; return o; }),

      eras: eraBreakdown(sortedAsc),

      dateRange: sortedAsc.length
        ? { oldest: sortedAsc[0].publishedAt, newest: sortedDesc[0].publishedAt }
        : null,

      likesHidden: videos.some(function (v) { return v.likes == null; }),
      commentsHidden: videos.some(function (v) { return v.comments == null; })
    };
  }

  return {
    computeSignals: computeSignals,
    engagementRate: engagementRate,
    selectSample: selectSample
  };
})();
