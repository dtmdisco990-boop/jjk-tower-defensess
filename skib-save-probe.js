/* SKIBRIB save-isolation probe: apply a fixed SKIBRIB result (loss then win) to a fresh profile and dump the save.
   usage: node tests/dev/skib-save-probe.js <gameRoot> [out.json] */
const path = require('path');
function main(root) {
  const J = require(path.join(root, 'tests/load.js')).loadGame();
  const sm = new J.SaveManager(new J.Util.MemoryStorage()); sm.load();
  let now = 1700000000000; const p = new J.Profile(sm, { now: () => now });
  p.skibStart();
  const base = { mapId: 'skibrib', diff: 'skibrib', mode: 'story', totalWaves: 75, kills: 300, yenEarned: 4000, baseLost: 15, sold: 2, disabled: 1, upgrades: 9, deploys: 8, domains: 1, bossKills: {}, bossTimes: {}, duration: 900, score: 3000, deployedIds: ['yuji'], loadout: ['yuji', 'panda', 'nobara', 'megumi'], enemiesSeen: ['trollRunner'], bossesSeen: [], baseHp: 0, baseMax: 15, damage: 99999, debug: false, unitStats: [] };
  p.applyMatchResult(Object.assign({}, base, { victory: false, wave: 12, wavesCleared: 11 }), 'skib-probe-1', 7);
  now += 1000; p.skibStart();
  p.applyMatchResult(Object.assign({}, base, { victory: true, wave: 75, wavesCleared: 75, baseHp: 3, bossKills: { skibAbom: 1 }, bossTimes: { skibAbom: 200 } }), 'skib-probe-2', 8);
  const d = JSON.parse(JSON.stringify(p.d));
  return { skibrib: d.skibrib, endless: d.endless, progress: d.progress, challenges: d.challenges, gems: d.currency, player: d.player, bossRecords: d.bossRecords };
}
module.exports = { main };
if (require.main === module) { const r = main(path.resolve(process.argv[2] || '.')); if (process.argv[3]) require('fs').writeFileSync(process.argv[3], JSON.stringify(r, null, 1)); console.log(JSON.stringify(r).slice(0, 400)); }
