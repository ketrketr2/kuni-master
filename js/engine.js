/* KuniMaster — engines (host-authoritative state machines) */
window.KM = window.KM || {};
(function (KM) {
  const now = () => Date.now();
  const streakMult = s => s >= 8 ? 2 : s >= 5 ? 1.5 : s >= 3 ? 1.2 : 1;

  class Base {
    constructor(players) {
      this.players = players.map(p => ({ id: p.id, name: p.name || 'プレイヤー', avatar: p.avatar || '⚽', score: 0, streak: 0, ok: 0, nOk: 0, sumMs: 0, fastest: null, maxStreak: 0, hintsUsed: 0 }));
      this.listeners = []; this.timer = null; this.dead = false;
    }
    onChange(fn) { this.listeners.push(fn); }
    emit() { if (this.dead) return; for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error(e); } } }
    at(ms, fn) { clearTimeout(this.timer); this.timer = setTimeout(() => { if (!this.dead) fn(); }, Math.max(0, ms)); }
    p(id) { return this.players.find(p => p.id === id); }
    other(id) { return this.players.find(p => p.id !== id) || null; }
    destroy() { this.dead = true; clearTimeout(this.timer); }
    pub(p, full) { const o = { id: p.id, name: p.name, avatar: p.avatar, score: p.score, streak: p.streak, ok: p.ok, maxStreak: p.maxStreak, hintsUsed: p.hintsUsed }; if (full) Object.assign(o, { nOk: p.nOk, avgMs: p.nOk ? Math.round(p.sumMs / p.nOk) : null, fastest: p.fastest }); return o; }
    summary() {
      const ps = this.players.map(p => this.pub(p, true)); let winner = null;
      if (ps.length > 1) { if (ps[0].score > ps[1].score) winner = ps[0].id; else if (ps[1].score > ps[0].score) winner = ps[1].id; }
      return { players: ps, winner, rounds: this.log };
    }
  }

  // ================= SPEED (早押し / ソロ / 復習) =================
  class SpeedEngine extends Base {
    constructor(o) {
      super(o.players); this.mode = o.mode || 'speed'; this.qs = o.questions; this.reveal = o.reveal || 2800; this.countdown = o.countdown == null ? 3200 : o.countdown;
      this.phase = 'countdown'; this.i = -1; this.answers = {}; this.hints = {}; this.log = []; this.result = null;
    }
    start() { this.phase = 'countdown'; this.deadline = now() + this.countdown; this.emit(); this.at(this.countdown, () => this.next()); }
    get q() { return this.qs[this.i]; }
    next() {
      this.i++; if (this.i >= this.qs.length) { this.phase = 'end'; this.result = null; this.emit(); return; }
      this.phase = 'q'; this.answers = {}; this.hints = {}; this.qAt = now(); this.deadline = this.qAt + this.q.limit; this.result = null; this.emit();
      this.at(this.q.limit + 150, () => this.resolve());
    }
    input(pid, a) {
      if (this.dead) return; const p = this.p(pid); if (!p) return;
      if (this.phase === 'q') {
        if (a.a === 'ans' && !this.answers[pid]) {
          const ms = Math.max(50, Math.min(this.q.limit, a.ms != null ? a.ms : now() - this.qAt));
          this.answers[pid] = { c: a.c, ms, ok: a.c === this.q.cid };
          const allIn = this.players.every(x => this.answers[x.id]);
          if (allIn) this.resolve();
          else if (this.answers[pid].ok) { const left = Math.min(this.deadline - now(), 3000); this.deadline = now() + left; this.at(left + 150, () => this.resolve()); }
          this.emit();
        } else if (a.a === 'hint' && !this.answers[pid]) {
          const hs = this.hints[pid] = this.hints[pid] || []; const hint = this.q.hints.find(h => h.k === a.k);
          if (hint && !hs.includes(a.k) && hs.length < this.q.hints.length) { hs.push(a.k); p.hintsUsed++; this.emit(); }
        }
      } else if (this.phase === 'reveal') {
        if (a.a === 'skip' && (this.players.length === 1 || a.force)) this.next();
      } else if (this.phase === 'end') {
        // handled by app (rematch)
      }
    }
    resolve() {
      if (this.phase !== 'q') return; clearTimeout(this.timer);
      const q = this.q; const res = { cid: q.cid, per: {} };
      const correct = this.players.filter(p => this.answers[p.id] && this.answers[p.id].ok).sort((a, b) => this.answers[a.id].ms - this.answers[b.id].ms);
      for (const p of this.players) {
        const an = this.answers[p.id]; const hs = this.hints[p.id] || []; const hintCost = hs.reduce((s, k) => s + ((q.hints.find(h => h.k === k) || {}).cost || 0), 0);
        let pts = 0, ok = false, ms = null;
        if (an && an.ok) {
          ok = true; ms = an.ms; const order = correct.indexOf(p); const speed = Math.round(100 * Math.max(0, 1 - ms / q.limit));
          let raw = Math.max(10, 100 + speed - hintCost); if (order > 0) raw = Math.round(raw * 0.5);
          pts = Math.round(raw * streakMult(p.streak)); p.streak++; p.maxStreak = Math.max(p.maxStreak, p.streak); p.ok++; p.nOk++; p.sumMs += ms; if (p.fastest == null || ms < p.fastest) p.fastest = ms;
        } else { p.streak = 0; }
        p.score += pts;
        res.per[p.id] = { ok, ms, pts, c: an ? an.c : null, hints: hs.slice(), streak: p.streak, order: ok ? correct.indexOf(p) : -1, timeout: !an };
      }
      this.result = res; this.log.push({ n: this.i, type: q.type, cid: q.cid, per: res.per, prompt: q.prompt, big: q.big });
      this.phase = 'reveal'; this.deadline = now() + this.reveal; this.emit();
      this.at(this.reveal, () => this.next());
    }
    view(pid) {
      const me = this.p(pid) || this.players[0], rv = this.other(me.id); const q = this.q;
      const v = { mode: this.mode, phase: this.phase, i: this.i, total: this.qs.length, now: now(), deadline: this.deadline, qAt: this.qAt, me: this.pub(me), rival: rv ? this.pub(rv) : null };
      if ((this.phase === 'q' || this.phase === 'reveal') && q) {
        const opened = this.hints[me.id] || [];
        v.q = { n: q.n, type: q.type, prompt: q.prompt, big: q.big, choices: q.choices, limit: q.limit, cid: this.phase === 'reveal' ? q.cid : undefined, extra: this.phase === 'reveal' ? q.extra : undefined, meta: q.meta,
          hints: q.hints.map(hh => ({ k: hh.k, label: hh.label, cost: hh.cost, text: opened.includes(hh.k) ? hh.text : null })) };
        v.me.answered = !!this.answers[me.id]; v.me.choice = this.answers[me.id] ? this.answers[me.id].c : null; v.me.ms = this.answers[me.id] ? this.answers[me.id].ms : null;
        if (rv) { v.rival.answered = !!this.answers[rv.id]; v.rival.hints = (this.hints[rv.id] || []).length; }
        if (this.phase === 'reveal') v.result = this.result;
      }
      if (this.phase === 'end') v.summary = this.summary();
      return v;
    }
  }

  // ================= TURN (出題バトル) =================
  class TurnEngine extends Base {
    constructor(o) {
      super(o.players); this.mode = 'turn'; this.rounds = o.rounds || 6; this.limit = o.limit || 75000; this.diff = o.diff || 'normal'; this.seed = o.seed | 0;
      this.weak = o.weak || {}; // pid -> [cid] (their stock, provided by clients)
      this.used = []; this.i = -1; this.phase = 'idle'; this.log = []; this.reactions = []; this.revealMs = o.reveal || 5200; this.result = null;
    }
    get asker() { return this.players[this.i % 2]; }
    get answerer() { return this.players[(this.i + 1) % 2]; }
    start() { this.next(); }
    next() {
      this.i++; if (this.i >= this.rounds) { this.phase = 'end'; this.emit(); return; }
      this.phase = 'pick'; this.target = null; this.hand = KM.Quiz.turnDeal({ seed: this.seed + this.i * 7919, diff: this.diff, exclude: this.used, weak: this.weak[this.answerer.id] || [] });
      this.deadline = now() + 60000; this.result = null; this.emit();
      this.at(60000, () => { if (this.phase === 'pick') this.pick(this.asker.id, this.hand[0].cid); });
    }
    pick(pid, cid) {
      if (this.phase !== 'pick' || pid !== this.asker.id) return; if (!this.hand.some(h => h.cid === cid)) return;
      this.target = cid; this.used.push(cid); this.hints = KM.Quiz.turnHints(cid); this.opened = []; this.guesses = []; this.missesLeft = 3; this.potential = 100;
      this.phase = 'answer'; this.startedAt = now(); this.deadline = now() + this.limit; this.emit();
      this.at(this.limit + 150, () => this.finish(false, 'timeout'));
    }
    input(pid, a) {
      if (this.dead) return;
      if (a.a === 'react' && typeof a.e === 'string') { this.reactions.push({ from: pid, e: a.e.slice(0, 4), t: now() }); if (this.reactions.length > 6) this.reactions.shift(); this.emit(); return; }
      if (this.phase === 'pick') { if (a.a === 'pick') this.pick(pid, a.cid); return; }
      if (this.phase === 'answer' && pid === this.answerer.id) {
        if (a.a === 'hint') { const k = this.opened.length; if (k < this.hints.length && a.k === k) { this.opened.push(k); this.potential = Math.max(5, this.potential - this.hints[k].cost); this.answerer.hintsUsed++; this.emit(); } }
        else if (a.a === 'guess' && KM.Quiz.byId[a.cid]) {
          if (a.cid === this.target) this.finish(true, 'correct');
          else if (!this.guesses.includes(a.cid)) { this.guesses.push(a.cid); this.missesLeft--; this.potential = Math.max(5, this.potential - 15); if (this.missesLeft <= 0) this.finish(false, 'miss'); else this.emit(); }
        }
        else if (a.a === 'giveup') this.finish(false, 'giveup');
        return;
      }
      if (this.phase === 'reveal' && a.a === 'next') { clearTimeout(this.timer); this.next(); }
    }
    finish(ok, why) {
      if (this.phase !== 'answer') return; clearTimeout(this.timer);
      const an = this.answerer, as = this.asker; const pts = ok ? this.potential : 0; const bonus = ok ? 0 : 30;
      an.score += pts; as.score += bonus; if (ok) { an.ok++; an.nOk++; an.streak++; an.maxStreak = Math.max(an.maxStreak, an.streak); const ms = now() - this.startedAt; an.sumMs += ms; if (an.fastest == null || ms < an.fastest) an.fastest = ms; } else an.streak = 0;
      this.result = { cid: this.target, ok, why, pts, bonus, hintsUsed: this.opened.length, guesses: this.guesses.slice(), askerId: as.id, answererId: an.id, ms: now() - this.startedAt };
      this.log.push({ n: this.i, type: 'hint', cid: this.target, per: { [an.id]: { ok, pts, hints: this.opened.length, ms: now() - this.startedAt }, [as.id]: { asked: true, pts: bonus } } });
      this.phase = 'reveal'; this.deadline = now() + this.revealMs; this.emit();
      this.at(this.revealMs, () => this.next());
    }
    view(pid) {
      const me = this.p(pid) || this.players[0], rv = this.other(me.id);
      const v = { mode: 'turn', phase: this.phase, i: this.i, total: this.rounds, now: now(), deadline: this.deadline, me: this.pub(me), rival: rv ? this.pub(rv) : null, reactions: this.reactions.slice(-4) };
      if (this.phase === 'idle' || this.phase === 'end') { if (this.phase === 'end') v.summary = this.summary(); return v; }
      v.askerId = this.asker.id; v.answererId = this.answerer.id; v.role = me.id === this.asker.id ? 'asker' : 'answerer';
      if (this.phase === 'pick') { if (v.role === 'asker') v.hand = this.hand; }
      if (this.phase === 'answer') {
        const isAsker = me.id === this.asker.id; v.hints = this.hints.map((hh, k) => ({ k, label: hh.label, cost: hh.cost, text: (this.opened.includes(k) || isAsker) ? hh.text : null, opened: this.opened.includes(k) }));
        v.potential = this.potential; v.guesses = this.guesses.map(c => ({ cid: c, ja: KM.Quiz.byId[c].ja, f: KM.Quiz.byId[c].f })); v.missesLeft = this.missesLeft; v.startedAt = this.startedAt;
        if (v.role === 'asker') v.target = this.target;
      }
      if (this.phase === 'reveal') v.result = this.result;
      return v;
    }
  }
  KM.SpeedEngine = SpeedEngine; KM.TurnEngine = TurnEngine;
})(window.KM);
