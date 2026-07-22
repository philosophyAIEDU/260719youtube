/* =====================================================================
 * history.js — 채널별 분석 이력 + 상담(채팅) 기록 + 내 채널 지정 + 비교 결과 저장.
 *
 * 이 앱의 핵심 관점 전환: "매번 새로 분석"이 아니라, 한 채널을 지속적으로
 * 상담하며 함께 발전시켜가는 AI 유튜브 컨설턴트가 되도록 합니다.
 *   · 분석할 때마다 그 결과가 채널별 기록에 쌓입니다(덮어쓰지 않음).
 *   · 다음 분석 때는 이전 기록을 프롬프트에 함께 넣어 "지난 상담 대비
 *     무엇이 나아졌는지/그대로인지"를 언급하게 합니다.
 *   · 채팅(후속 질문) 내용도 채널별로 저장되어, 나중에 다시 방문해도
 *     대화가 이어집니다.
 *   · 여러 채널 중 하나를 '내 채널'로 지정해두면, 참고 채널과의 비교
 *     분석에서 항상 '나'로 취급됩니다.
 *
 * 전부 이 브라우저의 localStorage 에만 저장됩니다(서버 없음, 외부 전송 없음).
 * ===================================================================== */
window.PhilApp = window.PhilApp || {};

PhilApp.history = (function () {
  var cfg = PhilApp.config;

  // Date.now() 만으로는 같은 밀리초 안에 연속 호출(예: 계획 두 개를 빠르게 추가)될 때 id 가
  // 충돌할 수 있어, 호출마다 증가하는 카운터를 섞어 고유성을 보장합니다.
  var _idSeq = 0;
  function uniqueId() {
    _idSeq = (_idSeq + 1) % 1000;
    return Date.now() * 1000 + _idSeq;
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  // localStorage 용량 초과 시 채널 인덱스에서 가장 오래된 채널의 기록부터 줄여서 재시도
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // 용량 초과로 추정 — 가장 오래된 채널 기록 하나를 비우고 1회 재시도
      var idx = readJSON(cfg.LS_CHANNEL_INDEX, []);
      if (idx.length) {
        idx.sort(function (a, b) { return new Date(a.lastAnalyzedAt) - new Date(b.lastAnalyzedAt); });
        var oldest = idx[0];
        try {
          localStorage.removeItem(cfg.LS_HISTORY_PREFIX + oldest.id);
          localStorage.removeItem(cfg.LS_CHATLOG_PREFIX + oldest.id);
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (e2) { return false; }
      }
      return false;
    }
  }

  /* ---------- 채널 인덱스 (요약 목록) ---------- */
  function listChannels() {
    var idx = readJSON(cfg.LS_CHANNEL_INDEX, []);
    var myId = getMyChannelId();
    return idx.slice()
      .map(function (x) { return Object.assign({}, x, { isMine: x.id === myId }); })
      .sort(function (a, b) { return new Date(b.lastAnalyzedAt) - new Date(a.lastAnalyzedAt); });
  }

  function upsertIndex(entry) {
    var idx = readJSON(cfg.LS_CHANNEL_INDEX, []);
    var i = idx.findIndex(function (x) { return x.id === entry.id; });
    if (i >= 0) idx[i] = Object.assign({}, idx[i], entry);
    else idx.push(entry);
    writeJSON(cfg.LS_CHANNEL_INDEX, idx);
  }

  function removeFromIndex(channelId) {
    var idx = readJSON(cfg.LS_CHANNEL_INDEX, []).filter(function (x) { return x.id !== channelId; });
    writeJSON(cfg.LS_CHANNEL_INDEX, idx);
  }

  /* ---------- 채널별 분석 기록 ---------- */
  function historyKey(channelId) { return cfg.LS_HISTORY_PREFIX + channelId; }

  function getHistory(channelId) {
    return readJSON(historyKey(channelId), []);   // 최신순
  }
  function getLatest(channelId) {
    var h = getHistory(channelId);
    return h.length ? h[0] : null;
  }
  function getCount(channelId) {
    return getHistory(channelId).length;
  }

  // 새 분석 결과를 채널 기록에 추가(맨 앞) — 채널당 최대 개수 유지
  function saveAnalysis(channel, sig, result, model) {
    var channelId = channel.id;
    var sn = channel.snippet || {}, st = channel.statistics || {};
    var bs = (channel.brandingSettings && channel.brandingSettings.channel) || {};
    var record = {
      id: uniqueId(),
      at: new Date().toISOString(),
      model: model || null,
      result: result,
      signals: {
        fetchedCount: sig.fetchedCount, truncated: sig.truncated,
        avgViews: sig.avgViews, medianViews: sig.medianViews,
        avgUploadGapDays: sig.avgUploadGapDays, transcriptCount: sig.transcriptCount,
        dateRange: sig.dateRange,
        subscriberCount: st.hiddenSubscriberCount ? null : Number(st.subscriberCount || 0),
        channelVideoCount: Number(st.videoCount || 0)
      },
      // 채널 원본 스냅샷 — 참고 채널 비교 등에서 실시간 재조회 없이도 쓸 수 있도록 가볍게 보관
      channelSnapshot: {
        title: sn.title || "", description: sn.description || "", publishedAt: sn.publishedAt || null,
        keywords: bs.keywords || "",
        subscriberCount: st.hiddenSubscriberCount ? null : Number(st.subscriberCount || 0),
        videoCount: Number(st.videoCount || 0), viewCount: Number(st.viewCount || 0)
      }
    };

    var list = getHistory(channelId);
    list.unshift(record);
    if (list.length > (cfg.MAX_HISTORY_PER_CHANNEL || 20)) list = list.slice(0, cfg.MAX_HISTORY_PER_CHANNEL || 20);
    writeJSON(historyKey(channelId), list);

    var thumb = ""; try { thumb = sn.thumbnails.default.url; } catch (e) {}
    upsertIndex({
      id: channelId,
      title: sn.title || "채널",
      thumbnail: thumb,
      lastAnalyzedAt: record.at,
      lastScore: result && result.scorecard ? result.scorecard.overall : null,
      lastGrade: result && result.scorecard ? result.scorecard.grade : null,
      analysisCount: list.length
    });

    return record;
  }

  function deleteChannel(channelId) {
    localStorage.removeItem(historyKey(channelId));
    localStorage.removeItem(cfg.LS_CHATLOG_PREFIX + channelId);
    localStorage.removeItem(cfg.LS_COMPARISON_PREFIX + channelId);
    localStorage.removeItem(cfg.LS_PLANS_PREFIX + channelId);
    removeFromIndex(channelId);
    if (getMyChannelId() === channelId) setMyChannel(null);
  }

  /* ---------- 채널별 상담(채팅) 기록 ---------- */
  function chatKey(channelId) { return cfg.LS_CHATLOG_PREFIX + channelId; }
  function getChatLog(channelId) { return readJSON(chatKey(channelId), []); }
  function saveChatLog(channelId, messages) { writeJSON(chatKey(channelId), messages); }

  /* ---------- '내 채널' 지정 ---------- */
  function getMyChannelId() {
    return (localStorage.getItem(cfg.LS_MY_CHANNEL_ID) || "").trim() || null;
  }
  function setMyChannel(channelId) {
    if (channelId) localStorage.setItem(cfg.LS_MY_CHANNEL_ID, channelId);
    else localStorage.removeItem(cfg.LS_MY_CHANNEL_ID);
  }
  function isMyChannel(channelId) {
    return !!channelId && getMyChannelId() === channelId;
  }

  /* ---------- 참고 채널 비교 결과 저장 (내 채널 ID 기준) ---------- */
  function comparisonKey(myChannelId) { return cfg.LS_COMPARISON_PREFIX + myChannelId; }
  function getComparison(myChannelId) { return readJSON(comparisonKey(myChannelId), null); }
  function saveComparison(myChannelId, comparisonRecord) { writeJSON(comparisonKey(myChannelId), comparisonRecord); }

  /* ---------- 📝 다음 영상 계획 · 향후 계획 (사용자가 직접 기록) ---------- */
  function plansKey(channelId) { return cfg.LS_PLANS_PREFIX + channelId; }
  function getPlans(channelId) { return readJSON(plansKey(channelId), []); }   // 최신순

  // dueDate: "YYYY-MM-DD" 형식(달력에서 쓰는 일정) 또는 null(날짜 없는 계획)
  function addPlan(channelId, text, dueDate) {
    var t = (text || "").trim();
    if (!t) return null;
    var entry = {
      id: uniqueId(), text: t, createdAt: new Date().toISOString(), done: false, doneAt: null,
      dueDate: (dueDate || "").trim() || null
    };
    var list = getPlans(channelId);
    list.unshift(entry);
    var max = cfg.MAX_PLANS_PER_CHANNEL || 50;
    if (list.length > max) list = list.slice(0, max);
    writeJSON(plansKey(channelId), list);
    return entry;
  }

  function togglePlan(channelId, planId) {
    var list = getPlans(channelId);
    var p = list.find(function (x) { return x.id === planId; });
    if (!p) return null;
    p.done = !p.done;
    p.doneAt = p.done ? new Date().toISOString() : null;
    writeJSON(plansKey(channelId), list);
    return p;
  }

  // 계획의 일정(달력 날짜)을 새로 지정하거나 비움(dueDate 가 빈 값이면 날짜 없음으로 전환)
  function setPlanDueDate(channelId, planId, dueDate) {
    var list = getPlans(channelId);
    var p = list.find(function (x) { return x.id === planId; });
    if (!p) return null;
    p.dueDate = (dueDate || "").trim() || null;
    writeJSON(plansKey(channelId), list);
    return p;
  }

  function deletePlan(channelId, planId) {
    var list = getPlans(channelId).filter(function (x) { return x.id !== planId; });
    writeJSON(plansKey(channelId), list);
  }

  return {
    listChannels: listChannels,
    getHistory: getHistory, getLatest: getLatest, getCount: getCount,
    saveAnalysis: saveAnalysis, deleteChannel: deleteChannel,
    getChatLog: getChatLog, saveChatLog: saveChatLog,
    getMyChannelId: getMyChannelId, setMyChannel: setMyChannel, isMyChannel: isMyChannel,
    getComparison: getComparison, saveComparison: saveComparison,
    getPlans: getPlans, addPlan: addPlan, togglePlan: togglePlan, deletePlan: deletePlan,
    setPlanDueDate: setPlanDueDate
  };
})();
