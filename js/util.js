/* KuniMaster — util: DOM / RNG / SFX / haptics / FX */
window.KM = window.KM || {};
(function (KM) {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // h('div.cls#id', {attrs}, ...children)
  function h(tag, attrs, ...children) {
    if (attrs != null && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) m[2].match(/[.#][\w-]+/g).forEach(t => t[0] === '.' ? el.classList.add(t.slice(1)) : (el.id = t.slice(1)));
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k.startsWith('data-')) el.setAttribute(k, v);
      else if (k in el && k !== 'list') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    }
    const add = c => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // deterministic RNG
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function seedFrom(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function shuffle(arr, rnd) { rnd = rnd || Math.random; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pick = (arr, rnd) => arr[Math.floor((rnd || Math.random)() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const fmtMs = ms => ms == null ? '—' : (ms / 1000).toFixed(2) + '秒';
  const fmtDate = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayKey = ts => { const d = new Date(ts || Date.now()); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // text normalization for search (カタカナ→ひらがな, 全角→半角, 小文字)
  function kana(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[\s・･、,.'’\-‐ー]/g, '');
  }

  // ---------- SFX (WebAudio synth, no assets) ----------
  const Sfx = {
    ctx: null, enabled: true,
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    tone(f, dur, type, gain, at, slide) {
      if (!this.ctx || !this.enabled) return;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, c.currentTime + at);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + at + dur);
      g.gain.setValueAtTime(0.0001, c.currentTime + at);
      g.gain.exponentialRampToValueAtTime(gain || 0.2, c.currentTime + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
      o.connect(g); g.connect(c.destination); o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.02);
    },
    play(name) {
      if (!this.enabled) return; this.unlock(); if (!this.ctx) return;
      switch (name) {
        case 'click': this.tone(1800, 0.03, 'square', 0.05, 0); break;
        case 'tick': this.tone(1000, 0.03, 'square', 0.06, 0); break;
        case 'count': this.tone(880, 0.12, 'sine', 0.25, 0); break;
        case 'go': this.tone(1320, 0.35, 'sine', 0.3, 0); this.tone(1760, 0.3, 'sine', 0.15, 0.05); break;
        case 'correct': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.22, i * 0.07)); break;
        case 'wrong': this.tone(180, 0.28, 'sawtooth', 0.18, 0, 90); break;
        case 'hint': this.tone(700, 0.15, 'sine', 0.15, 0, 420); break;
        case 'lock': this.tone(300, 0.08, 'square', 0.08, 0); break;
        case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.25, i * 0.11)); break;
        case 'lose': [400, 350, 300, 220].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.18)); break;
        case 'level': [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.22, i * 0.09)); break;
        case 'whistle': this.tone(2400, 0.12, 'square', 0.12, 0); this.tone(2600, 0.25, 'square', 0.12, 0.14); break;
        case 'pop': this.tone(600, 0.06, 'sine', 0.12, 0, 900); break;
      }
    }
  };
  const Haptic = {
    enabled: true,
    buzz(p) { if (!this.enabled) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } },
    tap() { this.buzz(10); }, ok() { this.buzz([20, 40, 30]); }, ng() { this.buzz([60, 30, 60]); }, win() { this.buzz([30, 40, 30, 40, 80]); }
  };

  // ---------- FX ----------
  const Fx = {
    canvas: null, parts: [], raf: null,
    ensure() { if (!this.canvas) { this.canvas = document.getElementById('fx'); } const c = this.canvas; if (!c) return null; const r = window.devicePixelRatio || 1; if (c.width !== innerWidth * r) { c.width = innerWidth * r; c.height = innerHeight * r; } return c; },
    confetti(n, opts) {
      const c = this.ensure(); if (!c) return; opts = opts || {};
      const r = window.devicePixelRatio || 1; const cols = opts.colors || ['#f2c14e', '#f3efe4', '#9ff0c0', '#ffb454', '#7cc4ff', '#e5473f'];
      const x0 = (opts.x != null ? opts.x : innerWidth / 2) * r, y0 = (opts.y != null ? opts.y : innerHeight * 0.4) * r;
      for (let i = 0; i < (n || 80); i++) {
        const a = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 9) * r;
        this.parts.push({ x: x0, y: y0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6 * r, g: 0.28 * r, w: (4 + Math.random() * 5) * r, hh: (6 + Math.random() * 6) * r, col: pick(cols), rot: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 70 + Math.random() * 40 });
      }
      if (!this.raf) this.loop();
    },
    loop() {
      const c = this.canvas, ctx = c.getContext('2d');
      const step = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        this.parts = this.parts.filter(p => p.life > 0);
        for (const p of this.parts) {
          p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.rot += p.vr; p.life--;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life / 25); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.hh / 2, p.w, p.hh); ctx.restore();
        }
        if (this.parts.length) this.raf = requestAnimationFrame(step); else { this.raf = null; ctx.clearRect(0, 0, c.width, c.height); }
      };
      this.raf = requestAnimationFrame(step);
    },
    shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); },
    pop(el) { if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  };

  let toastT = null;
  function toast(msg, ms) {
    let t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }
  // count-up animation for numbers
  function countUp(el, to, ms) {
    const from = parseInt(el.textContent.replace(/[^\d-]/g, ''), 10) || 0; const t0 = performance.now(); ms = ms || 600;
    const step = t => { const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  KM.u = { $, $$, h, esc, mulberry32, seedFrom, shuffle, pick, clamp, uid, fmtMs, fmtDate, dayKey, kana, Sfx, Haptic, Fx, toast, countUp };
})(window.KM);
