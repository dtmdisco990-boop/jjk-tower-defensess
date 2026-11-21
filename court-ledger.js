/* RISE OF JAHJUAN: exact ledgers. Ring buffers with integer fixed-point sums (exact eviction, no float drift),
   the 1,440-tick control budget, the Hanging Scales, the Standing Record, and the canonical trace hash chain.
   Headless: no DOM, no timers, no randomness. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const CD = JJK.CourtData, C = CD.C;
  const FX = C.FX;
  const toFx = (hp) => Math.round(hp * FX); // fixed-point HP: integers below 2^53, so running sums are exact

  /** Rolling per-key sums over the last W counted ticks. advance() once per counted tick evicts exactly one bucket. */
  class Ring {
    constructor(W) { this.W = W; this.pos = 0; this.keys = new Map(); }
    slot(k) { let s = this.keys.get(k); if (!s) { s = { buf: new Float64Array(this.W), sum: 0 }; this.keys.set(k, s); } return s; }
    advance() {
      this.pos++;
      const i = this.pos % this.W;
      for (const s of this.keys.values()) { const v = s.buf[i]; if (v) { s.sum -= v; s.buf[i] = 0; } }
    }
    add(k, fx) { if (!fx) return; const s = this.slot(k); s.buf[this.pos % this.W] += fx; s.sum += fx; }
    sum(k) { const s = this.keys.get(k); return s ? s.sum : 0; }
    hp(k) { return this.sum(k) / FX; }
    /** winner by largest sum; ties broken by the order given; null when everything is zero */
    top(order) { let best = null, bv = 0; for (const k of order) { const v = this.sum(k); if (v > bv) { bv = v; best = k; } } return best; }
    totals(order) { const o = {}; for (const k of order) o[k] = this.sum(k); return o; }
    clear() { this.keys.clear(); }
  }

  /** Control budget: lost movement in 1/1024-tick units over the last 1,440 ticks, capped at 240 ticks. */
  class Budget {
    constructor() { this.buf = new Int32Array(C.BUDGET_WINDOW); this.pos = 0; this.sum = 0; this.cap = C.BUDGET * FX; }
    /** Move to the next tick, evicting the entry from 1,440 ticks ago. */
    advance() { this.pos = (this.pos + 1) % C.BUDGET_WINDOW; this.sum -= this.buf[this.pos]; this.buf[this.pos] = 0; }
    room() { return this.cap - this.sum; }
    /** Charge up to `want` (fx units) this tick; returns what was actually charged. */
    charge(want) { const c = Math.max(0, Math.min(want | 0, this.room())); this.buf[this.pos] += c; this.sum += c; return c; }
    spent() { return this.sum >= this.cap; }
    lostTicks() { return this.sum / FX; }
  }

  /** Hanging Scales: weights per axis from invested capital plus the 6-second conveyance memory. */
  const Scales = {
    weigh(units, sales, tick) {
      const w = { N: 0, S: 0, W: 0, E: 0 };
      for (const u of units) { const bn = CD.benchAt(u.c, u.r); if (!bn) continue; w[bn.ns] += u.invested; w[bn.we] += u.invested; }
      for (const s of sales) {
        if (tick - s.tick >= C.CONVEYANCE) continue;
        const bn = CD.benchAt(s.c, s.r); if (!bn) continue;
        const v = s.investedAtSale * C.CONVEYANCE_SHARE; w[bn.ns] += v; w[bn.we] += v;
      }
      const axis = (a, b) => {
        const hi = Math.max(w[a], w[b]), lo = Math.min(w[a], w[b]), tot = hi + lo;
        const rho = tot > 0 ? (hi - lo) / tot : 0;
        return { rho, share: tot > 0 ? hi / tot : 0.5, list: tot > 0 && rho > C.LIST_RHO ? (w[a] > w[b] ? a : b) : null };
      };
      const ns = axis('N', 'S'), we = axis('W', 'E');
      return { w, ns: ns.list, we: we.list, rhoNS: ns.rho, rhoWE: we.rho, shareN: (w.N + w.S) ? w.N / (w.N + w.S) : 0.5, shareW: (w.W + w.E) ? w.W / (w.W + w.E) : 0.5 };
    },
    depth(list, gallery) { const g = CD.GALLERY[gallery]; return (list && list.ns === g.ns ? 1 : 0) + (list && list.we === g.we ? 1 : 0); },
  };

  /** The Standing Record: immutable rows, Citations per gallery, theta(D). */
  class Record {
    constructor() { this.rows = []; this.cit = { NW: 0, SW: 0, NE: 0, SE: 0 }; }
    theta(g) { return CD.theta(this.cit[g] || 0); }
    write(row) { const r = Object.freeze(Object.assign({}, row)); this.rows.push(r); return r; }
    cite(g, n) { if (this.cit[g] != null) this.cit[g] += n || 1; }
    total() { return this.cit.NW + this.cit.SW + this.cit.NE + this.cit.SE; }
    row(phase) { for (const r of this.rows) if (r.phase === phase) return r; return null; }
    estopped() {
      const c = this.cit; if (c.NW === c.SW && c.SW === c.NE && c.NE === c.SE) return null; // Unanimous Bench
      let best = null; for (const g of CD.GALLERIES) if (best === null || c[g] > c[best]) best = g; return best;
    }
  }

  /** Canonical serialisation + rolling 2x32-bit FNV-1a hash ("identical run" = identical final hash). */
  const KEYS = ['tick', 'phase', 'reading', 'measure', 'localTick', 'event', 'district', 'doctrine', 'charId', 'uid', 'snapshot', 'value', 'required', 'reason'];
  function canon(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
    if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    const ks = Object.keys(v).sort();
    return '{' + ks.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  class Chain {
    constructor() { this.a = 2166136261 >>> 0; this.b = 0x9747b28c >>> 0; this.n = 0; this.checkpoints = []; }
    feed(entry) {
      let s = '';
      for (const k of KEYS) s += canon(entry[k]) + '|';
      let a = this.a, b = this.b;
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a ^= c; a = Math.imul(a, 16777619) >>> 0; b ^= c + i; b = Math.imul(b, 2246822519) >>> 0; }
      this.a = a; this.b = b; this.n++;
    }
    value() { return ('00000000' + this.a.toString(16)).slice(-8) + ('00000000' + this.b.toString(16)).slice(-8); }
    checkpoint(label, tick) { this.checkpoints.push({ label, tick, hash: this.value(), n: this.n }); }
  }

  JJK.CourtLedger = { Ring, Budget, Scales, Record, Chain, canon, toFx, KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
