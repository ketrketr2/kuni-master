/* KuniMaster — store: localStorage persistence + gamification */
window.KM = window.KM || {};
(function (KM) {
  const KEY = 'kunimaster.v1';
  const TITLES = [[1, '街クラブ'], [3, 'ユース'], [5, 'J3'], [8, 'J2'], [11, 'J1'], [15, 'ACL常連'], [20, 'CL出場'], [25, 'CL王者'], [30, 'バロンドール級'], [40, '殿堂入り']];
  const ACH = [
    { id: 'first_q', icon: '👟', name: 'デビュー', desc: '初めての1問に正解', test: s => s.stats.ok >= 1 },
    { id: 'first_win', icon: '🏆', name: '初勝利', desc: '対戦で初めて勝つ', test: s => s.stats.wins >= 1 },
    { id: 'streak5', icon: '🔥', name: '5連続正解', desc: 'コンボ5を達成', test: s => s.stats.bestStreak >= 5 },
    { id: 'streak10', icon: '🌋', name: '10連続正解', desc: 'コンボ10を達成', test: s => s.stats.bestStreak >= 10 },
    { id: 'fast', icon: '⚡', name: '電光石火', desc: '0.8秒以内に正解', test: s => s.stats.bestMs != null && s.stats.bestMs <= 800 },
    { id: 'flag20', icon: '🏁', name: '国旗ハンター', desc: '国旗問題に20回正解', test: s => (s.stats.byType.flag || {}).ok >= 20 },
    { id: 'player20', icon: '🔭', name: 'スカウト', desc: '選手問題に20回正解', test: s => (s.stats.byType.player || {}).ok >= 20 },
    { id: 'club20', icon: '🏟️', name: 'クラブ通', desc: 'クラブ問題に20回正解', test: s => (s.stats.byType.club || {}).ok >= 20 },
    { id: 'capital20', icon: '🗺️', name: '首都マスター', desc: '首都問題に20回正解', test: s => (s.stats.byType.capital || {}).ok >= 20 },
    { id: 'codex20', icon: '📒', name: 'コレクター', desc: '図鑑を20カ国解放', test: s => Object.keys(s.mastery).filter(k => s.mastery[k].ok > 0).length >= 20 },
    { id: 'codex50', icon: '📚', name: 'マニア', desc: '図鑑を50カ国解放', test: s => Object.keys(s.mastery).filter(k => s.mastery[k].ok > 0).length >= 50 },
    { id: 'codex_all', icon: '🌍', name: 'コンプリート', desc: '全カ国を図鑑に登録', test: s => KM.Quiz && Object.keys(s.mastery).filter(k => s.mastery[k].ok > 0).length >= KM.Quiz.all.length },
    { id: 'nohint5', icon: '🧠', name: 'ノーヒント', desc: '出題バトルでヒントなし正解を5回', test: s => s.stats.noHintOk >= 5 },
    { id: 'stock10', icon: '✅', name: 'ストック完済', desc: '苦手を10カ国克服', test: s => s.stats.stockCleared >= 10 },
    { id: 'daily3', icon: '📅', name: '3日連続', desc: '3日連続でプレー', test: s => s.stats.daily.streak >= 3 },
    { id: 'daily7', icon: '🗓️', name: '1週間皆勤', desc: '7日連続でプレー', test: s => s.stats.daily.streak >= 7 },
    { id: 'match10', icon: '🎫', name: '常連', desc: '10試合プレー', test: s => s.stats.matches >= 10 },
    { id: 'rival5', icon: '⚔️', name: 'ライバル撃破', desc: '同じ相手に5勝', test: s => Object.values(s.rivals).some(r => r.w >= 5) },
    { id: 'europe', icon: '🇪🇺', name: '欧州制覇', desc: '欧州の全カ国に正解', test: s => regionDone(s, '欧州') },
    { id: 'samerica', icon: '🌎', name: '南米制覇', desc: '南米の全カ国に正解', test: s => regionDone(s, '南米') },
    { id: 'africa', icon: '🌍', name: 'アフリカ制覇', desc: 'アフリカの全カ国に正解', test: s => regionDone(s, 'アフリカ') },
    { id: 'asia', icon: '🌏', name: 'アジア制覇', desc: 'アジアの全カ国に正解', test: s => regionDone(s, 'アジア') },
    { id: 'level10', icon: '🥇', name: 'J1昇格', desc: 'レベル11に到達', test: s => Store.levelInfo(s.stats.xp).level >= 11 },
  ];
  function regionDone(s, r) { if (!KM.Quiz) return false; return KM.Quiz.all.filter(c => c.r === r).every(c => (s.mastery[c.id] || {}).ok > 0); }

  const Store = {
    ACH, TITLES, state: null,
    defaults() {
      return {
        v: 1,
        profile: { id: KM.u.uid(), name: '', avatar: '⚽', sound: true, haptic: true, created: Date.now() },
        stats: { xp: 0, q: 0, ok: 0, streak: 0, bestStreak: 0, bestMs: null, wins: 0, losses: 0, draws: 0, matches: 0, speedWins: 0, turnWins: 0, hints: 0, noHintOk: 0, stockCleared: 0, byType: {}, byRegion: {}, daily: { streak: 0, last: null, days: 0 } },
        history: [], stock: {}, mastery: {}, ach: {}, rivals: {}
      };
    },
    load() {
      try { const raw = localStorage.getItem(KEY); this.state = raw ? Object.assign(this.defaults(), JSON.parse(raw)) : this.defaults(); }
      catch (e) { this.state = this.defaults(); }
      // deep defaults for new fields
      const d = this.defaults(); for (const k in d.stats) if (this.state.stats[k] === undefined) this.state.stats[k] = d.stats[k];
      for (const k in d.profile) if (this.state.profile[k] === undefined) this.state.profile[k] = d.profile[k];
      KM.u.Sfx.enabled = !!this.state.profile.sound; KM.u.Haptic.enabled = !!this.state.profile.haptic;
      return this.state;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { } },
    reset() { this.state = this.defaults(); this.save(); },
    exportJSON() { return JSON.stringify(this.state); },
    importJSON(str) { const o = JSON.parse(str); if (!o || !o.profile || !o.stats) throw new Error('bad'); this.state = Object.assign(this.defaults(), o); this.save(); },

    // ---- levels ----
    xpNeeded(level) { return Math.round(100 * Math.pow(level - 1, 1.5)); }, // cumulative XP to reach level
    levelInfo(xp) {
      let level = 1; while (this.xpNeeded(level + 1) <= xp) level++;
      const cur = this.xpNeeded(level), next = this.xpNeeded(level + 1);
      let title = TITLES[0][1]; for (const [l, t] of TITLES) if (level >= l) title = t;
      return { level, title, cur, next, pct: Math.min(1, (xp - cur) / Math.max(1, next - cur)), toNext: next - xp };
    },
    addXp(n) {
      const s = this.state.stats; const before = this.levelInfo(s.xp); s.xp += Math.max(0, Math.round(n)); const after = this.levelInfo(s.xp); this.save();
      return { gained: Math.round(n), from: before, to: after, leveled: after.level > before.level };
    },

    // ---- answers ----
    // e: {mode, type, cid, ok, ms, pts, hints, rival, prompt, answerCid}
    recordAnswer(e) {
      const s = this.state, st = s.stats; const c = KM.Quiz.byId[e.cid];
      st.q++; if (e.ok) { st.ok++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); if (e.ms != null && e.ms > 0 && (st.bestMs == null || e.ms < st.bestMs) && e.mode !== 'turn') st.bestMs = e.ms; }
      else st.streak = 0;
      st.hints += (e.hints || 0);
      if (e.mode === 'turn' && e.ok && !(e.hints > 0)) st.noHintOk++;
      const bt = st.byType[e.type] = st.byType[e.type] || { q: 0, ok: 0 }; bt.q++; if (e.ok) bt.ok++;
      if (c) { const br = st.byRegion[c.r] = st.byRegion[c.r] || { q: 0, ok: 0 }; br.q++; if (e.ok) br.ok++; }
      // mastery (図鑑)
      const m = s.mastery[e.cid] = s.mastery[e.cid] || { seen: 0, ok: 0, ng: 0, first: null };
      m.seen++; if (e.ok) { m.ok++; if (!m.first) m.first = Date.now(); } else m.ng++;
      // stock (苦手ストック) — Leitner-ish: wrong adds, correct twice in a row clears
      if (!e.ok) { const k = s.stock[e.cid] = s.stock[e.cid] || { n: 0, last: 0, wins: 0, since: Date.now() }; k.n++; k.last = Date.now(); k.wins = 0; }
      else if (s.stock[e.cid]) { s.stock[e.cid].wins++; if (s.stock[e.cid].wins >= 2) { delete s.stock[e.cid]; st.stockCleared++; } }
      // history
      s.history.unshift({ t: Date.now(), mode: e.mode, type: e.type, cid: e.cid, ok: !!e.ok, ms: e.ms == null ? null : Math.round(e.ms), pts: e.pts || 0, hints: e.hints || 0, rival: e.rival || null, ans: e.answerCid || null, prompt: e.prompt || '' });
      if (s.history.length > 600) s.history.length = 600;
      this.save();
    },
    recordMatch(m) { // {mode, rival, result, my, their}
      const st = this.state.stats; st.matches++;
      if (m.result === 'win') { st.wins++; if (m.mode === 'speed') st.speedWins++; else st.turnWins++; }
      else if (m.result === 'loss') st.losses++; else st.draws++;
      if (m.rival) { const r = this.state.rivals[m.rival] = this.state.rivals[m.rival] || { w: 0, l: 0, d: 0, last: 0, games: [] }; r[m.result === 'win' ? 'w' : m.result === 'loss' ? 'l' : 'd']++; r.last = Date.now(); r.games.unshift({ t: Date.now(), mode: m.mode, my: m.my, their: m.their, result: m.result }); if (r.games.length > 30) r.games.length = 30; }
      this.save();
    },
    dailyCheck() {
      const d = this.state.stats.daily, today = KM.u.dayKey(); if (d.last === today) return { streak: d.streak, isNew: false };
      const y = KM.u.dayKey(Date.now() - 86400000); d.streak = (d.last === y) ? d.streak + 1 : 1; d.last = today; d.days = (d.days || 0) + 1; this.save();
      return { streak: d.streak, isNew: true };
    },
    checkAchievements() {
      const got = []; for (const a of ACH) { if (this.state.ach[a.id]) continue; let ok = false; try { ok = a.test(this.state); } catch (e) { } if (ok) { this.state.ach[a.id] = Date.now(); got.push(a); } }
      if (got.length) this.save(); return got;
    },
    stockList() { return Object.entries(this.state.stock).sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last).map(([cid, v]) => ({ cid, ...v })); },
    unlockedCount() { return Object.keys(this.state.mastery).filter(k => this.state.mastery[k].ok > 0).length; },
    stars(cid) { const m = this.state.mastery[cid]; if (!m || !m.ok) return 0; if (m.ok >= 6 && m.ok >= m.ng * 3) return 3; if (m.ok >= 3) return 2; return 1; }
  };
  KM.Store = Store;
})(window.KM);
