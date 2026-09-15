/* KuniMaster — app: controller (navigation, sessions, net protocol, progression) */
window.KM = window.KM || {};
(function (KM) {
  const { Store, Quiz, Net, UI, GameUI, u } = KM;
  const { toast, Sfx, Haptic, Fx } = u;

  const App = {
    tab: 'home', game: null, lobby: null, vsMode: 'speed', pendingRoom: null,
    // ------------------------------------------------------------------ boot
    init() {
      Quiz.init(); Store.load();
      UI.mount(document.getElementById('screen'));
      document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true, capture: true });
      const room = new URLSearchParams(location.search).get('room');
      if (room) { this.pendingRoom = room.toUpperCase(); history.replaceState(null, '', location.pathname + (Net.impl === 'bc' ? '?net=bc' : '')); }
      const daily = Store.dailyCheck();
      if (!Store.state.profile.name) { this.nav('home'); UI.onboard(name => { this.saveProfile({ name }); this.afterBoot(daily); }); }
      else this.afterBoot(daily);
      Net.on({ open: () => this.onNetOpen(), close: () => this.onNetClose(), error: e => this.onNetError(e), msg: d => this.onNetMsg(d), latency: () => this.lobby && this.renderLobby() });
      if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/localhost|127\.0\.0\.1/)) { navigator.serviceWorker.register('./sw.js').catch(() => { }); }
    },
    afterBoot(daily) {
      if (this.pendingRoom) { const code = this.pendingRoom; this.pendingRoom = null; this.vsMode = 'speed'; this.nav('vs'); this.joinRoom(code); return; }
      this.nav('home');
      if (daily.isNew && daily.streak >= 2) setTimeout(() => toast(`${daily.streak}日連続プレー 🔥`), 600);
    },
    saveProfile(p) { Object.assign(Store.state.profile, p); Store.save(); Sfx.enabled = !!Store.state.profile.sound; Haptic.enabled = !!Store.state.profile.haptic; },
    me() { const p = Store.state.profile; return { name: p.name || 'あなた', avatar: p.avatar || '⚽' }; },

    // ------------------------------------------------------------------ navigation
    nav(tab) {
      if (this.game) { this.exitGame(true); }
      this.tab = tab; UI.tabbar(tab, t => this.nav(t));
      if (tab === 'home') UI.home();
      else if (tab === 'vs') { if (this.lobby) this.renderLobby(); else UI.vs(this.vsMode); }
      else if (tab === 'codex') UI.codex();
      else if (tab === 'record') UI.record();
    },
    openCountry(cid) { UI.country(cid); },
    openSettings() { UI.settings(); },

    // ------------------------------------------------------------------ local sessions
    startSolo(o) {
      o = o || {}; this._soloOpts = o; const qs = Quiz.build({ count: o.count || 10, diff: o.diff || 'normal', types: o.types, avoid: Store.state.history.slice(0, 15).map(x => x.cid) });
      this.startLocalSpeed('solo', qs);
    },
    startReview() {
      const pool = Store.stockList().map(x => x.cid); if (!pool.length) { toast('ストックは空です。間違えた国がここに溜まります'); return; }
      const qs = Quiz.build({ count: Math.min(10, Math.max(5, pool.length * 2)), pool, diff: 'normal' });
      this.startLocalSpeed('review', qs);
    },
    startLocalSpeed(mode, qs) {
      const me = this.me(); const eng = new KM.SpeedEngine({ players: [{ id: 'me', ...me }], questions: qs, mode });
      this.game = { kind: 'local', mode, role: 'host', engine: eng, myId: 'me', rivalName: null, recorded: {}, qShownAt: 0, offset: 0, ended: false, diffUsed: (this._soloOpts || {}).diff, countUsed: (this._soloOpts || {}).count };
      eng.onChange(e => this.onView(e.view('me'))); UI.tabbar(null); eng.start();
    },
    startHotseat(o) {
      o = o || {}; const p1 = { id: 'p1', name: o.p1 || 'プレイヤー1', avatar: o.a1 || '🔵' }, p2 = { id: 'p2', name: o.p2 || 'プレイヤー2', avatar: o.a2 || '🔴' };
      const eng = new KM.TurnEngine({ players: [p1, p2], rounds: o.rounds || 6, diff: o.diff || 'normal', limit: o.limit || 90000, seed: (Math.random() * 1e9) | 0, weak: { p1: Store.stockList().map(x => x.cid).slice(0, 12) } });
      this.game = { kind: 'hotseat', mode: 'turn', role: 'host', engine: eng, myId: 'p1', rivalName: p2.name, recorded: {}, hot: { ack: null }, offset: 0, ended: false, names: { p1: p1.name, p2: p2.name } };
      eng.onChange(e => this.onHotseatView(e)); UI.tabbar(null); eng.start();
    },
    onHotseatView(e) {
      const g = this.game; if (!g) return;
      // decide which player's perspective to show; require handoff acknowledgement when the active player changes
      let active = null; if (e.phase === 'pick') active = e.asker.id; else if (e.phase === 'answer') active = e.answerer.id;
      if (active && g.hot.ack !== active + ':' + e.i + ':' + e.phase) {
        const p = e.p(active); GameUI.handoff(p, e.phase, () => { g.hot.ack = active + ':' + e.i + ':' + e.phase; this.onView(e.view(active), active); });
        return;
      }
      this.onView(e.view(active || e.players[0].id), active || e.players[0].id);
    },

    // ------------------------------------------------------------------ VS / rooms
    vsChoose(mode) { this.vsMode = mode; UI.vs(mode); },
    async hostRoom() {
      if (!Net.available()) { toast('通信ライブラリを読み込めません。接続を確認して再読み込みしてください', 3500); return; }
      this.lobby = { role: 'host', code: null, status: 'creating', settings: this.defaultSettings(), guest: null, guestReady: false, weak: {} }; this.renderLobby();
      try { const code = await Net.host(); this.lobby.code = code; this.lobby.status = 'waiting'; this.renderLobby(); }
      catch (e) { console.error(e); this.lobby = null; UI.vs(this.vsMode); toast('部屋を作れませんでした。通信環境を確認してもう一度', 3500); }
    },
    async joinRoom(code) {
      if (!Net.available()) { toast('通信ライブラリを読み込めません。接続を確認して再読み込みしてください', 3500); return; }
      this.lobby = { role: 'guest', code: String(code || '').toUpperCase(), status: 'joining', settings: this.defaultSettings(), host: null, ready: false }; this.renderLobby();
      try { await Net.join(code); this.lobby.status = 'connected'; this.renderLobby(); }
      catch (e) { console.error(e); const msg = String((e && e.type) || (e && e.message) || ''); this.lobby = null; UI.vs(this.vsMode); toast(msg.includes('code') ? '合言葉は6文字です' : msg.includes('peer-unavailable') ? 'その部屋が見つかりません。合言葉を確認してください' : '接続できませんでした。相手の部屋が開いているか確認して、もう一度', 3800); }
    },
    leaveRoom() { Net.close(); this.lobby = null; if (this.game) this.exitGame(true); UI.vs(this.vsMode); },
    defaultSettings() { return { mode: this.vsMode, count: 10, diff: 'normal', types: ['flag', 'capital', 'player', 'club', 'rank', 'nick', 'legend', 'fact'], rounds: 6, limit: 90 }; },
    setSetting(k, v) {
      const L = this.lobby; if (!L || L.role !== 'host') return;
      if (k === 'type') { const t = L.settings.types; const i = t.indexOf(v); if (i >= 0) { if (t.length > 1) t.splice(i, 1); } else t.push(v); }
      else L.settings[k] = v;
      if (k === 'mode') this.vsMode = v;
      this.sendLobby(); this.renderLobby();
    },
    sendLobby() { const L = this.lobby; if (!L || L.role !== 'host') return; Net.send({ t: 'lobby', settings: L.settings, host: this.me(), guestReady: L.guestReady }); },
    toggleReady() { const L = this.lobby; if (!L || L.role !== 'guest') return; L.ready = !L.ready; Net.send({ t: 'ready', v: L.ready }); this.renderLobby(); Haptic.tap(); },
    renderLobby() { if (this.lobby && !this.game) UI.lobby(this.lobby); },
    share() {
      const L = this.lobby; if (!L || !L.code) return; const url = Net.shareUrl(L.code); const text = `クニマスターで対戦しよう！合言葉：${L.code}\n${url}`;
      if (navigator.share) navigator.share({ title: 'クニマスター', text }).catch(() => { });
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('招待リンクをコピーしました')).catch(() => toast(url));
      else toast(url);
    },
    kickoff() {
      const L = this.lobby; if (!L || L.role !== 'host' || !Net.open || !L.guest) return;
      const s = L.settings; const me = this.me(); const players = [{ id: 'host', ...me }, { id: 'guest', name: L.guest.name, avatar: L.guest.avatar }];
      let eng;
      if (s.mode === 'speed') { const qs = Quiz.build({ count: s.count, diff: s.diff, types: s.types, seed: (Math.random() * 1e9) | 0 }); eng = new KM.SpeedEngine({ players, questions: qs, mode: 'speed' }); }
      else { eng = new KM.TurnEngine({ players, rounds: s.rounds, diff: s.diff, limit: s.limit * 1000, seed: (Math.random() * 1e9) | 0, weak: { guest: (L.weak.guest || []), host: Store.stockList().map(x => x.cid).slice(0, 12) } }); }
      // weak map is keyed by ANSWERER id -> cards drawn from that answerer's own mistake stock
      this.game = { kind: 'net', mode: s.mode, role: 'host', engine: eng, myId: 'host', rivalName: L.guest.name, recorded: {}, qShownAt: 0, offset: 0, ended: false, rematchAsked: false };
      eng.onChange(e => { Net.send({ t: 'st', v: e.view('guest') }); this.onView(e.view('host')); });
      UI.tabbar(null); Sfx.play('whistle'); eng.start();
    },
    onNetOpen() {
      const L = this.lobby; if (!L) return;
      if (L.role === 'guest') { L.status = 'connected'; Net.send({ t: 'hello', name: this.me().name, avatar: this.me().avatar, weak: Store.stockList().map(x => x.cid).slice(0, 12) }); }
      else { L.status = 'joined'; }
      this.renderLobby();
    },
    onNetClose() {
      if (this.game && this.game.kind === 'net' && !this.game.ended) { this.game.dropped = true; GameUI.dropped(() => { this.exitGame(false); this.lobby = null; this.nav('vs'); }); return; }
      if (this.lobby) { if (this.lobby.role === 'host') { this.lobby.guest = null; this.lobby.guestReady = false; this.lobby.status = 'waiting'; this.renderLobby(); toast('相手が退出しました'); } else { this.lobby = null; UI.vs(this.vsMode); toast('部屋との接続が切れました'); } }
    },
    onNetError(e) { console.warn('net error', e); if (this.lobby && this.lobby.status === 'joining') return; },
    onNetMsg(d) {
      const L = this.lobby; const g = this.game;
      switch (d.t) {
        case 'hello': if (L && L.role === 'host') { L.guest = { name: String(d.name || 'ゲスト').slice(0, 16), avatar: String(d.avatar || '🙂').slice(0, 4) }; L.weak.guest = Array.isArray(d.weak) ? d.weak.filter(x => Quiz.byId[x]).slice(0, 12) : []; L.guestReady = false; L.status = 'joined'; this.sendLobby(); this.renderLobby(); Sfx.play('pop'); } break;
        case 'lobby': if (L && L.role === 'guest') { L.settings = d.settings || L.settings; L.host = d.host || L.host; this.vsMode = L.settings.mode; if (!this.game) this.renderLobby(); } break;
        case 'ready': if (L && L.role === 'host') { L.guestReady = !!d.v; this.renderLobby(); if (d.v) Sfx.play('pop'); } break;
        case 'st': if (L && L.role === 'guest') { if (!g) { this.game = { kind: 'net', mode: d.v.mode, role: 'guest', engine: null, myId: 'guest', rivalName: (L.host || {}).name || '相手', recorded: {}, qShownAt: 0, offset: 0, ended: false }; UI.tabbar(null); } this.game.offset = (d.v.now || Date.now()) - Date.now(); this.onView(d.v); } break;
        case 'in': if (g && g.role === 'host' && g.engine) g.engine.input('guest', d.a || {}); break;
        case 'rematch': if (g && g.role === 'host') { g.rematchAsked = true; toast(`${g.rivalName}が再戦を希望しています`); GameUI.pulseRematch(); } else if (g && g.role === 'guest') { toast('相手が再戦を始めます'); } break;
        case 'bye': this.onNetClose(); break;
      }
    },

    // ------------------------------------------------------------------ game loop
    input(a) {
      const g = this.game; if (!g || g.ended) return;
      if (a.a === 'ans' && a.ms == null) a.ms = Math.max(50, Date.now() - g.qShownAt);
      if (g.engine) g.engine.input(g.activeId || g.myId, a); else Net.send({ t: 'in', a });
    },
    onView(v, activeId) {
      const g = this.game; if (!g) return; g.view = v; g.activeId = activeId || g.myId;
      const me = v.me;
      if (v.phase === 'q' && g.lastQ !== v.i) { g.lastQ = v.i; g.qShownAt = Date.now(); Sfx.play('go'); }
      if (v.phase === 'countdown' && g.lastCd !== v.i) { g.lastCd = v.i; }
      // record my result once per round
      if (v.phase === 'reveal' && v.result && !g.recorded[v.i]) {
        g.recorded[v.i] = true;
        if (v.mode === 'turn') {
          const r = v.result; if (g.kind !== 'hotseat' && r.answererId === g.myId) Store.recordAnswer({ mode: 'turn', type: 'hint', cid: r.cid, ok: r.ok, ms: r.ms, pts: r.pts, hints: r.hintsUsed, rival: g.rivalName, prompt: '出題バトル', answerCid: r.guesses[r.guesses.length - 1] || null });
          if (r.answererId === g.activeId || g.kind === 'hotseat') { if (r.ok) { Sfx.play('correct'); Haptic.ok(); Fx.confetti(90); } else { Sfx.play('wrong'); Haptic.ng(); } }
        } else {
          const r = v.result.per[me.id]; if (r && g.kind !== 'hotseat') Store.recordAnswer({ mode: v.mode, type: v.q.type, cid: v.result.cid, ok: r.ok, ms: r.ms, pts: r.pts, hints: r.hints.length, rival: g.rivalName, prompt: v.q.prompt, answerCid: r.c });
          if (r && r.ok) { Sfx.play('correct'); Haptic.ok(); if (r.order === 0) Fx.confetti(r.pts >= 150 ? 120 : 60); } else { Sfx.play('wrong'); Haptic.ng(); }
        }
      }
      if (v.phase === 'end' && !g.ended) { g.ended = true; this.finishGame(v); return; }
      if (v.mode === 'turn') GameUI.turn(v, g); else GameUI.speed(v, g);
    },
    finishGame(v) {
      const g = this.game; const s = v.summary; const me = s.players.find(p => p.id === g.myId) || s.players[0]; const rv = s.players.find(p => p.id !== me.id);
      let result = 'solo'; if (rv) result = s.winner === me.id ? 'win' : s.winner ? 'loss' : 'draw';
      let prog = null;
      if (g.kind !== 'hotseat') {
        if (rv) Store.recordMatch({ mode: g.mode, rival: g.rivalName, result, my: me.score, their: rv.score });
        const xp = Math.round(me.score / 2) + (result === 'win' ? 60 : result === 'draw' ? 25 : 0) + (g.mode === 'review' ? 20 : 0);
        prog = Store.addXp(xp); prog.ach = Store.checkAchievements();
      }
      if (result === 'win' || result === 'solo') { Sfx.play('win'); Haptic.win(); Fx.confetti(160); } else Sfx.play('lose');
      GameUI.result(v, g, result, prog);
      if (prog && prog.leveled) setTimeout(() => { if (this.game === g) { Sfx.play('level'); UI.levelUp(prog.to); } }, 900);
      if (prog && prog.ach && prog.ach.length) prog.ach.forEach((a, i) => setTimeout(() => UI.achToast(a), 1600 + i * 1400));
    },
    rematch() {
      const g = this.game; if (!g) return;
      if (g.kind === 'local') { const mode = g.mode; this.exitGame(true); if (mode === 'review') this.startReview(); else this.startSolo({ count: g.countUsed || g.view.total, diff: g.diffUsed }); return; }
      if (g.kind === 'hotseat') { const n = g.names; const rounds = g.view.total; this.exitGame(true); this.startHotseat({ p1: n.p1, p2: n.p2, rounds }); return; }
      if (g.role === 'guest') { Net.send({ t: 'rematch' }); toast('相手に再戦をリクエストしました'); return; }
      if (!Net.open || !this.lobby) { toast('相手との接続がありません'); return; }
      this.exitGame(true); this.kickoff();
    },
    exitGame(silent) {
      const g = this.game; if (!g) return; if (g.engine) g.engine.destroy(); this.game = null;
      if (!silent) { UI.tabbar(this.tab, t => this.nav(t)); }
    },
    backHome() { this.exitGame(true); if (this.lobby && Net.open) { this.lobby.guestReady = false; if (this.lobby.role === 'guest') this.lobby.ready = false; this.nav('vs'); } else { Net.close(); this.lobby = null; this.nav('home'); } }
  };
  KM.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})(window.KM);
