/* Node smoke test: quiz generation + engines. Run: node test/engine.test.js */
global.window = global; global.location = { search: '', href: 'http://localhost/' };
global.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
global.performance = { now: () => Date.now() };
for (const f of ['data-europe', 'data-americas', 'data-africa', 'data-asia', 'util', 'store', 'quiz', 'engine', 'net']) require('../js/' + f + '.js');
const { Quiz, SpeedEngine, TurnEngine, Store } = KM;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

Quiz.init(); Store.load();
assert(Quiz.all.length === 76, '76 countries loaded');

// ---- question generation ----
for (const diff of ['easy', 'normal', 'hard']) {
  const qs = Quiz.build({ count: 20, seed: 42, diff });
  assert(qs.length === 20, `build 20 (${diff})`);
  for (const q of qs) {
    assert(q.choices.length >= 2 && q.choices.some(c => c.cid === q.cid), `choices contain answer (${q.type})`);
    assert(new Set(q.choices.map(c => c.cid)).size === q.choices.length, 'choices unique');
    assert(q.prompt && q.big, 'prompt/big present');
  }
}
const types = new Set(Quiz.build({ count: 60, seed: 7 }).map(q => q.type)); assert(types.size >= 6, 'type variety: ' + [...types].join(','));
// review pool small
const rq = Quiz.build({ count: 10, seed: 1, pool: ['JPN', 'BRA', 'ESP'] }); assert(rq.length === 10, 'small pool fills to 10');
// search
assert(Quiz.search('にほん')[0].id === 'JPN', 'search hiragana');
assert(Quiz.search('japan')[0].id === 'JPN', 'search english');
assert(Quiz.search('ｽﾍﾟｲﾝ')[0].id === 'ESP', 'search half-width katakana');
assert(Quiz.search('こんご').some(c => c.id === 'COD'), 'search alias');
// deterministic
const a1 = Quiz.build({ count: 5, seed: 99 }).map(q => q.cid).join(), a2 = Quiz.build({ count: 5, seed: 99 }).map(q => q.cid).join(); assert(a1 === a2, 'seeded build deterministic');
// turn deal
const hand = Quiz.turnDeal({ seed: 5, diff: 'normal', exclude: [], weak: ['JPN'] }); assert(hand.length === 5 && hand.some(h => h.weak && h.cid === 'JPN'), 'turnDeal 5 cards incl weak');
assert(Quiz.turnHints('JPN').length === 5, 'turnHints 5');

