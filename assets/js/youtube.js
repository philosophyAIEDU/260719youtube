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
      return "YouTube API 호출 한도를 초과했습니다. 잠시 후 다시 시도하거나 내일 다시 시도해 주세요.";
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
    params = Object.assign({}, params, { key: storage.getYT() });
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

  /* ---- 업로드 재생목록에서 최근 영상 + 통계 ---- */
  function fetchRecentVideos(channel, maxCount) {
    var uploads;
    try { uploads = channel.contentDetails.relatedPlaylists.uploads; } catch (e) {}
    if (!uploads) return Promise.resolve([]);

    return apiFetch("playlistItems", {
      part: "contentDetails",
      playlistId: uploads,
      maxResults: maxCount
    }).then(function (d) {
      var ids = (d.items || []).map(function (it) {
        return it.contentDetails && it.contentDetails.videoId;
      }).filter(Boolean);
      if (!ids.length) return [];

      return apiFetch("videos", {
        part: "snippet,statistics,contentDetails",
        id: ids.join(",")
      }).then(function (v) {
        return (v.items || []).map(function (it) {
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
        });
      });
    });
  }

  return {
    parseInput: parseInput,
    resolveChannel: resolveChannel,
    fetchRecentVideos: fetchRecentVideos
  };
})();
