/* KuniMaster — net: room transport (PeerJS WebRTC / BroadcastChannel) */
window.KM = window.KM || {};
(function (KM) {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  const ICE = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ], sdpSemantics: 'unified-plan'
  };
  const PEER_OPTS = { debug: 0, config: ICE, pingInterval: 4000 };
  const pid = code => 'kunimaster-' + code;

  // ---------- Peer transport ----------
  class PeerTransport {
    constructor(ev) { this.ev = ev; this.peer = null; this.conn = null; this.closed = false; }
    host(code) {
      return new Promise((resolve, reject) => {
        if (!window.Peer) return reject(new Error('peerjs'));
        const p = this.peer = new Peer(pid(code), PEER_OPTS); let opened = false;
        p.on('open', () => { opened = true; resolve(code); });
        p.on('connection', c => { if (this.conn && this.conn.open) { try { c.close(); } catch (e) { } return; } this.attach(c); });
        p.on('error', e => { if (!opened) reject(e); else this.ev.error && this.ev.error(e); });
        p.on('disconnected', () => { if (!this.closed) { try { p.reconnect(); } catch (e) { } } });
      });
    }
    join(code) {
      return new Promise((resolve, reject) => {
        if (!window.Peer) return reject(new Error('peerjs'));
        const p = this.peer = new Peer(undefined, PEER_OPTS); let done = false;
        const fail = e => { if (!done) { done = true; reject(e); } };
        p.on('open', () => {
          const c = p.connect(pid(code), { reliable: true, serialization: 'json' });
          const t = setTimeout(() => fail(new Error('timeout')), 15000);
          c.on('open', () => { clearTimeout(t); done = true; this.attach(c); resolve(); });
          c.on('error', e => { clearTimeout(t); fail(e); });
        });
        p.on('error', e => { fail(e); if (done && this.ev.error) this.ev.error(e); });
      });
    }
    attach(c) {
      this.conn = c; this.ev.open && this.ev.open();
      c.on('data', d => { if (d && typeof d === 'object') this.ev.msg && this.ev.msg(d); });
      c.on('close', () => { if (this.conn === c) { this.conn = null; if (!this.closed) this.ev.close && this.ev.close(); } });
      c.on('error', e => this.ev.error && this.ev.error(e));
    }
    send(o) { if (this.conn && this.conn.open) { try { this.conn.send(o); return true; } catch (e) { } } return false; }
    get open() { return !!(this.conn && this.conn.open); }
    close() { this.closed = true; try { this.conn && this.conn.close(); } catch (e) { } try { this.peer && this.peer.destroy(); } catch (e) { } this.conn = null; this.peer = null; }
  }

  // ---------- BroadcastChannel transport (same browser, two tabs; used for tests / demos) ----------
  class BCTransport {
    constructor(ev) { this.ev = ev; this.bc = null; this.role = null; this.peerOpen = false; this.closed = false; }
    host(code) { this.role = 'host'; this.bc = new BroadcastChannel('kunimaster-' + code); this.bc.onmessage = e => this.recv(e.data); return Promise.resolve(code); }
    join(code) {
      this.role = 'guest'; this.bc = new BroadcastChannel('kunimaster-' + code); this.bc.onmessage = e => this.recv(e.data);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 8000);
        this.onJoined = () => { clearTimeout(t); resolve(); };
        this.bc.postMessage({ __from: 'guest', t: '__join' });
      });
    }
    recv(d) {
      if (!d || d.__from === this.role) return;
      if (d.t === '__join' && this.role === 'host') { this.peerOpen = true; this.bc.postMessage({ __from: 'host', t: '__joined' }); this.ev.open && this.ev.open(); return; }
      if (d.t === '__joined' && this.role === 'guest') { this.peerOpen = true; this.onJoined && this.onJoined(); this.ev.open && this.ev.open(); return; }
      if (d.t === '__bye') { this.peerOpen = false; this.ev.close && this.ev.close(); return; }
      this.ev.msg && this.ev.msg(d);
    }
    send(o) { if (!this.bc) return false; this.bc.postMessage(Object.assign({ __from: this.role }, o)); return true; }
    get open() { return this.peerOpen; }
    close() { this.closed = true; try { this.bc && this.bc.postMessage({ __from: this.role, t: '__bye' }); this.bc && this.bc.close(); } catch (e) { } this.bc = null; }
  }

  const Net = {
    impl: (location.search.match(/[?&]net=(bc)/) || [])[1] || 'peer',
    t: null, code: null, role: null, ev: {}, latency: null, pingTimer: null,
    available() { return this.impl === 'bc' || !!window.Peer; },
    on(ev) { this.ev = Object.assign(this.ev, ev); },
    make() { const ev = { open: () => this.ev.open && this.ev.open(), close: () => this.ev.close && this.ev.close(), error: e => this.ev.error && this.ev.error(e), msg: d => this.handle(d) }; return this.impl === 'bc' ? new BCTransport(ev) : new PeerTransport(ev); },
    async host() {
      this.close(); this.role = 'host';
      for (let tries = 0; tries < 4; tries++) {
        const code = genCode(); this.t = this.make();
        try { await this.t.host(code); this.code = code; this.startPing(); return code; }
        catch (e) { this.t.close(); if (!(e && e.type === 'unavailable-id')) throw e; }
      }
      throw new Error('room');
    },
    async join(code) {
      this.close(); this.role = 'guest'; code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) throw new Error('code');
      this.t = this.make(); await this.t.join(code); this.code = code; this.startPing(); return code;
    },
    send(o) { return this.t ? this.t.send(o) : false; },
    handle(d) {
      if (d.t === '__ping') { this.send({ t: '__pong', s: d.s }); return; }
      if (d.t === '__pong') { this.latency = Date.now() - d.s; this.ev.latency && this.ev.latency(this.latency); return; }
      this.ev.msg && this.ev.msg(d);
    },
    startPing() { clearInterval(this.pingTimer); this.pingTimer = setInterval(() => { if (this.open) this.send({ t: '__ping', s: Date.now() }); }, 5000); },
    get open() { return !!(this.t && this.t.open); },
    close() { clearInterval(this.pingTimer); if (this.t) { this.t.close(); this.t = null; } this.code = null; this.latency = null; },
    shareUrl(code) { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', code); if (this.impl === 'bc') u.searchParams.set('net', 'bc'); return u.toString(); },
    qrUrl(text) { return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(text); }
  };
  if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', () => { try { if (Net.t) { Net.send({ t: 'bye' }); Net.close(); } } catch (e) { } });
  KM.Net = Net;
})(window.KM);
