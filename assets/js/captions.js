/* =====================================================================
 * captions.js — 본인 채널 자막(스크립트) 수집.
 *
 *   YouTube 공식 captions API 는 '로그인한 계정이 소유한 채널'의 자막만
 *   내려줍니다(타인 채널은 403). 그래서 이 모듈은 항상:
 *     1) 로그인한 계정의 채널 ID를 확인하고
 *     2) 지금 분석 중인 채널과 일치하는지 검사한 뒤에만
 *     3) 대표 샘플 영상 몇 개의 자막을 받아옵니다.
 *
 *   captions.list = 50 단위, captions.download = 200 단위로 비용이 커서
 *   config.TRANSCRIPT_MAX_VIDEOS 로 개수를 강하게 제한합니다.
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.captions = (function () {
  var cfg = PhilApp.config;
  var A = PhilApp.analysis;

  function authFetch(url, accessToken) {
    return fetch(url, { headers: { "Authorization": "Bearer " + accessToken } });
  }

  function humanAuthError(status, data) {
    var msg = ""; try { msg = data.error.message || ""; } catch (e) {}
    if (status === 401) return "Google 로그인이 만료되었습니다. 다시 로그인해 주세요.";
    if (status === 403) return "이 작업에 필요한 권한이 없습니다. (본인이 소유한 채널의 자막만 가져올 수 있습니다)";
    return "Google API 오류가 발생했습니다." + (msg ? " (" + msg + ")" : "");
  }

  // 로그인한 계정 소유 채널 확인 (분석 대상 채널과 같은지 대조하는 데 사용)
  function getMyChannel(accessToken) {
    var url = cfg.YT_API_BASE + "channels?part=id,snippet&mine=true";
    return authFetch(url, accessToken).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(humanAuthError(r.status, data));
        var item = data.items && data.items[0];
        if (!item) throw new Error("로그인한 계정에 연결된 채널을 찾을 수 없습니다.");
        return { id: item.id, title: item.snippet && item.snippet.title };
      });
    });
  }

  function listCaptionTracks(videoId, accessToken) {
    var url = cfg.YT_API_BASE + "captions?part=snippet&videoId=" + encodeURIComponent(videoId);
    return authFetch(url, accessToken).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(humanAuthError(r.status, data));
        return data.items || [];
      });
    });
  }

  // 수동 업로드 자막을 자동생성(ASR) 자막보다 우선
  function pickBestTrack(tracks) {
    if (!tracks.length) return null;
    var manual = tracks.filter(function (t) { return t.snippet && t.snippet.trackKind !== "ASR"; });
    return manual[0] || tracks[0];
  }

  function downloadCaption(captionId, accessToken) {
    var url = cfg.YT_API_BASE + "captions/" + encodeURIComponent(captionId) +
      "?tfmt=" + (cfg.TRANSCRIPT_FORMAT || "srt");
    return authFetch(url, accessToken).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(humanAuthError(r.status, data));
        });
      }
      return r.text();
    });
  }

  // SRT/VTT 원문 → 순수 발화 텍스트 (인덱스/타임코드/스타일 태그 제거)
  function toPlainText(raw) {
    if (!raw) return "";
    return raw
      .replace(/\r/g, "")
      .split("\n")
      .filter(function (line) {
        var t = line.trim();
        if (/^\d+$/.test(t)) return false;
        if (/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(t)) return false;
        if (/^WEBVTT/i.test(t)) return false;
        return true;
      })
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // videos 중 대표 샘플의 자막을 가져와 해당 video 객체에 transcriptExcerpt 를 붙임 (in-place)
  // 반환: { attempted, succeeded }
  function attachTranscripts(videos, accessToken, opts) {
    opts = opts || {};
    var maxCount = opts.maxCount || cfg.TRANSCRIPT_MAX_VIDEOS || 5;
    var excerptChars = cfg.TRANSCRIPT_EXCERPT_CHARS || 1200;
    var onProgress = opts.onProgress || function () {};

    var targets = A.selectSample(videos, maxCount);
    var byId = {};
    videos.forEach(function (v) { byId[v.id] = v; });

    var attempted = 0, succeeded = 0;

    function next(i) {
      if (i >= targets.length) return Promise.resolve({ attempted: attempted, succeeded: succeeded });
      var v = targets[i];
      attempted++;
      onProgress({ index: i + 1, total: targets.length, title: v.title });

      return listCaptionTracks(v.id, accessToken)
        .then(function (tracks) {
          var track = pickBestTrack(tracks);
          if (!track) return null;
          return downloadCaption(track.id, accessToken);
        })
        .then(function (raw) {
          if (raw) {
            var text = toPlainText(raw).slice(0, excerptChars);
            if (text && byId[v.id]) {
              byId[v.id].transcriptExcerpt = text;
              succeeded++;
            }
          }
        })
        .catch(function () { /* 이 영상은 자막 없음/실패 — 조용히 건너뜀 */ })
        .then(function () { return next(i + 1); });
    }
    return next(0);
  }

  return {
    getMyChannel: getMyChannel,
    attachTranscripts: attachTranscripts,
    toPlainText: toPlainText
  };
})();
