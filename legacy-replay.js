/* Legacy replay probe: fixed-seed battles on tokyo, shibuya, shinjuku and skibrib driven by a fixed command script.
   Produces a per-second state hash and the final summary. Run against a pristine copy of the game to make
   tests/fixtures/legacy-replay.json, then tests/court-isolation.test.js asserts the current code reproduces it bit for bit.
   usage: node tests/dev/legacy-replay.js <gameRoot> [out.json] */
const path = require('path');
function fnv(h, s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function run(J, mapId, diff, team, seed, plan, ticks) {
  const b = new J.Battle({ mapId, diff, team: team.map((id) => ({ id, level: 12, stars: 2 })), seed });
  b.autoStart = true;
  const slots = [...b.geo.slots.values()].sort((a, z) => a.c - z.c || a.r - z.r);
  let h = 2166136261 >>> 0; const hashes = [];
  for (let t = 0; t < ticks && !b.over; t++) {
    const cmd = plan[t];
    if (cmd) {
      if (cmd.place) { const id = team[cmd.place % team.length]; for (const s of slots.slice(cmd.at % slots.length).concat(slots)) if (b.place(id, s.c, s.r).ok) break; }
      if (cmd.up) { const u = b.units[cmd.up % Math.max(1, b.units.length)]; if (u) b.upgrade(u); }
      if (cmd.tgt) { const u = b.units[cmd.tgt % Math.max(1, b.units.length)]; if (u) b.setTargeting(u, J.Battle.TARGET_MODES[cmd.tgt % 5]); }
      if (cmd.sell) { const u = b.units[cmd.sell % Math.max(1, b.units.length)]; if (u) b.sell(u); }
      if (cmd.dom) { for (const u of b.units) if (b.activateDomain(u)) break; }
      if (cmd.start) b.startWave();
    }
    b.update(J.Balance.STEP);
    if (t % 60 === 0) {
      let s = b.time.toFixed(6) + '|' + b.yen + '|' + b.baseHp + '|' + b.wave + '|' + b.rng.next.length;
      for (const e of b.enemies) s += ';' + e.id + ',' + e.x.toFixed(4) + ',' + e.y.toFixed(4) + ',' + e.hp.toFixed(4);
      for (const u of b.units) s += ';u' + u.uid + ',' + u.damageDealt.toFixed(4) + ',' + u.level;
      h = fnv(h, s); hashes.push(h);
    }
  }
  return { mapId, seed, final: h, hashes: hashes.length, summary: b.getSummary() };
}
function plan(seed) {
  const p = {}; let s = seed >>> 0; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  p[1] = { place: 0, at: 3 }; p[2] = { place: 1, at: 9 }; p[3] = { start: 1 };
  for (let t = 120; t < 30000; t += 90) { const x = r(); if (x < 0.3) p[t] = { place: Math.floor(r() * 7), at: Math.floor(r() * 99) }; else if (x < 0.55) p[t] = { up: Math.floor(r() * 16) }; else if (x < 0.62) p[t] = { tgt: Math.floor(r() * 50) }; else if (x < 0.64) p[t] = { sell: Math.floor(r() * 16) }; else if (x < 0.7) p[t] = { dom: 1 }; }
  return p;
}
function main(root, out) {
  const J = require(path.join(root, 'tests/load.js')).loadGame();
  const team = ['yuji', 'panda', 'nobara', 'megumi', 'todo', 'gojo', 'inumaki'];
  const runs = [];
  for (const [m, d, seed] of [['tokyo', 'normal', 11], ['shibuya', 'hard', 22], ['shinjuku', 'normal', 33], ['skibrib', 'skibrib', 44]]) runs.push(run(J, m, d, team, seed, plan(seed), 24000));
  const res = { generated: 'legacy replay probe', runs };
  if (out) require('fs').writeFileSync(out, JSON.stringify(res, null, 1));
  return res;
}
module.exports = { main };
if (require.main === module) { const r = main(path.resolve(process.argv[2] || '.'), process.argv[3]); for (const x of r.runs) console.log(x.mapId, x.final, x.hashes, x.summary.wave, x.summary.victory); }
