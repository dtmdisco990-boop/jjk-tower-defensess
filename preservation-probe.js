/* Preservation probe: registry orders, missions, the playable Jahjuan definition, JOAN rarity, and asset bytes.
   usage: node tests/dev/preservation-probe.js <gameRoot> [out.json] */
const path = require('path'), fs = require('fs'), crypto = require('crypto');
function main(root) {
  const J = require(path.join(root, 'tests/load.js')).loadGame();
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
  const fnStr = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? String(v) : v));
  return {
    MapOrder: J.MapOrder, BossOrder: J.BossOrder, CharacterOrder: J.CharacterOrder, EnemyOrder: J.EnemyOrder,
    missions: (J.Missions || []).map((m) => m.id), challenges: (J.Challenges || []).map((c) => c.id),
    characters: Object.keys(J.Characters).sort(), jahjuanDef: fnStr(J.Characters.jahjuan), jahjuanKit: String(J.Kits[J.Characters.jahjuan.kit] && fnStr(J.Kits[J.Characters.jahjuan.kit])),
    joan: fnStr(J.Balance.rarity.JOAN), summonJoan: fnStr(J.Balance.summon || null),
    jahjuanPng: sha('assets/characters/jahjuan.png'),
  };
}
module.exports = { main };
if (require.main === module) { const r = main(path.resolve(process.argv[2] || '.')); if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(r, null, 1)); console.log(Object.keys(r).join(','), r.jahjuanPng.slice(0, 12)); }
