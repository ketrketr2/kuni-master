/* KuniMaster — game-ui: speed / turn / result screens */
window.KM = window.KM || {};
(function (KM) {
  const { h, $, $$, esc, toast, Sfx, Haptic, Fx, fmtMs, countUp } = KM.u;
  const Q = () => KM.Quiz, App = () => KM.App, UI = () => KM.UI;
  const REACTS = ['🔥', '👏', '😂', '😱', '🍵', '🫣'];
  let key = null, raf = null, lastTick = 0;

  const remaining = (v, g) => Math.max(0, (v.deadline || 0) - (Date.now() + (g.offset || 0)));
  function stopTimer() { if (raf) cancelAnimationFrame(raf); raf = null; }
  function runTimer(fn) { stopTimer(); const step = () => { if (fn() !== false) raf = requestAnimationFrame(step); else raf = null; }; raf = requestAnimationFrame(step); }
  const exitBtn = () => h('button.iconbtn.exit', { onclick: () => UI().modal(h('div', h('h3', '試合をやめますか？'), h('p.muted', 'ここまでの記録は保存されています。'), h('div.row', h('button.btn', { onclick: () => UI().closeModal() }, 'つづける'), h('button.btn.danger', { onclick: () => { UI().closeModal(); stopTimer(); App().backHome(); } }, 'やめる')))) }, '✕');
  const flame = s => s >= 3 ? h('span.streak', { class: s >= 8 ? 'hot3' : s >= 5 ? 'hot2' : 'hot1' }, '🔥', s) : null;
  function scorebug(v, g, opts) {
    const me = v.me, rv = v.rival; const label = opts && opts.label;
    return h('div.scorebug',
      h('div.pl.me', h('span.av', me.avatar), h('div', h('small', me.name), h('b.sc', { 'data-sc': me.score }, me.score.toLocaleString())), flame(me.streak)),
      h('div.mid', h('b', `${Math.min(v.i + 1, v.total)}`, h('small', `/${v.total}`)), h('small', label || '')),
      rv ? h('div.pl.rival', h('span.av', rv.avatar), h('div', h('small', rv.name), h('b.sc', { 'data-sc': rv.score }, rv.score.toLocaleString())), flame(rv.streak)) : h('div.pl.solo', h('small', g.mode === 'review' ? '苦手を復習' : 'タイムアタック')));
  }
  function patchScores(v) { for (const [sel, p] of [['.pl.me .sc', v.me], ['.pl.rival .sc', v.rival]]) { const el = $(sel); if (el && p && +el.getAttribute('data-sc') !== p.score) { el.setAttribute('data-sc', p.score); countUp(el, p.score, 700); Fx.pop(el); } } }

  const GameUI = {
    // ================= SPEED =================
    speed(v, g) {
      const k = `${g.kind}:${v.i}:${v.phase}`;
      if (v.phase === 'countdown') { if (key !== k) { key = k; this.countdown(v, g); } return; }
      if (key !== k) { key = k; this.speedFull(v, g); } else this.speedPatch(v, g);
    },
    countdown(v, g) {
      stopTimer(); const num = h('div.cd-num', '3'); const node = h('div.countdown', h('div.cd-lbl', v.rival ? `${v.me.name} vs ${v.rival.name}` : (g.mode === 'review' ? '苦手を復習' : 'タイムアタック')), num, h('div.cd-sub', `${v.total}問 ・ 速いほど高得点 ・ ヒントは減点`));
      UI().show(node, 'game'); let last = null;
      runTimer(() => { const r = remaining(v, g); const n = Math.ceil(r / 1000); const t = n <= 0 ? 'キックオフ' : String(n); if (t !== last) { last = t; num.textContent = t; num.classList.toggle('go', n <= 0); Fx.pop(num); Sfx.play(n <= 0 ? 'whistle' : 'count'); } return r > 0; });
    },
    bigNode(q) {
      const b = q.big; if (!b) return null;
      if (b.kind === 'flag') return h('div.big.flag', b.v);
      if (b.kind === 'vs') return h('div.big.vs', h('div.vsi', h('span.f', b.a.f), h('span.n', b.a.ja)), h('span.vsx', 'vs'), h('div.vsi', h('span.f', b.b.f), h('span.n', b.b.ja)));
      if (b.kind === 'quote') return h('div.big.quote', '「' + b.v + '」');
      return h('div.big.text', h('div.bt', b.v), b.sub ? h('div.bs', b.sub) : null);
    },
    hintChips(v, g) {
      const q = v.q; const locked = v.me.answered || v.phase !== 'q';
      return h('div.hintrow', ...q.hints.map(hh => hh.text ? h('div.hint.open', h('span.hl', hh.label), h('span.ht', hh.text)) : h('button.hint', { disabled: locked, onclick: () => { Sfx.play('hint'); App().input({ a: 'hint', k: hh.k }); } }, `${hh.label}を見る`, h('small', `−${hh.cost}`))));
    },
    rivalStat(v) {
      if (!v.rival) return null; const r = v.rival;
      if (v.phase === 'reveal') return null;
      return h('div.rivalstat', { class: r.answered ? 'done' : '' }, h('span.av', r.avatar), r.answered ? '回答済み！' : '考え中…', r.hints ? h('small', `　ヒント${r.hints}回`) : null);
    },
    choices(v, g) {
      const q = v.q; const rev = v.phase === 'reveal'; const mine = v.me.choice;
      const cls = q.choices.length === 2 ? 'choices two' : 'choices';
      return h('div', { class: cls }, ...q.choices.map((c, i) => {
        let st = ''; if (rev) { if (c.cid === v.result.cid) st = 'correct'; else if (c.cid === mine) st = 'wrong'; else st = 'dim'; } else if (mine === c.cid) st = 'picked';
        return h('button.choice', { class: st, disabled: rev || v.me.answered, 'data-cid': c.cid, onclick: e => { Sfx.play('click'); Haptic.tap(); e.currentTarget.classList.add('picked'); App().input({ a: 'ans', c: c.cid }); } }, c.f ? h('span.cf', c.f) : null, h('span.cn', c.ja), h('span.ck', String.fromCharCode(65 + i)));
      }));
    },
    speedFull(v, g) {
      const q = v.q; const T = Q().TYPES[q.type] || {}; const isReview = g.mode === 'review';
      const bar = h('div.timerbar', { class: v.phase === 'reveal' ? 'tb-reveal' : '' }, h('i'));
      const card = h('div.qcard', h('div.prompt', h('span.qt', T.icon + ' ' + T.label), q.prompt), this.bigNode(q), q.type !== 'rank' ? this.hintChips(v, g) : null, this.rivalStat(v));
      const node = h('div.game.speed', h('div.gtop', scorebug(v, g), exitBtn()), bar, h('div.qwrap', card), this.choices(v, g), v.phase === 'reveal' ? this.revealBox(v, g) : null);
      UI().show(node, 'game', { anim: v.phase === 'q' && v.i === 0 });
      const fill = bar.firstChild;
      if (v.phase === 'q') {
        runTimer(() => { const r = remaining(v, g); const k = r / v.q.limit; fill.style.transform = `scaleX(${k})`; fill.className = k < 0.25 ? 'low' : k < 0.5 ? 'mid' : ''; if (k < 0.25 && !v.me.answered && Date.now() - lastTick > 1000) { lastTick = Date.now(); Sfx.play('tick'); } return r > 0; });
      } else { fill.style.transform = 'scaleX(1)'; runTimer(() => { const r = remaining(v, g); fill.style.transform = `scaleX(${r / 2800})`; return r > 0; }); }
    },
    speedPatch(v, g) {
      patchScores(v);
      const rs = $('.rivalstat'); const nrs = this.rivalStat(v); if (rs && nrs) rs.replaceWith(nrs);
      const hr = $('.hintrow'); if (hr && v.q.type !== 'rank') { const nh = this.hintChips(v, g); if (hr.innerHTML !== nh.innerHTML) hr.replaceWith(nh); }
      if (v.me.answered) { $$('.choice').forEach(b => { b.disabled = true; if (b.getAttribute('data-cid') === v.me.choice) b.classList.add('picked'); }); const w = $('.qcard.waiting') || $('.qcard'); if (w && !$('.waitmsg')) w.appendChild(h('div.waitmsg', v.rival ? '相手の回答を待っています…' : '')); }
    },
    revealBox(v, g) {
      const r = v.result; const me = r.per[v.me.id]; const rv = v.rival ? r.per[v.rival.id] : null; const c = Q().byId[r.cid];
      const head = me.ok ? (me.order === 0 ? (v.rival ? '先取！' : '正解！') : '正解（2番手）') : me.timeout ? '時間切れ…' : 'ちがう…';
      const line = p => p ? h('span', p.ok ? `✓ ${fmtMs(p.ms)}` : p.timeout ? '— 未回答' : '✕ 不正解') : null;
      return h('div.reveal', { class: me.ok ? 'ok' : 'ng' },
        h('div.rv-head', h('b', head), me.ok ? h('span.pts', `+${me.pts}`, me.streak >= 3 ? h('small', ` ×${me.streak >= 8 ? 2 : me.streak >= 5 ? 1.5 : 1.2}`) : null) : null),
        h('div.rv-ans', h('span.f', c.f), h('b', c.ja), h('small.muted', `${c.r}／首都 ${c.cap}`)),
        v.q.extra ? h('div.rv-extra', v.q.extra) : null,
        v.rival ? h('div.rv-times', h('span.me', `${v.me.name} `, line(me)), h('span.rv', `${v.rival.name} `, line(rv))) : null,
        h('div.rv-actions', h('button.btn.small', { onclick: () => App().openCountry(c.id) }, '図鑑で見る'), !v.rival ? h('button.btn.small.primary', { onclick: () => { stopTimer(); App().input({ a: 'skip' }); } }, '次へ ›') : null));
    },
    // ================= TURN =================
    turn(v, g) {
      const k = `${g.kind}:${v.i}:${v.phase}:${v.role}:${g.activeId}`;
      if (key !== k) { key = k; this.turnFull(v, g); } else this.turnPatch(v, g);
    },
    turnFull(v, g) {
      let body;
      if (v.phase === 'pick') body = v.role === 'asker' ? this.pickView(v, g) : this.waitPick(v, g);
      else if (v.phase === 'answer') body = v.role === 'answerer' ? this.answerView(v, g) : this.askerView(v, g);
      else if (v.phase === 'reveal') body = this.turnReveal(v, g);
      else body = h('div.muted', '準備中…');
      const bar = h('div.timerbar', h('i'));
      const node = h('div.game.turn', h('div.gtop', scorebug(v, g, { label: v.role === 'asker' ? 'あなたが出題' : 'あなたが回答' }), exitBtn()), bar, h('div.tbody', body), h('div.reacts'));
      UI().show(node, 'game', { anim: v.phase === 'pick' }); this.drawReacts(v, g, true);
      const fill = bar.firstChild; const total = v.phase === 'pick' ? 60000 : v.phase === 'answer' ? (v.deadline - v.startedAt) : 5200;
      runTimer(() => { const r = remaining(v, g); const kk = Math.min(1, r / total); fill.style.transform = `scaleX(${kk})`; fill.className = kk < 0.25 ? 'low' : ''; const tl = $('.tleft'); if (tl) tl.textContent = Math.ceil(r / 1000) + '秒'; return r > 0; });
    },
    turnPatch(v, g) {
      patchScores(v); this.drawReacts(v, g, false);
      if (v.phase === 'answer') {
        const hs = $('.hintstack'); if (hs) { const n = this.hintStack(v); if (hs.innerHTML !== n.innerHTML) hs.replaceWith(n); }
        const pot = $('.potential b'); if (pot && pot.textContent !== String(v.potential)) { pot.textContent = v.potential; Fx.pop(pot); }
        const gl = $('.guesslist'); if (gl) { const n = this.guessList(v); if (gl.innerHTML !== n.innerHTML) gl.replaceWith(n); }
        const hearts = $('.hearts'); if (hearts) hearts.textContent = '❤️'.repeat(v.missesLeft) + '🖤'.repeat(3 - v.missesLeft);
      }
    },
    pickView(v, g) {
      let sel = null; const wrap = h('div.pick');
      const draw = () => wrap.replaceChildren(
        h('h2', '出題する国を選ぶ'), h('p.muted', `${g.kind === 'hotseat' ? g.names[v.answererId] : v.rival.name} が答えます。難しい国ほど相手は苦戦。相手が外せばあなたに +30。`, h('span.tleft')),
        h('div.hand', ...v.hand.map(cd => { const c = Q().byId[cd.cid]; return h('button.hcard', { class: (sel === cd.cid ? 'on' : '') + (cd.weak ? ' weak' : ''), onclick: () => { sel = cd.cid; Sfx.play('click'); draw(); } }, cd.weak ? h('span.hw', '相手の苦手') : null, h('span.hf', c.f), h('b', c.ja), h('small', c.r), h('span.dl', '難易度 ', h('span.stars', '★'.repeat(c.d) + '☆'.repeat(3 - c.d)))); })),
        h('button.btn.primary.big', { disabled: !sel, onclick: () => { Sfx.play('whistle'); App().input({ a: 'pick', cid: sel }); } }, sel ? `${Q().byId[sel].ja} で出題する` : '国を選んでください'));
      draw(); return wrap;
    },
    waitPick(v, g) { return h('div.wait', h('div.wv-av', v.rival ? v.rival.avatar : '🙂'), h('h2', `${v.rival ? v.rival.name : '相手'} が問題を選んでいます`), h('div.dots', h('i'), h('i'), h('i')), h('p.muted', 'ヒントを開くほど点が減る。ノーヒント正解なら100点。', h('br'), h('span.tleft'))); },
    hintStack(v) {
      if (v.role === 'asker') return h('div.hintstack', ...v.hints.map(hh => h('div.hcard-o', { class: hh.opened ? '' : 'dim' }, h('span.st', hh.opened ? '開封済み' : `未開封 −${hh.cost}`), h('span.hl', hh.label), h('p', hh.text))));
      const next = v.hints.findIndex(x => !x.opened);
      return h('div.hintstack', ...v.hints.map((hh, i) => hh.opened ? h('div.hcard-o', h('span.hl', hh.label), h('p', hh.text)) : i === next ? h('button.hcard-n', { onclick: () => { Sfx.play('hint'); Haptic.tap(); App().input({ a: 'hint', k: i }); } }, h('span.hl', hh.label), h('span', `開く　−${hh.cost}pt`)) : h('div.hcard-l', h('span.hl', hh.label), h('span', '🔒'))));
    },
    guessList(v) { return h('div.guesslist', ...v.guesses.map(x => h('span.gwrong', x.f + ' ' + x.ja))); },
    answerView(v, g) {
      const inp = h('input.input', { type: 'text', placeholder: '国名を入力（ひらがな可）', autocomplete: 'off', autocorrect: 'off', spellcheck: false });
      const list = h('div.searchlist'); let picked = null;
      const confirm = h('div.confirm');
      const drawConfirm = () => { if (!picked) { confirm.replaceChildren(); return; } const c = Q().byId[picked]; confirm.replaceChildren(h('span', c.f + ' ' + c.ja), h('button.btn.primary', { onclick: () => { Sfx.play('click'); App().input({ a: 'guess', cid: picked }); picked = null; inp.value = ''; drawList(''); drawConfirm(); } }, 'この国で回答'), h('button.btn.small', { onclick: () => { picked = null; drawConfirm(); } }, '取消')); };
      const drawList = q => { const res = q ? Q().search(q).slice(0, 8) : []; list.replaceChildren(...res.map(c => h('button.sitem', { class: v.guesses.some(x => x.cid === c.id) ? 'used' : '', onclick: () => { picked = c.id; drawConfirm(); Sfx.play('click'); } }, h('span.f', c.f), h('span', c.ja), h('small.muted', c.r)))); };
      inp.addEventListener('input', () => drawList(inp.value));
      return h('div.answer',
        h('div.arow', h('div.potential', h('small', '正解なら'), h('b', v.potential), h('small', 'pt')), h('div.hearts', '❤️'.repeat(v.missesLeft) + '🖤'.repeat(3 - v.missesLeft)), h('div.tleft')),
        this.hintStack(v), this.guessList(v),
        h('div.answerbox', inp, list, confirm),
        h('button.btn.small.ghost', { onclick: () => UI().modal(h('div', h('h3', '降参しますか？'), h('p.muted', '相手に30点入ります。'), h('div.row', h('button.btn', { onclick: () => UI().closeModal() }, 'まだ考える'), h('button.btn.danger', { onclick: () => { UI().closeModal(); App().input({ a: 'giveup' }); } }, '降参')))) }, '降参する'));
    },
    askerView(v, g) {
      const c = Q().byId[v.target];
      return h('div.asker',
        h('div.tcard', h('span.f', c.f), h('div', h('small.muted', '出題中'), h('b', c.ja), h('small.muted', `首都 ${c.cap}`))),
        h('div.arow', h('div.potential', h('small', '相手の残り'), h('b', v.potential), h('small', 'pt')), h('div.hearts', '❤️'.repeat(v.missesLeft) + '🖤'.repeat(3 - v.missesLeft)), h('div.tleft')),
        h('h4', 'ヒント開封状況'), this.hintStack(v), h('h4', '相手の回答'), v.guesses.length ? this.guessList(v) : h('div.guesslist', h('span.muted', 'まだ回答なし')),
        h('h4', 'リアクションを送る'), h('div.reactbar', ...REACTS.map(e => h('button.rbtn', { onclick: () => { Sfx.play('pop'); App().input({ a: 'react', e }); } }, e))));
    },
    drawReacts(v, g, first) {
      const box = $('.reacts'); if (!box) return; g.seenReacts = g.seenReacts || 0;
      for (const r of v.reactions || []) { if (r.t <= g.seenReacts) continue; if (!first || Date.now() + (g.offset || 0) - r.t < 4000) { const el = h('span.rfloat', { style: { left: (20 + Math.random() * 60) + '%' } }, r.e); box.appendChild(el); setTimeout(() => el.remove(), 2400); } }
      if ((v.reactions || []).length) g.seenReacts = Math.max(g.seenReacts, ...v.reactions.map(r => r.t));
    },
    turnReveal(v, g) {
      const r = v.result; const c = Q().byId[r.cid]; const meAns = g.kind === 'hotseat' ? true : r.answererId === v.me.id;
      const who = g.kind === 'hotseat' ? (g.names[r.answererId] || '回答者') : (meAns ? 'あなた' : v.rival.name);
      const head = r.ok ? `${who}が正解！` : r.why === 'timeout' ? '時間切れ' : r.why === 'giveup' ? `${who}が降参` : `${who}は3回ミス`;
      return h('div.treveal', { class: r.ok ? 'ok' : 'ng' },
        h('h2', head), h('div.rv-ans', h('span.f', c.f), h('b', c.ja), h('small.muted', `${c.r}／首都 ${c.cap}`)),
        h('div.tr-pts', r.ok ? h('span.pts', `回答者 +${r.pts}`, h('small', `　ヒント${r.hintsUsed}回・${fmtMs(r.ms)}`)) : h('span.pts.asker', `出題者 +${r.bonus}`)),
        h('div.card.mini', h('div.kv', h('span.k', '愛称'), h('span.v', c.nick)), h('div.kv', h('span.k', '強さ'), h('span.v', UI().stars(Q().strength(c)), ` FIFA${c.rank}位`)), h('div.kv', h('span.k', '代表的な選手'), h('span.v', c.pl.slice(0, 2).map(p => p[0]).join('、'))), h('div.kv', h('span.k', '主なクラブ'), h('span.v', c.clubs.slice(0, 3).join('、')))),
        h('div.rv-actions', h('button.btn.small', { onclick: () => App().openCountry(c.id) }, '図鑑で見る'), (g.role === 'host') ? h('button.btn.small.primary', { onclick: () => { stopTimer(); App().input({ a: 'next' }); } }, '次へ ›') : h('span.muted.tleft')));
    },
    handoff(p, phase, cb) {
      stopTimer(); key = null;
      const node = h('div.handoff', h('div.ho-av', p.avatar), h('h2', `${p.name} にスマホを渡してください`), h('p.muted', phase === 'pick' ? '出題する番です。相手に画面を見せないように。' : '答える番です。ヒントを開くほど点が減ります。'), h('button.btn.primary.big', { onclick: () => { Sfx.play('whistle'); cb(); } }, '受け取った'));
      UI().show(node, 'game');
    },
    dropped(cb) { stopTimer(); UI().modal(h('div', h('h3', '相手との接続が切れました'), h('p.muted', 'ここまでの回答は記録されています。もう一度部屋を作って合流し直してください。'), h('button.btn.primary', { onclick: () => { UI().closeModal(); cb(); } }, 'ルームへ戻る')), { sticky: true }); },
    pulseRematch() { const b = $('.btn.rematch'); if (b) { b.classList.add('pulse'); b.textContent = 'もう一回（相手が待っています）'; } },
    // ================= RESULT =================
    result(v, g, result, prog) {
      stopTimer(); key = null; const s = v.summary; const me = s.players.find(p => p.id === g.myId) || s.players[0]; const rv = s.players.find(p => p.id !== me.id);
      const verdict = result === 'win' ? ['🏆', '勝利！'] : result === 'loss' ? ['😢', '敗北…'] : result === 'draw' ? ['🤝', '引き分け'] : g.mode === 'review' ? ['🩹', '復習おつかれさま'] : ['🏁', '試合終了'];
      const stat = (l, a, b) => h('div.mvrow', h('span.k', l), h('span.a', a), rv ? h('span.b', b) : null);
      const rounds = h('div.rounds', ...s.rounds.map(r => { const c = Q().byId[r.cid]; const mine = r.per[me.id] || {}; const their = rv ? (r.per[rv.id] || {}) : null; return h('button.rrow', { class: mine.ok ? 'ok' : (mine.asked ? 'asked' : 'ng'), onclick: () => App().openCountry(r.cid) }, h('span.f', c.f), h('div.rm', h('b', c.ja), h('small', `${(Q().TYPES[r.type] || {}).label || ''}${mine.asked ? '（出題）' : ''}`)), h('div.rr', h('b.a', mine.asked ? `+${mine.pts}` : mine.ok ? `+${mine.pts}` : '✕'), their ? h('b.b', their.asked ? `出題 +${their.pts}` : their.ok ? `+${their.pts}` : '✕') : null)); }));
      const node = h('div.result',
        h('div.verdict', h('div.vi', verdict[0]), h('h1', verdict[1])),
        h('div.finalboard', h('div.fb.me', h('span.av', me.avatar), h('small', me.name), h('b', me.score.toLocaleString())), rv ? h('div.fbx', '–') : null, rv ? h('div.fb.rival', h('span.av', rv.avatar), h('small', rv.name), h('b', rv.score.toLocaleString())) : null),
        prog ? h('div.card.xpcard', h('div.row', h('b', `+${prog.gained} XP`), h('small.muted', `Lv.${prog.to.level} ${prog.to.title}`)), h('div.xpbar', h('i', { style: { width: Math.round(prog.to.pct * 100) + '%' } })), prog.ach && prog.ach.length ? h('div.chips.static', ...prog.ach.map(a => h('span.chip.gold', a.icon + ' ' + a.name))) : null) : null,
        h('div.card', h('h3', 'スタッツ'), rv ? h('div.mvhead', h('span'), h('span.a', me.name), h('span.b', rv.name)) : null, stat('正解', `${me.nOk}`, rv ? `${rv.nOk}` : ''), stat('平均タイム', me.avgMs ? fmtMs(me.avgMs) : '—', rv ? (rv.avgMs ? fmtMs(rv.avgMs) : '—') : ''), stat('最速', me.fastest ? fmtMs(me.fastest) : '—', rv ? (rv.fastest ? fmtMs(rv.fastest) : '—') : ''), stat('最大コンボ', `${me.maxStreak}`, rv ? `${rv.maxStreak}` : ''), stat('ヒント', `${me.hintsUsed}回`, rv ? `${rv.hintsUsed}回` : '')),
        h('div.card', h('h3', '出題された国', h('small.muted', ' タップで図鑑')), rounds),
        h('div.actions', h('button.btn.primary.big.rematch', { onclick: () => App().rematch() }, g.kind === 'net' && g.role === 'guest' ? 'もう一回を頼む' : 'もう一回'), h('button.btn.big', { onclick: () => App().backHome() }, g.kind === 'net' ? 'ルームへ戻る' : 'ホームへ')));
      UI().show(node, 'result');
    }
  };
  KM.GameUI = GameUI;
})(window.KM);
