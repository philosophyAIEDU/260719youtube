/* =====================================================================
 * youtube.js — YouTube Data API v3 클라이언트
 *   channels.list / search.list / playlistItems.list / videos.list
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.youtube = (function () {
  var cfg = PhilApp.config;
  var storage = PhilApp.storage;

  function humanError(status, data) {
    var reason = "";
    try { reason = data.error.errors[0].reason || ""; } catch (e) {}
    var msg = "";
    try { msg = data.error.message || ""; } catch (e) {}

    if (status === 403 && /quota|dailyLimitExceeded|rateLimitExceeded/i.test(reason)) {
      return "오늘 YouTube 무료 사용 한도가 모두 소진되었습니다. 한도는 매일(태평양 시간 자정) 자동 초기화되니 내일 다시 시도해 주세요. (설정에서 본인의 YouTube API 키를 입력하면 바로 사용할 수 있습니다.)";
    }
    if ((status === 400 || status === 403) && /keyInvalid|API key not valid/i.test(reason + msg)) {
      return "YouTube Data API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.";
    }
    if (status === 403) {
      return "YouTube API 접근이 거부되었습니다. 키 설정 또는 'YouTube Data API v3' 활성화 여부를 확인해 주세요.";
    }
    return "YouTube API 오류가 발생했습니다." + (msg ? " (" + msg + ")" : "");
  }

  function apiFetch(endpoint, params) {
    params = Object.assign({}, params, { key: storage.apiYT() });
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    return fetch(cfg.YT_API_BASE + endpoint + "?" + qs).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(humanError(r.status, data));
        return data;
      });
    });
  }

  /* ---- 입력 파싱: @핸들 / URL / 채널ID / 검색어 ---- */
  function parseInput(raw) {
    var s = (raw || "").trim();
    if (!s) return null;
    var m;

    m = s.match(/channel\/(UC[\w-]{20,})/i);
    if (m) return { type: "id", value: m[1] };

    m = s.match(/\/@([^\/?#\s]+)/);
    if (m) return { type: "handle", value: decodeURIComponent(m[1]) };

    m = s.match(/\/user\/([^\/?#\s]+)/i);
    if (m) return { type: "user", value: decodeURIComponent(m[1]) };

    m = s.match(/\/c\/([^\/?#\s]+)/i);
    if (m) return { type: "search", value: decodeURIComponent(m[1]) };

    if (s.charAt(0) === "@") return { type: "handle", value: s.slice(1) };
    if (/^UC[\w-]{20,}$/.test(s)) return { type: "id", value: s };

    if (/youtube\.com|youtu\.be/i.test(s)) {
      var seg = s.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop();
      if (seg) return { type: "search", value: decodeURIComponent(seg) };
    }
    return { type: "handle", value: s };
  }

  var PART = "snippet,statistics,contentDetails,brandingSettings";

  function byId(id) { return apiFetch("channels", { part: PART, id: id }); }
  function byHandle(h) { return apiFetch("channels", { part: PART, forHandle: h }); }
  function byUser(u) { return apiFetch("channels", { part: PART, forUsername: u }); }
  function bySearch(q) {
    return apiFetch("search", { part: "snippet", type: "channel", q: q, maxResults: 1 })
      .then(function (d) {
        if (!d.items || !d.items.length) throw new Error("NOTFOUND");
        var cid = (d.items[0].snippet && d.items[0].snippet.channelId) ||
                  (d.items[0].id && d.items[0].id.channelId);
        return byId(cid);
      });
  }

  function resolveChannel(parsed) {
    var primary;
    if (parsed.type === "id") primary = byId(parsed.value);
    else if (parsed.type === "handle") primary = byHandle(parsed.value);
    else if (parsed.type === "user") primary = byUser(parsed.value);
    else primary = bySearch(parsed.value);

    return primary.then(function (d) {
      if (d.items && d.items.length) return d.items[0];
      // 핸들/유저로 못 찾으면 검색으로 재시도
      if (parsed.type === "handle" || parsed.type === "user") {
        return bySearch(parsed.value).then(function (d2) {
          if (d2.items && d2.items.length) return d2.items[0];
          throw new Error("NOTFOUND");
        });
      }
      throw new Error("NOTFOUND");
    });
  }

  function mapVideoItem(it) {
    var s = it.statistics || {};
    return {
      id: it.id,
      title: it.snippet.title,
      description: it.snippet.description || "",
      publishedAt: it.snippet.publishedAt,
      tags: it.snippet.tags || [],
      duration: it.contentDetails && it.contentDetails.duration || "",
      views: Number(s.viewCount || 0),
      likes: s.likeCount != null ? Number(s.likeCount) : null,
      comments: s.commentCount != null ? Number(s.commentCount) : null
    };
  }

  /* ---- 업로드 재생목록의 영상 ID를 끝까지(또는 상한까지) 페이지네이션 수집 ---- */
  function collectAllVideoIds(uploadsPlaylistId, cap, onProgress) {
    var ids = [];
    function page(pageToken) {
      var params = { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: 50 };
      if (pageToken) params.pageToken = pageToken;
      return apiFetch("playlistItems", params).then(function (d) {
        var pageIds = (d.items || []).map(function (it) {
          return it.contentDetails && it.contentDetails.videoId;
        }).filter(Boolean);
        ids = ids.concat(pageIds);
        if (onProgress) onProgress({ phase: "list", collected: ids.length });

        if (ids.length >= cap) return { truncated: !!d.nextPageToken };
        if (d.nextPageToken) return page(d.nextPageToken);
        return { truncated: false };
      });
    }
    return page().then(function (info) {
      var truncated = info.truncated;
      if (ids.length > cap) { ids = ids.slice(0, cap); truncated = true; }
      return { ids: ids, truncated: truncated };
    });
  }

  /* ---- videos.list 는 한 번에 최대 50개 ID 만 허용 → 배치 호출 ---- */
  function fetchVideoDetailsBatched(ids, onProgress) {
    var chunks = [];
    for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    var out = [];
    function next(i) {
      if (i >= chunks.length) return Promise.resolve(out);
      return apiFetch("videos", { part: "snippet,statistics,contentDetails", id: chunks[i].join(",") })
        .then(function (v) {
          out = out.concat((v.items || []).map(mapVideoItem));
          if (onProgress) onProgress({ phase: "detail", collected: out.length, total: ids.length });
          return next(i + 1);
        });
    }
    return next(0);
  }

  /* ---- 채널의 (사실상) 전체 영상 + 통계 수집.
   *      opts.cap: 안전 상한 (기본 config.MAX_VIDEOS_FETCH)
   *      opts.onProgress({phase, collected, total}) : 로딩 화면 진행 표시용
   *      반환: { videos, fetchedCount, truncated, uploadsTotal } */
  function fetchAllVideos(channel, opts) {
    opts = opts || {};
    var cap = opts.cap || cfg.MAX_VIDEOS_FETCH || 500;
    var onProgress = opts.onProgress;

    var uploads;
    try { uploads = channel.contentDetails.relatedPlaylists.uploads; } catch (e) {}
    if (!uploads) return Promise.resolve({ videos: [], fetchedCount: 0, truncated: false });

    return collectAllVideoIds(uploads, cap, onProgress).then(function (idInfo) {
      if (!idInfo.ids.length) return { videos: [], fetchedCount: 0, truncated: idInfo.truncated };
      return fetchVideoDetailsBatched(idInfo.ids, onProgress).then(function (videos) {
        return { videos: videos, fetchedCount: videos.length, truncated: idInfo.truncated };
      });
    });
  }

  return {
    parseInput: parseInput,
    resolveChannel: resolveChannel,
    fetchAllVideos: fetchAllVideos
  };
})();
