/* KuniMaster — ui: shell + non-game screens */
window.KM = window.KM || {};
(function (KM) {
  const { h, $, $$, esc, toast, Sfx, Haptic, fmtMs, fmtDate, countUp } = KM.u;
  const S = () => KM.Store.state, Q = () => KM.Quiz, App = () => KM.App;
  const AVATARS = ['⚽', '🦁', '🐯', '🦅', '🐺', '🦊', '🐻', '🐼', '🐸', '🐙', '🦈', '🐉', '🔥', '⚡', '🌟', '🎯', '🍙', '🍺', '🥷', '👑', '🎩', '🕶️', '🧢', '🥇'];
  const TYPE_LABEL = t => (Q().TYPES[t] || { label: t }).label;
  let root = null, sheetEl = null, modalEl = null;

  const UI = {
    AVATARS,
    mount(el) { root = el; },
    show(node, cls, opts) {
      opts = opts || {}; this.closeModal(); this.closeSheet();
      root.className = 'screen ' + (cls || ''); root.replaceChildren(node); root.scrollTop = 0;
      if (opts.anim !== false) node.classList.add('enter');
    },
    tabbar(active, onNav) {
      const bar = document.getElementById('tabbar'); if (!bar) return;
      if (!active) { bar.classList.add('hidden'); return; }
      bar.classList.remove('hidden');
      const tabs = [['home', '🏠', 'ホーム'], ['vs', '⚔️', '対戦'], ['codex', '📒', '図鑑'], ['record', '📈', '記録']];
      bar.replaceChildren(...tabs.map(([id, ic, lb]) => h('button.tab', { class: id === active ? 'on' : '', onclick: () => { Sfx.play('click'); onNav(id); } }, h('span.ic', ic), h('span.lb', lb))));
    },
    // ---------- overlays ----------
    sheet(content, opts) {
      opts = opts || {}; this.closeSheet();
      const box = h('div.sheet', h('div.grip'), opts.noHead ? null : h('div.sheet-head', h('h2', opts.title || ''), h('button.iconbtn', { onclick: () => this.closeSheet(), 'aria-label': '閉じる' }, '✕')), h('div.sheet-body', content));
      sheetEl = h('div.scrim', { onclick: e => { if (e.target === sheetEl && !opts.sticky) this.closeSheet(); } }, box);
      document.body.appendChild(sheetEl); requestAnimationFrame(() => sheetEl.classList.add('open'));
      return box;
    },
    closeSheet() { if (sheetEl) { const s = sheetEl; sheetEl = null; s.classList.remove('open'); setTimeout(() => s.remove(), 220); } },
    modal(content, opts) {
      opts = opts || {}; this.closeModal();
      modalEl = h('div.scrim.center', { onclick: e => { if (e.target === modalEl && !opts.sticky) this.closeModal(); } }, h('div.modal', content));
      document.body.appendChild(modalEl); requestAnimationFrame(() => modalEl.classList.add('open'));
      return modalEl;
    },
    closeModal() { if (modalEl) { const m = modalEl; modalEl = null; m.classList.remove('open'); setTimeout(() => m.remove(), 200); } },
    levelUp(info) {
      const m = this.modal(h('div.levelup', h('div.lu-ic', '🏅'), h('div.lu-t', 'レベルアップ'), h('div.lu-lv', `Lv.${info.level}`), h('div.lu-title', info.title), h('button.btn.primary', { onclick: () => this.closeModal() }, 'つづける')));
      KM.u.Fx.confetti(140);
    },
    achToast(a) {
      const el = h('div.ach-toast', h('span.ai', a.icon), h('div', h('b', '実績解除：' + a.name), h('small', a.desc)));
      document.body.appendChild(el); Sfx.play('level'); Haptic.ok(); requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3200);
    },
    // ---------- small helpers ----------
    stars(n) { return h('span.stars', '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))); },
    ring(pct, size, txt) {
      const r = (size - 8) / 2, C = 2 * Math.PI * r;
      return h('div.ring', { style: { width: size + 'px', height: size + 'px' } },
        h('svg', { viewBox: `0 0 ${size} ${size}`, html: `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>` }), h('div.ring-txt', txt));
    },
    // ---------- onboarding ----------
    onboard(cb) {
      let avatar = '⚽'; const inp = h('input.input', { type: 'text', maxlength: 12, placeholder: 'ニックネーム（12文字まで）', autocomplete: 'off' });
      const grid = h('div.avgrid'); const draw = () => grid.replaceChildren(...AVATARS.map(a => h('button.av', { class: a === avatar ? 'on' : '', onclick: () => { avatar = a; draw(); Sfx.play('click'); } }, a))); draw();
      const go = () => { const name = inp.value.trim(); if (!name) { KM.u.Fx.shake(inp); inp.focus(); return; } KM.App.saveProfile({ avatar }); this.closeSheet(); cb(name); };
      this.sheet(h('div.onboard', h('div.ob-logo', '🌍'), h('h1', 'クニマスター'), h('p.muted', '国旗・首都・サッカーで世界を制覇するクイズ。名前とアイコンを決めよう。'), inp, grid, h('button.btn.primary.big', { onclick: go }, 'キックオフ')), { sticky: true });
      setTimeout(() => inp.focus(), 300);
    },
    // ---------- home ----------
    home() {
      const s = S(), p = s.profile, st = s.stats, lv = KM.Store.levelInfo(st.xp); const acc = st.q ? Math.round(st.ok / st.q * 100) : 0;
      const stock = KM.Store.stockList().length, unlocked = KM.Store.unlockedCount(), total = Q().all.length;
      const node = h('div.home',
        h('div.pcard', { onclick: () => App().openSettings() },
          h('div.pc-av', p.avatar),
          h('div.pc-main', h('div.pc-name', p.name), h('div.pc-title', `Lv.${lv.level}　${lv.title}`), h('div.xpbar', h('i', { style: { width: Math.round(lv.pct * 100) + '%' } })), h('div.pc-xp', `${st.xp.toLocaleString()} XP　次のレベルまで ${lv.toNext}`)),
          h('div.pc-daily', h('div.flame', st.daily.streak >= 2 ? '🔥' : '📅'), h('div', h('b', st.daily.streak || 0), h('small', '日連続')))),
        h('div.quick',
          h('div.qs', h('b', acc + '%'), h('small', '正答率')),
          h('div.qs', h('b', st.wins), h('small', '対戦勝利')),
          h('div.qs', { onclick: () => App().nav('codex') }, h('b', `${unlocked}/${total}`), h('small', '図鑑')),
          h('div.qs', { class: stock ? 'warn' : '', onclick: () => App().nav('record') }, h('b', stock), h('small', 'ストック'))),
        h('div.tickets',
          this.ticket('⚔️', '友だちと対戦', '別のスマホと合言葉でつながる', '早押し／出題バトル', 'vs', () => App().nav('vs')),
          this.ticket('🏃', 'ひとりで特訓', 'タイムアタック10問', 'コンボで倍率アップ', 'solo', () => this.soloSetup()),
          this.ticket('🩹', stock ? `苦手を復習（${stock}）` : '苦手を復習', stock ? '間違えた国だけ出題' : '間違えた国がここに溜まる', stock ? '2回連続正解でクリア' : '', 'review', () => App().startReview())),
        h('div.tips', h('p', '💡 図鑑をタップすると、その国の代表・選手・クラブが詳しく見られます。'))
      );
      this.show(node, 'home');
    },
    ticket(ic, title, sub, tag, cls, onclick) {
      return h('button.ticket', { class: cls, onclick: () => { Sfx.play('click'); Haptic.tap(); onclick(); } }, h('div.tk-ic', ic), h('div.tk-main', h('b', title), h('small', sub)), tag ? h('div.tk-tag', tag) : null, h('div.tk-arrow', '›'));
    },
    soloSetup() {
      const o = { count: 10, diff: 'normal', types: null };
      const seg = (opts, get, set) => { const el = h('div.seg'); const draw = () => el.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); draw(); Sfx.play('click'); } }, l))); draw(); return el; };
      const typeChips = h('div.chips'); const all = ['flag', 'capital', 'player', 'club', 'rank', 'nick', 'legend', 'fact']; let sel = new Set(all);
      const drawT = () => typeChips.replaceChildren(...all.map(t => h('button.chip', { class: sel.has(t) ? 'on' : '', onclick: () => { if (sel.has(t)) { if (sel.size > 1) sel.delete(t); } else sel.add(t); drawT(); } }, Q().TYPES[t].icon + ' ' + TYPE_LABEL(t)))); drawT();
      this.sheet(h('div',
        h('label.lbl', '問題数'), seg([[5, '5問'], [10, '10問'], [20, '20問']], () => o.count, v => o.count = v),
        h('label.lbl', '難易度'), seg([['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']], () => o.diff, v => o.diff = v),
        h('label.lbl', '出題カテゴリ'), typeChips,
        h('button.btn.primary.big', { onclick: () => { this.closeSheet(); App().startSolo({ count: o.count, diff: o.diff, types: [...sel] }); } }, 'スタート')), { title: 'ひとりで特訓' });
    },
    // ---------- VS ----------
    vs(mode) {
      const codeInp = h('input.input.code', { type: 'text', maxlength: 6, placeholder: '合言葉 6文字', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, oninput: e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); } });
      const modeCard = (m, ic, t, d, pts) => h('button.modecard', { class: m === mode ? 'on' : '', onclick: () => { Sfx.play('click'); App().vsChoose(m); } }, h('div.mc-ic', ic), h('div.mc-main', h('b', t), h('small', d)), h('div.mc-pts', pts));
      const node = h('div.vs',
        h('h1.h1', '対戦'),
        h('div.modes',
          modeCard('speed', '⚡', '早押しバトル', '同じ問題に同時回答。速いほど高得点', '10〜20問'),
          modeCard('turn', '🃏', '出題バトル', '交互に出題。ヒントを開くほど点が減る', '交互に3問ずつ〜')),
        h('div.card',
          h('h3', '部屋をつくる'), h('p.muted', '合言葉を相手に送る。別のスマホ同士でつながります。'),
          h('button.btn.primary.big', { onclick: () => App().hostRoom() }, '部屋をつくる')),
        h('div.card',
          h('h3', '部屋に入る'), h('p.muted', '相手から届いた合言葉を入力。'),
          h('div.row', codeInp, h('button.btn', { onclick: () => { const v = codeInp.value.trim(); if (v.length !== 6) { KM.u.Fx.shake(codeInp); return; } App().joinRoom(v); } }, '入る'))),
        mode === 'turn' ? h('div.card.sub',
          h('h3', '1台で交互にプレー'), h('p.muted', 'スマホを渡し合って出題バトル。通信不要。'),
          h('button.btn', { onclick: () => this.hotseatSetup() }, 'はじめる')) : null,
        h('p.note', '通信はスマホ同士の直接接続（WebRTC）。同じWi-Fiでも別回線でもOK。つながらない時は両方ブラウザを再読み込みしてから、もう一度。')
      );
      this.show(node, 'vs');
    },
    hotseatSetup() {
      const me = S().profile; const p2 = h('input.input', { type: 'text', maxlength: 12, placeholder: '相手のなまえ', value: '' });
      let rounds = 6; const seg = h('div.seg'); const draw = () => seg.replaceChildren(...[4, 6, 8, 10].map(n => h('button', { class: rounds === n ? 'on' : '', onclick: () => { rounds = n; draw(); } }, n + '問'))); draw();
      this.sheet(h('div', h('p.muted', `${me.avatar} ${me.name} が先に出題します。`), h('label.lbl', '相手のなまえ'), p2, h('label.lbl', '合計ラウンド（交互に出題）'), seg,
        h('button.btn.primary.big', { onclick: () => { this.closeSheet(); App().startHotseat({ p1: me.name, a1: me.avatar, p2: p2.value.trim() || 'プレイヤー2', a2: '🙂', rounds }); } }, 'キックオフ')), { title: '1台で交互にプレー' });
    },
    lobby(L) {
      const isHost = L.role === 'host'; const s = L.settings; const me = S().profile; const Net = KM.Net;
      const seg = (opts, val, k) => h('div.seg', { class: isHost ? '' : 'ro' }, ...opts.map(([v, l]) => h('button', { class: val === v ? 'on' : '', onclick: () => isHost && App().setSetting(k, v) }, l)));
      const status = L.status === 'creating' ? '部屋を準備中…' : L.status === 'waiting' ? '相手の参加を待っています…' : L.status === 'joining' ? '部屋に接続中…' : null;
      const other = isHost ? L.guest : L.host;
      const players = h('div.players',
        h('div.pl.me', h('span.av', me.avatar), h('b', me.name), h('small', isHost ? 'ホスト' : 'ゲスト')),
        h('div.vsmark', 'VS'),
        other ? h('div.pl.rival', h('span.av', other.avatar), h('b', other.name), h('small', isHost ? (L.guestReady ? '準備OK ✓' : '準備中') : 'ホスト')) : h('div.pl.empty', h('span.av', '？'), h('b', '待機中'), h('small', status || ''))
      );
      const settings = h('div.card.settings', h('h3', s.mode === 'speed' ? '⚡ 早押しバトル' : '🃏 出題バトル', isHost ? null : h('small.muted', '　ホストが設定'))
        , isHost ? seg([['speed', '早押し'], ['turn', '出題']], s.mode, 'mode') : null
        , s.mode === 'speed' ? [h('label.lbl', '問題数'), seg([[10, '10問'], [15, '15問'], [20, '20問']], s.count, 'count')] : [h('label.lbl', 'ラウンド数（交互）'), seg([[4, '4'], [6, '6'], [8, '8'], [10, '10']], s.rounds, 'rounds'), h('label.lbl', '制限時間'), seg([[60, '60秒'], [90, '90秒'], [120, '120秒']], s.limit, 'limit')]
        , h('label.lbl', '難易度'), seg([['easy', 'かんたん'], ['normal', 'ふつう'], ['hard', 'むずかしい']], s.diff, 'diff')
        , s.mode === 'speed' ? [h('label.lbl', 'カテゴリ'), h('div.chips', { class: isHost ? '' : 'ro' }, ...['flag', 'capital', 'player', 'club', 'rank', 'nick', 'legend', 'fact'].map(t => h('button.chip', { class: s.types.includes(t) ? 'on' : '', onclick: () => isHost && App().setSetting('type', t) }, Q().TYPES[t].icon + ' ' + TYPE_LABEL(t))))] : null
      );
      const codeBox = L.code ? h('div.card.codebox',
        h('small.muted', '合言葉'), h('div.bigcode', L.code),
        isHost ? h('img.qr', { src: Net.qrUrl(Net.shareUrl(L.code)), alt: 'QRコード', width: 160, height: 160, loading: 'lazy', onerror: e => { e.target.style.display = 'none'; } }) : null,
        isHost ? h('div.row', h('button.btn', { onclick: () => App().share() }, '📤 招待を送る'), h('button.btn', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(Net.shareUrl(L.code)).then(() => toast('リンクをコピーしました')); } }, '🔗 リンク')) : null,
        Net.latency != null ? h('small.muted', `接続中 ・ 応答 ${Net.latency}ms`) : null) : null;
      const action = isHost
        ? h('button.btn.primary.big', { disabled: !(L.guest && L.guestReady), onclick: () => App().kickoff() }, L.guest ? (L.guestReady ? 'キックオフ！' : '相手の準備を待っています') : '相手の参加を待っています')
        : h('button.btn.primary.big', { class: L.ready ? 'ready' : '', disabled: L.status !== 'connected', onclick: () => App().toggleReady() }, L.ready ? '準備OK ✓（タップで取消）' : '準備OK にする');
      const node = h('div.lobby', h('div.topbar', h('button.iconbtn', { onclick: () => App().leaveRoom() }, '‹ 退出'), h('h1.h1', '対戦ルーム')), players, codeBox, settings, action,
        isHost && L.guest && !L.guestReady ? h('p.note', '相手が「準備OK」を押すと開始できます。') : null);
      this.show(node, 'lobby');
    },
    // ---------- codex ----------
    codex(filter) {
      filter = filter || 'all'; const s = S(); const stock = s.stock;
      const chips = h('div.chips', ...[['all', 'すべて'], ['locked', '未解放'], ['stock', '苦手'], ['q26', 'W杯2026出場']].map(([k, l]) => h('button.chip', { class: k === filter ? 'on' : '', onclick: () => this.codex(k) }, l)));
      const total = Q().all.length, unlocked = KM.Store.unlockedCount();
      const sections = Q().REGIONS.map(r => {
        let list = Q().all.filter(c => c.r === r);
        if (filter === 'locked') list = list.filter(c => !KM.Store.stars(c.id)); if (filter === 'stock') list = list.filter(c => stock[c.id]); if (filter === 'q26') list = list.filter(c => c.q26);
        if (!list.length) return null;
        return h('section.region', h('h3', r, h('small.muted', ` ${list.filter(c => KM.Store.stars(c.id)).length}/${list.length}`)),
          h('div.stickers', ...list.map((c, i) => { const st = KM.Store.stars(c.id); return h('button.sticker', { class: (st ? 'on' : 'locked') + (stock[c.id] ? ' weak' : '') + (i % 3 === 1 ? ' tilt' : ''), onclick: () => App().openCountry(c.id) }, h('span.sf', st ? c.f : '❔'), h('span.sn', st ? c.ja : '？？？'), st ? h('span.ss', '★'.repeat(st)) : null, stock[c.id] ? h('span.sw', '苦手') : null); })));
      });
      const node = h('div.codex', h('h1.h1', '図鑑', h('small.muted', ` ${unlocked}/${total}`)), h('div.progress', h('i', { style: { width: Math.round(unlocked / total * 100) + '%' } })), chips, ...sections.filter(Boolean), h('p.note', '正解した国が解放されます。★は正解数で増えます。'));
      this.show(node, 'codex');
    },
    country(cid) {
      const c = Q().byId[cid]; if (!c) return; const s = S(); const m = s.mastery[cid], st = KM.Store.stars(cid), stock = s.stock[cid]; const strength = Q().strength(c);
      const row = (k, v) => h('div.kv', h('span.k', k), h('span.v', v));
      const body = h('div.country',
        h('div.c-hero', h('div.c-flag', c.f), h('div', h('h2', c.ja), h('div.muted', `${c.en}　${c.r}（${c.cf}）`), h('div.badges', c.q26 ? h('span.badge.gold', 'W杯2026出場') : null, h('span.badge', `FIFA ${c.ra ? '約' : ''}${c.rank}位`), st ? h('span.badge.mint', '★'.repeat(st)) : h('span.badge', '未解放'), stock ? h('span.badge.red', `苦手 ×${stock.n}`) : null))),
        h('div.card', h('h3', '基本'), row('首都', c.cap), row('人口', c.pop), row('愛称', c.nick), row('強さ', h('span', this.stars(strength), h('small.muted', `　FIFA${c.rank}位（2026年7月付）`)))),
        h('div.card', h('h3', 'サッカーの特徴'), h('p', c.style), h('h4', 'W杯の実績'), h('p', c.wc)),
        h('div.card', h('h3', '代表的な選手'), ...c.pl.map(p => h('div.player', h('div.pl-head', h('span.pos', { class: p[1] }, p[1]), h('b', p[0])), h('div.pl-sub', h('span.club', p[2]), h('span.trait', p[3]))))),
        c.lg.length ? h('div.card', h('h3', 'レジェンド'), ...c.lg.map(l => h('div.legend', h('b', l[0]), h('small', l[1])))) : null,
        h('div.card', h('h3', 'リーグとクラブ'), h('p.muted', c.league), h('div.chips.static', ...c.clubs.map(x => h('span.chip', x)))),
        h('div.card', h('h3', '豆知識'), h('p', c.tr)),
        m ? h('div.card', h('h3', 'あなたの記録'), row('出題', `${m.seen}回`), row('正解', `${m.ok}回`), row('不正解', `${m.ng}回`), m.first ? row('初正解', fmtDate(m.first)) : null) : h('p.note', 'まだ出題されていません。'),
        h('p.note', '所属クラブは2026年夏時点。移籍で変わることがあります。'));
      this.sheet(body, { title: '図鑑' });
    },
    // ---------- record ----------
    record(filter) {
      filter = filter || 'all'; const s = S(), st = s.stats; const acc = st.q ? Math.round(st.ok / st.q * 100) : 0;
      const stat = (v, l) => h('div.qs', h('b', v), h('small', l));
      const byT = h('div.bytype', ...Object.entries(st.byType).map(([t, v]) => h('div.btrow', h('span', Q().TYPES[t] ? Q().TYPES[t].icon + ' ' + TYPE_LABEL(t) : t), h('div.bar', h('i', { style: { width: Math.round(v.ok / v.q * 100) + '%' } })), h('small', `${Math.round(v.ok / v.q * 100)}%（${v.q}問）`))));
      const stockList = KM.Store.stockList();
      const stockEl = h('div.card.stockcard', h('h3', '苦手ストック', h('small.muted', ` ${stockList.length}カ国`)), stockList.length ? [h('div.stocklist', ...stockList.slice(0, 24).map(x => { const c = Q().byId[x.cid]; return h('button.stockitem', { onclick: () => App().openCountry(x.cid) }, h('span.f', c.f), h('span', c.ja), h('span.n', `×${x.n}`), x.wins ? h('span.w', `あと${2 - x.wins}`) : null); })), h('button.btn.primary', { onclick: () => App().startReview() }, `復習する（${Math.min(10, Math.max(5, stockList.length * 2))}問）`)] : h('p.muted', '間違えた国がここに溜まります。2回連続で正解するとクリア。'));
      const achs = KM.Store.ACH; const got = s.ach;
      const achEl = h('div.card', h('h3', '実績', h('small.muted', ` ${Object.keys(got).length}/${achs.length}`)), h('div.achgrid', ...achs.map(a => h('div.ach', { class: got[a.id] ? 'on' : '', title: a.desc }, h('span.ai', got[a.id] ? a.icon : '🔒'), h('small', a.name)))));
      const rivals = Object.entries(s.rivals).sort((a, b) => b[1].last - a[1].last);
      const rivalEl = rivals.length ? h('div.card', h('h3', 'ライバル戦績'), ...rivals.map(([n, r]) => h('div.rival', h('b', n), h('span', `${r.w}勝 ${r.l}敗 ${r.d}分`), h('small.muted', fmtDate(r.last))))) : null;
      let hist = s.history; if (filter === 'ng') hist = hist.filter(x => !x.ok); else if (filter !== 'all') hist = hist.filter(x => x.mode === filter);
      const chips = h('div.chips', ...[['all', 'すべて'], ['ng', '間違い'], ['speed', '早押し'], ['turn', '出題'], ['solo', 'ひとり'], ['review', '復習']].map(([k, l]) => h('button.chip', { class: k === filter ? 'on' : '', onclick: () => this.record(k) }, l)));
      const histEl = h('div.hist', ...hist.slice(0, 80).map(x => { const c = Q().byId[x.cid]; const a = x.ans && Q().byId[x.ans]; return h('button.hrow', { class: x.ok ? 'ok' : 'ng', onclick: () => App().openCountry(x.cid) }, h('span.hf', c ? c.f : '🏳️'), h('div.hm', h('b', c ? c.ja : x.cid), h('small', `${Q().TYPES[x.type] ? TYPE_LABEL(x.type) : x.type}${!x.ok && a ? `　→ 答えた: ${a.ja}` : ''}${x.hints ? `　ヒント${x.hints}` : ''}`)), h('div.hr', h('b', x.ok ? `+${x.pts}` : '✕'), h('small', x.ms != null && x.ok ? fmtMs(x.ms) : '', ' ', fmtDate(x.t)))); }), hist.length ? null : h('p.muted', 'まだ記録がありません。'));
      const node = h('div.record', h('h1.h1', '記録'),
        h('div.quick', stat(st.q, '回答数'), stat(acc + '%', '正答率'), stat(st.bestStreak, '最大コンボ'), stat(st.bestMs ? fmtMs(st.bestMs) : '—', '最速')),
        h('div.quick', stat(`${st.wins}勝${st.losses}敗`, '対戦'), stat(st.matches, '試合'), stat(st.daily.days || 0, 'プレー日数'), stat(st.xp.toLocaleString(), 'XP')),
        stockEl, st.q ? h('div.card', h('h3', 'カテゴリ別の正答率'), byT) : null, achEl, rivalEl,
        h('div.card', h('h3', '回答の履歴'), chips, histEl));
      this.show(node, 'record');
    },
    // ---------- settings ----------
    settings() {
      const p = S().profile; let avatar = p.avatar; const inp = h('input.input', { type: 'text', maxlength: 12, value: p.name });
      const grid = h('div.avgrid'); const draw = () => grid.replaceChildren(...AVATARS.map(a => h('button.av', { class: a === avatar ? 'on' : '', onclick: () => { avatar = a; draw(); } }, a))); draw();
      const tog = (label, key) => h('label.toggle', h('span', label), h('input', { type: 'checkbox', checked: !!p[key], onchange: e => { App().saveProfile({ [key]: e.target.checked }); } }), h('i'));
      const file = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' }, onchange: e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { KM.Store.importJSON(r.result); toast('読み込みました'); this.closeSheet(); App().nav('home'); } catch (err) { toast('ファイルを読み込めませんでした'); } }; r.readAsText(f); } });
      this.sheet(h('div',
        h('label.lbl', 'なまえ'), inp, h('label.lbl', 'アイコン'), grid,
        tog('効果音', 'sound'), tog('振動（対応端末のみ）', 'haptic'),
        h('button.btn.primary.big', { onclick: () => { const n = inp.value.trim(); if (!n) { KM.u.Fx.shake(inp); return; } App().saveProfile({ name: n, avatar }); this.closeSheet(); App().nav('home'); toast('保存しました'); } }, '保存'),
        h('div.row', h('button.btn.small', { onclick: () => { const b = new Blob([KM.Store.exportJSON()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: 'kunimaster-backup.json' }); document.body.appendChild(a); a.click(); a.remove(); } }, '記録を書き出す'), h('button.btn.small', { onclick: () => file.click() }, '記録を読み込む'), file),
        h('button.btn.small.danger', { onclick: () => { if (confirm('すべての記録を消去します。よろしいですか？')) { KM.Store.reset(); this.closeSheet(); location.reload(); } } }, '記録をすべて消す'),
        h('p.note', 'クニマスター v1.0　データは端末内（ブラウザ）にだけ保存されます。')), { title: '設定' });
    }
  };
  KM.UI = UI;
})(window.KM);
