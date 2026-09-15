/* KuniMaster — quiz: question generation from KM_DATA */
window.KM = window.KM || {};
(function (KM) {
  const u = KM.u;
  const TYPES = {
    flag: { label: '国旗', icon: '🏁' },
    capital: { label: '首都', icon: '🏛️' },
    player: { label: '選手', icon: '👤' },
    club: { label: 'クラブ', icon: '🏟️' },
    rank: { label: '強さ比べ', icon: '📊' },
    nick: { label: '愛称', icon: '🦁' },
    legend: { label: 'レジェンド', icon: '🎖️' },
    fact: { label: '特徴', icon: '💡' },
    hint: { label: '出題', icon: '🃏' }
  };
  const REGIONS = ['欧州', '南米', '北中米', 'アフリカ', 'アジア', 'オセアニア'];
  const DIFF_W = { easy: { 1: 6, 2: 1, 3: 0 }, normal: { 1: 3, 2: 2, 3: 1 }, hard: { 1: 1, 2: 2, 3: 3 } };

  const Quiz = {
    TYPES, REGIONS, all: [], byId: {},
    init() { this.all = (window.KM_DATA || []).slice(); this.byId = {}; for (const c of this.all) this.byId[c.id] = c; },
    strength(c) { // 1-5 gauge from FIFA rank
      const r = c.rank; return r <= 10 ? 5 : r <= 25 ? 4 : r <= 50 ? 3 : r <= 80 ? 2 : 1;
    },
    weightedSample(pool, n, rnd, diff) {
      const w = DIFF_W[diff] || DIFF_W.normal; let items = pool.map(c => ({ c, w: w[c.d] || 0 })).filter(x => x.w > 0);
      if (items.length < n) items = pool.map(c => ({ c, w: 1 }));
      const out = [];
      while (out.length < n && items.length) {
        let tot = items.reduce((a, x) => a + x.w, 0), r = rnd() * tot, idx = 0;
        for (; idx < items.length; idx++) { r -= items[idx].w; if (r <= 0) break; }
        idx = Math.min(idx, items.length - 1); out.push(items[idx].c); items.splice(idx, 1);
      }
      return out;
    },
    distractors(c, n, rnd, opts) {
      opts = opts || {}; const out = []; const used = new Set([c.id]);
      const add = list => { for (const x of list) { if (out.length >= n) break; if (!used.has(x.id)) { used.add(x.id); out.push(x); } } };
      if (c.sim && opts.useSim) add(u.shuffle(c.sim.map(id => this.byId[id]).filter(Boolean), rnd));
      const same = u.shuffle(this.all.filter(x => x.r === c.r && x.id !== c.id), rnd);
      const near = same.filter(x => Math.abs(x.d - c.d) <= 1);
      add(opts.mixRegions ? near.slice(0, Math.max(1, n - 1)) : near); add(same); add(u.shuffle(this.all, rnd));
      return out.slice(0, n);
    },
    choicesFor(c, rnd, opts) { return u.shuffle([c, ...this.distractors(c, 3, rnd, opts)], rnd).map(x => ({ cid: x.id, ja: x.ja, f: x.f })); },
    hintRegion(c) { return { k: 'region', label: '地域', cost: 20, text: `${c.r}（${c.cf}）` }; },
    hintCapInit(c) { return { k: 'cap', label: '首都の頭文字', cost: 30, text: `首都は「${c.cap[0]}」から始まる` }; },
    build(o) {
      o = o || {}; const count = o.count || 10, rnd = u.mulberry32(o.seed == null ? (Math.random() * 1e9) | 0 : o.seed);
      const types = (o.types && o.types.length) ? o.types : ['flag', 'capital', 'player', 'club', 'rank', 'nick', 'legend', 'fact'];
      let pool = o.pool ? o.pool.map(id => this.byId[id]).filter(Boolean) : this.all.slice();
      if (o.avoid && o.avoid.length && pool.length > count + 8) pool = pool.filter(c => !o.avoid.includes(c.id));
      const picked = this.weightedSample(pool, Math.min(count, pool.length), rnd, o.diff || 'normal');
      const qs = []; let i = 0;
      for (const c of picked) {
        // choose a type applicable to this country, roughly in the requested mix
        let cand = types.filter(t => this.applicable(t, c)); if (!cand.length) cand = ['flag'];
        const t = cand[Math.floor(rnd() * cand.length)];
        qs.push(this.make(t, c, rnd, i++));
      }
      // fill if pool was small (review mode): reuse countries with different types
      while (qs.length < count && picked.length) { const c = picked[qs.length % picked.length]; const cand = types.filter(t => this.applicable(t, c)); const t = cand.length ? cand[Math.floor(rnd() * cand.length)] : 'flag'; qs.push(this.make(t, c, rnd, i++)); if (qs.length > count * 3) break; }
      return qs.slice(0, count);
    },
    applicable(t, c) {
      if (t === 'player') return c.pl && c.pl.length > 0; if (t === 'club') return c.clubs && c.clubs.length > 0;
      if (t === 'legend') return c.lg && c.lg.length > 0; if (t === 'nick') return !!c.nick; if (t === 'rank') return !c.ra;
      return true;
    },
    make(t, c, rnd, n) {
      const q = { n, type: t, cid: c.id, limit: 12000, hints: [] };
      switch (t) {
        case 'flag': q.prompt = 'この国旗はどこの国？'; q.big = { kind: 'flag', v: c.f }; q.choices = this.choicesFor(c, rnd, { useSim: true }); q.choices.forEach(x => delete x.f); q.hints = [this.hintRegion(c), this.hintCapInit(c)]; break;
        case 'capital': q.prompt = `首都が「${c.cap}」の国は？`; q.big = { kind: 'text', v: c.cap, sub: '首都' }; q.choices = this.choicesFor(c, rnd); q.hints = [this.hintRegion(c), { k: 'nick', label: '代表の愛称', cost: 30, text: `代表の愛称は「${c.nick}」` }]; break;
        case 'player': { const p = u.pick(c.pl, rnd); q.prompt = 'この選手の国籍は？'; q.big = { kind: 'text', v: p[0], sub: `${p[1]}` }; q.meta = { player: p[0], pos: p[1] }; q.choices = this.choicesFor(c, rnd, { mixRegions: true }); q.hints = [{ k: 'club', label: '所属クラブ', cost: 30, text: `所属：${p[2]}` }, this.hintRegion(c)]; q.extra = p[3]; break; }
        case 'club': { const cl = u.pick(c.clubs, rnd); q.prompt = 'このクラブがある国は？'; q.big = { kind: 'text', v: cl, sub: 'クラブ' }; q.meta = { club: cl }; q.choices = this.choicesFor(c, rnd, { mixRegions: true }); q.hints = [{ k: 'league', label: 'リーグ名', cost: 30, text: `リーグ：${c.league}` }, this.hintRegion(c)]; break; }
        case 'rank': { const others = this.all.filter(x => x.id !== c.id && !x.ra && Math.abs(x.rank - c.rank) >= 8); const o = others.length ? u.pick(others, rnd) : this.all.find(x => x.id !== c.id); const win = c.rank < o.rank ? c : o; q.cid = win.id; q.prompt = 'FIFAランキングが上なのはどっち？'; q.big = { kind: 'vs', a: { cid: c.id, ja: c.ja, f: c.f }, b: { cid: o.id, ja: o.ja, f: o.f } }; q.choices = u.shuffle([{ cid: c.id, ja: c.ja, f: c.f }, { cid: o.id, ja: o.ja, f: o.f }], rnd); q.hints = []; q.limit = 9000; q.extra = `${win.ja} ${win.rank}位 ／ ${(win === c ? o : c).ja} ${(win === c ? o : c).rank}位（2026年7月付）`; break; }
        case 'nick': q.prompt = `代表の愛称が「${c.nick}」の国は？`; q.big = { kind: 'text', v: c.nick, sub: '代表の愛称' }; q.choices = this.choicesFor(c, rnd); q.hints = [this.hintRegion(c), this.hintCapInit(c)]; break;
        case 'legend': { const l = u.pick(c.lg, rnd); q.prompt = 'このレジェンドの母国は？'; q.big = { kind: 'text', v: l[0], sub: 'レジェンド' }; q.meta = { player: l[0] }; q.choices = this.choicesFor(c, rnd, { mixRegions: true }); q.hints = [{ k: 'note', label: '功績', cost: 30, text: l[1] }, this.hintRegion(c)]; break; }
        case 'fact': { const hi = rnd() < 0.5 ? 0 : 1; q.prompt = 'この特徴に当てはまる国は？'; q.big = { kind: 'quote', v: c.h[hi] }; q.choices = this.choicesFor(c, rnd); q.hints = [this.hintRegion(c), { k: 'more', label: 'もう一つの特徴', cost: 30, text: c.h[3] }]; break; }
      }
      return q;
    },
    // ---- 出題バトル ----
    turnHints(cid) {
      const c = this.byId[cid]; const costs = [10, 15, 20, 25, 20];
      return c.h.map((text, i) => ({ k: i, cost: costs[i], text, label: ['むずかしいヒント', 'ヒント2', 'ヒント3', 'ヒント4', 'ほぼ答え'][i] }));
    },
    turnDeal(o) { // {seed, diff, exclude:[cid], weak:[cid]} -> 5 cards
      const rnd = u.mulberry32(o.seed | 0); const ex = new Set(o.exclude || []);
      const cards = []; const weak = (o.weak || []).filter(id => !ex.has(id) && this.byId[id]);
      if (weak.length) { const w = this.byId[u.pick(weak, rnd)]; cards.push({ cid: w.id, weak: true }); ex.add(w.id); }
      const pool = this.all.filter(c => !ex.has(c.id));
      for (const c of this.weightedSample(pool, 5 - cards.length, rnd, o.diff || 'normal')) cards.push({ cid: c.id, weak: false });
      return u.shuffle(cards, rnd);
    },
    search(query) {
      const q = u.kana(query); if (!q) return this.all.slice(0, 30);
      return this.all.filter(c => u.kana(c.ja).includes(q) || u.kana(c.en).includes(q) || c.id.toLowerCase().includes(q) || (c.al || []).some(a => u.kana(a).includes(q))).slice(0, 30);
    },
    stars(rank) { const s = this.strength({ rank }); return '★'.repeat(s) + '☆'.repeat(5 - s); }
  };
  KM.Quiz = Quiz;
})(window.KM);