// ---- speed engine ----
(async () => {
  const qs = Quiz.build({ count: 3, seed: 3 });
  const e = new SpeedEngine({ players: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], questions: qs, reveal: 50, countdown: 20 });
  const phases = []; e.onChange(x => phases.push(x.phase));
  e.start();
  await new Promise(r => setTimeout(r, 60));
  assert(e.phase === 'q' && e.i === 0, 'countdown -> q');
  e.input('A', { a: 'hint', k: qs[0].hints[0] && qs[0].hints[0].k });
  e.input('A', { a: 'ans', c: qs[0].cid, ms: 1500 });
  assert(e.phase === 'q' && e.answers.A.ok, 'A answered correct, waits for B');
  e.input('B', { a: 'ans', c: qs[0].cid, ms: 900 });
  assert(e.phase === 'reveal', 'both answered -> reveal');
  const r = e.result.per; assert(r.B.order === 0 && r.A.order === 1, 'B faster gets first');
  assert(r.B.pts > r.A.pts, 'first correct earns more: B=' + r.B.pts + ' A=' + r.A.pts);
  await new Promise(r => setTimeout(r, 80));
  assert(e.phase === 'q' && e.i === 1, 'auto next after reveal');
  e.input('A', { a: 'ans', c: 'ZZZ', ms: 500 }); // wrong
  e.input('B', { a: 'ans', c: qs[1].cid, ms: 4000 });
  assert(e.result.per.A.pts === 0 && e.result.per.B.pts > 0, 'wrong 0 pts');
  await new Promise(r => setTimeout(r, 80));
  // timeout round
  await new Promise(r => setTimeout(r, qs[2].limit + 300));
  assert(e.phase === 'end', 'timeout then end'); const s = e.summary(); assert(s.winner === 'B', 'winner B'); assert(s.rounds.length === 3, '3 rounds logged');
  const vB = e.view('B'); assert(vB.summary && vB.me.id === 'B' && vB.rival.id === 'A', 'view end');
  // solo (1 player) skip
  const se = new SpeedEngine({ players: [{ id: 'S' }], questions: Quiz.build({ count: 2, seed: 8 }), reveal: 5000, countdown: 0 }); se.start(); await new Promise(r => setTimeout(r, 30));
  se.input('S', { a: 'ans', c: se.q.cid }); assert(se.phase === 'reveal', 'solo answer resolves immediately'); se.input('S', { a: 'skip' }); assert(se.phase === 'q' && se.i === 1, 'solo skip advances');
  const v = se.view('S'); assert(v.q && v.q.cid === undefined && v.rival === null, 'view hides answer during q');
  se.destroy();

  // ---- turn engine ----
  const t = new TurnEngine({ players: [{ id: 'A' }, { id: 'B' }], rounds: 2, seed: 11, reveal: 40, weak: { B: ['ESP'] } });
  t.start(); assert(t.phase === 'pick' && t.asker.id === 'A', 'turn: A picks first');
  const va = t.view('A'), vb = t.view('B'); assert(va.hand && va.hand.length === 5 && !vb.hand, 'hand only to asker');
  assert(va.hand.some(h => h.weak && h.cid === 'ESP'), 'weak card from B stock dealt');
  t.input('B', { a: 'pick', cid: va.hand[0].cid }); assert(t.phase === 'pick', 'answerer cannot pick');
  t.input('A', { a: 'pick', cid: va.hand[1].cid }); assert(t.phase === 'answer' && t.target === va.hand[1].cid, 'asker picked');
  const vb2 = t.view('B'); assert(vb2.target === undefined && vb2.hints.every(h => h.text === null), 'answerer view hides target and hints');
  t.input('B', { a: 'hint', k: 1 }); assert(t.opened.length === 0, 'must open in order');
  t.input('B', { a: 'hint', k: 0 }); assert(t.opened.length === 1 && t.potential === 90, 'hint0 -10');
  t.input('B', { a: 'hint', k: 1 }); assert(t.potential === 75, 'hint1 -15');
  const wrong = Quiz.all.find(c => c.id !== t.target).id; t.input('B', { a: 'guess', cid: wrong }); assert(t.missesLeft === 2 && t.potential === 60, 'wrong guess -15');
  t.input('A', { a: 'react', e: '🔥' }); assert(t.reactions.length === 1, 'reaction stored');
  t.input('B', { a: 'guess', cid: t.target }); assert(t.phase === 'reveal' && t.result.ok && t.result.pts === 60, 'correct -> 60 pts');
  assert(t.p('B').score === 60 && t.p('A').score === 0, 'scores');
  await new Promise(r => setTimeout(r, 70)); assert(t.phase === 'pick' && t.asker.id === 'B', 'roles swap');
  t.input('B', { a: 'pick', cid: t.hand[0].cid }); t.input('A', { a: 'giveup' }); assert(t.phase === 'reveal' && !t.result.ok && t.p('B').score === 90, 'giveup: asker +30');
  await new Promise(r => setTimeout(r, 70)); assert(t.phase === 'end' && t.summary().winner === 'B', 'turn end winner B');
  t.destroy();

  // ---- store ----
  Store.recordAnswer({ mode: 'speed', type: 'flag', cid: 'JPN', ok: false, ms: 1200, pts: 0 });
  assert(Store.state.stock.JPN && Store.state.stock.JPN.n === 1, 'wrong -> stock');
  Store.recordAnswer({ mode: 'speed', type: 'flag', cid: 'JPN', ok: true, ms: 700, pts: 150 });
  Store.recordAnswer({ mode: 'speed', type: 'flag', cid: 'JPN', ok: true, ms: 900, pts: 150 });
  assert(!Store.state.stock.JPN && Store.state.stats.stockCleared === 1, 'two wins clear stock');
  assert(Store.unlockedCount() === 1 && Store.stars('JPN') === 1, 'mastery unlocked');
  const lv = Store.addXp(350); assert(lv.to.level >= 2 && lv.leveled, 'level up');
  const got = Store.checkAchievements(); assert(got.some(a => a.id === 'first_q') && got.some(a => a.id === 'fast'), 'achievements: ' + got.map(a => a.id).join(','));
  assert(Store.dailyCheck().isNew && !Store.dailyCheck().isNew, 'daily check once');
  Store.recordMatch({ mode: 'speed', rival: 'たろう', result: 'win', my: 300, their: 200 }); assert(Store.state.rivals['たろう'].w === 1, 'rival record');
  console.log(process.exitCode ? '\nSOME TESTS FAILED' : '\nALL TESTS PASSED');
})();
