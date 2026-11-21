# Jujutsu Kaisen Tower Defense

Static browser game: HTML + CSS + vanilla JS, no build step, no backend, no accounts, no paid APIs. Progress is saved in `localStorage`. Unofficial fan project. Audio is synthesised. Character portraits are the 14 anime cutouts supplied by the project owner (`assets/characters/*.png`, listed in `assets/manifest.json`); they are third-party copyrighted artwork, so keep the project non-commercial/private or replace them before any public deployment. Delete the `characters` entries in the manifest to fall back to the built-in procedural portraits. Enemies and backgrounds are still procedural.

## Run it

```
python3 -m http.server 8123      # any static server works
# open http://localhost:8123/index.html
```
Opening `index.html` directly from disk also works in most browsers; a server is recommended (the optional asset manifest uses `fetch`).

## Deploy to GitHub Pages
1. Push this folder's contents to a repo (`index.html` must be at the repo root).
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/`. No other configuration is needed (all paths are relative).
4. Before a public release set `ALLOW_DEBUG: false` in `js/data/balance.js` so `?debug=1` is ignored.

## Controls
| Input | Action |
|---|---|
| `1`–`6` | Pick a unit from the tray, then click a highlighted tile |
| Click / tap | Place; or select a placed unit. **Touch: tap once to preview, tap the same tile again to confirm** |
| Shift+click | Keep placing the same unit |
| `U` | Upgrade selected unit |
| Panel buttons | Targeting (First / Last / Strongest / Weakest / Closest), Upgrade, Sell (70% refund on NORMAL) |
| `Space` | Start next wave |
| `F` | 1× / 2× speed |
| `A` | Auto-start waves |
| `Shift+1`–`4` | Activate Domain Expansion (or click its button) |
| `P` / `Esc` | Pause / cancel placement, deselect |
| `M` | Mute |

## Features
- **Menu:** PLAY, CHARACTERS, SUMMON, SHOP (unlocks at player Lv 2), INVENTORY, MISSIONS, INDEX, SETTINGS; player level, Coins, Cursed Gems, saved team and daily progress on the main screen.
- **Maps (5):** Tokyo High (15 waves), Detention Center (20), Shibuya Incident (25), Cursed Temple (30), **Shinjuku Gauntlet (45 waves, two merging lanes, 5 bosses; unlocks at Lv 15 + Cursed Temple cleared on HARD)**. Each has its own path, elevated slots and a SPECIAL-difficulty rule (Swift Night, Lockdown, Blackout, King's Aura, Culling Game).
- **Difficulties:** NORMAL / HARD / SPECIAL differ in enemy HP and count, Elites, base HP, starting Yen, sell refund and rewards (×1 / ×1.6 / ×2.4). HARD and SPECIAL are gated by progress.
- **Battle:** placement preview with range, Ground/Air enemies, 5 targeting modes, per-unit upgrade paths, sell, AUTO START, 1×/2×, pause, wave preview, damage numbers, boss bar with cast telegraphs and phases.
- **Characters (28 incl. the JOAN-only Invincible Jahjuan;  Yuji / Panda / Nobara / Megumi start owned; 13 expansion characters are harder to obtain, see below):** COMMON → RARE → EPIC → LEGENDARY → MYTHIC, plus a SPECIAL secret character. Unlock paths: starter, map clear, missions, challenges, boss drops, Summon, shards (Shop / duplicates), and a hidden challenge. Traits give team synergies. Domain Expansions (Megumi, Hakari, Yuta, Gojo) have real battlefield effects.
- **Bosses (8):** Finger Bearer, Jogo, Mahito, Sukuna, plus Hanami, Dagon, Mahoraga and Heian-era Ryomen Sukuna, with telegraphed attacks, phase changes and Index entries. The new four are counter-play bosses: Hanami (retarget the buds), Dagon (burst the Exposed window), Mahoraga (adapts to each unit that damages it; rotate attackers or nullify), Sukuna (Malevolent Shrine must be answered with a Domain clash started inside the warning window).
- **Summon:** standard banner + weekly rotating featured banners + the **Culling Game banner** (expansion roster only, locks until Lv 12 + Cursed Temple cleared, 25 gems / 250 per ×10, hard pity 120); rates shown in-game (base and current with pity); soft + hard pity per banner; Rika banner gives the featured unit 60% of Legendary pulls and guarantees it after a miss; ×10 guarantees RARE+; duplicates convert to shards; skippable reveal animation.
- **Shop:** 3 daily deals + 5 weekly shard offers + permanent supplies, per-period purchase limits, deterministic by UTC day/week.
- **Meta:** player level, character XP / levels (Lv 30), star upgrades (shards + Coins), 37 missions, 3 daily missions per UTC day, 10 challenges (1 hidden), Endless Mode (unlocks at Lv 5 + Tokyo clear) with scaling waves, mutators and records.
- **Systems:** SaveManager (versioned, validated, migrated, previous-slot backup, corrupt-save recovery), AudioManager (master/music/SFX/mute, generative music), replaceable art/audio via `assets/manifest.json`, boot guard with **GAME FAILED TO LOAD** screen (RETRY / RESET SAVE), debug tools hidden unless `?debug=1`.

## Owner Lab (owner-only testing)

A sandbox for testing everything. It ships in the public build but only opens after the **private owner access code** is entered (Ctrl+Shift+O, or tap the JUJUTSU KAISEN logo on the main menu 7 times).

- **Sandbox:** any map and difficulty (incl. Special and Endless), any characters (owned or not, all 28 in a scrolling tray), set level/stars/Yen, optional indestructible base. A **LAB** button in the battle spawns any enemy or boss (count, wave scaling, lane), spawns every enemy/boss at once, kills everything, adds Yen, heals the base, max-upgrades units, resets domain cooldowns, jumps waves and runs at 0.5x to 8x. Sandbox matches are debug matches: no rewards, no progress, your save is untouched.
- **Self-test:** runs the real simulation against every character (L1 + max level, deploy cost, placement limits), enemy, boss (AI for 60s + a Jahjuan kill), map x difficulty + endless, summon banner (6,000 pulls each, pity, 2M JOAN rolls), plus a check that every sprite and portrait exists. Pass/fail table, copyable report. Also runs in Node: `tests/owner.test.js`.
- **Summon lab:** arm "force JOAN" to watch the rainbow reveal on a real pull, or simulate up to 2,000,000 pulls on a throwaway profile.
- **Gallery:** every character, enemy, boss and summon model.
- **Save tools:** grant all characters, max levels, currencies, unlock everything (these change the real save).

### Owner access: how it works and how to set your code

- Only a **salted PBKDF2-SHA256 hash** of your code is in the repo (`Config.OWNER_ACCESS` in `js/data/balance.js`). The code you type is hashed in the browser with the Web Crypto API and compared; no readable code exists anywhere in the project.
- **Choose your code** (never put it in a file, chat or commit): run `node tools/owner-access.js --write`. It asks for your code twice with hidden input and installs the salt + hash for you. No terminal? Open `tools/owner-access.html` locally, type your code, and paste the generated line between the `OWNER-ACCESS-BEGIN` / `END` markers. Then commit and deploy.
- Until a hash is installed, the Lab stays locked for everyone ("not set up on this build").
- Wrong code: "ACCESS DENIED" (nothing about what was close). 5 wrong attempts lock the prompt for 30 s, doubling each time up to 15 min (kept outside the game save).
- A successful unlock lasts for the browser session only (`sessionStorage`); closing the browser asks again. It is never written to the game save, and the game is fully playable without it.
- This is a soft lock for a static GitHub Pages game: someone with DevTools can bypass it. It keeps casual players out; it is not server-side security.

## RISE OF JAHJUAN ⚖ (endgame challenge)

A standalone, immediately unlocked endgame challenge: **The Court of Nine Reflections** (`court_of_nine`) against **JAHJUAN, Chief Justice of the Nine Reflections** (`jahjuanBoss`). Open it from the gold **RISE OF JAHJUAN** button on the main menu (or its map card on the Play screen). It adds no playable character; the playable INVINCIBLE JAHJUAN is untouched and may be brought under the normal roster rules (his `true` damage is capped by the Unlicensed Force rule and can never sign, affirm or shatter).

- **Run:** 12 Preparation Dockets, then one continuous nine-phase trial. 620 Yen, 12 lives, native prices and 70% refunds. Phases I-VIII get three readings each (a third Hung Jury is defeat); Phase IX is one 128-second trial in four Measures ending in the Recitation and the Last Word.
- **The law:** he audits what your defense already did, codifies a statute against it, and announces the exact tick at least 6 seconds ahead. Every verdict is written into the permanent **Standing Record**, which Measure D reads back to you.
- **Full disclosure:** the Court Briefing (map, docket, all 18 systems, an interactive Recitation diagram, a draggable Scales example, and a coverage checklist) shows everything before you enter. Defeats print the exact failed clause with live figures.
- **Records:** `d.court` (save v3, additive migration). Coins and XP only; no gems, drops, story progress, challenges or roster changes. SKIBRIB, story maps and endless are untouched.
- **Code:** `js/data/court.js` (map, benches, dockets, phases, constants), `js/sim/court-ledger.js` (exact fixed-point ledgers, control budget, Scales, Record, hash chain), `js/sim/court-sim.js` (the integer-tick state machine, hooks, `court.forecast()`, trace), `js/render/court-art.js`, `js/ui/court-ui.js`.
- **Tests:** `node --test tests/*.test.js` (includes `tests/court.test.js`); browser: `node tests/browser/court.js` (with `python3 -m http.server 8123`). Evidence: `node tests/dev/court-evidence.js` writes `docs/COURT-EVIDENCE.md` (proof bots, ablations, reachability table, fuzzing, performance, tuning log).

## SKIBRIB CHALLENGE 💀💀💀💀💀💀💀💀💀💀

An optional 75-wave endurance map, unlocked for everyone from the start (Play → Story → the last map card). *"This is technically beatable."* Press **SUFFER**, then confirm twice.

- **Rules:** 75 hand-written waves, no checkpoints (any defeat sends you back to Wave 1), 15 lives, 50% sell refund, a starving economy, one fixed difficulty, no Endless. Your normal team is used.
- **The map:** one 67-tile path that crosses itself four times, a few golden tiles, two small rooftop pads, toilet buildings blocking most of the premium space. It looks like 3 AM internet brainrot (toilet skyscrapers, stretched billboards of the supplied pictures, cones, fake shortcuts, buttons that do nothing), but the path and tiles stay readable.
- **The trolls** (art from the supplied pictures, `assets/skibrib/`): Troll Runner, Tank Troll, Dodge Troll (deterministic dodge, one hit per 0.8s), Regeneration Troll, Shield Troll (visible shield, pulses one-time shields onto other trolls), Armored Troll (70% physical armor), Speed Toilet, Buff Toilet (aura: +30% speed, -40% damage taken), Disruptor (telegraphed 1.6s channel, disables units in a 1.6-tile ring; kill or stun it to fizzle it), Splitter, Fake Weakling (its "death" reveals a 10x tougher armored form). Repeated stuns have diminishing returns on all of them.
- **Bosses:** Wave 30 SKIBRIB PRIME (2 phases, a burst window), Wave 50 THE GREEN MENACE (3 phases, adapts to your damage mix, builds CC immunity, Demon Charge must be clashed with a Domain), Wave 70 THE TROLL KING (the fake ending), Wave 75 THE SKIBRIB ABOMINATION (4 phases ending in ENRAGE). A boss reaching the exit ends the run.
- **Story beats:** act titles, "okay that was probably the hardest wave", the Wave 65 dread intro, "1/3 OF THE WAY THERE 💀", "YOU HAVE 25 WAVES LEFT.", "THE OWNER SENDS HIS REGARDS.", the Wave 70 fake victory → glitch → "LOL NO. 5 WAVES REMAIN.", silence and "You should have stopped." before 75, alarms and a red health bar in the final ENRAGE, random death messages, and a victory screen with stats, original music and the SKIBRIB SURVIVOR achievement.
- **Records** (saved in the game save, v2 migration keeps every older save intact): attempts, deaths, wins, highest wave, best time, best lives left, fewest units placed. Owner Lab sandbox runs never count.
- **Balance and proof:** tuned with an optimizing autoplayer (`tests/skibrib-bot.js`) that only uses the public battle API: real Yen, real lives, no god mode, no debug tools. See `docs/SKIBRIB-EVIDENCE.md` (regenerate with `node tests/dev/skibrib-evidence.js`, about 15 minutes). The unit test `tests/skibrib.test.js` replays one full legitimate Wave 1 → 75 clear and checks that weaker strategies die early.
- Files: `js/data/skibrib.js` (enemies, bosses, map, wave script), `js/sim/skibrib-ai.js` (mechanics + boss AI), `js/render/skibrib-art.js` (sprites, background, effects), `js/ui/skibrib-ui.js` (map card, SUFFER flow, in-battle beats, results).

## INVINCIBLE JAHJUAN (JOAN rarity)

The 28th character and the only one of the **JOAN** rarity (above Mythic).

- **Only source:** the Summoner. Every single pull on every banner (standard, featured, Culling Game; x1 and x10) has an independent **1 in 200,000** chance to turn into Jahjuan. It does not affect pity or the normal rates, and it cannot be unlocked with shards, bought in the Shop, or earned from missions/challenges. The odds are listed in the rates table.
- **Rainbow reveal:** a JOAN pull always plays the full animation (still skippable): hue-cycling charge, white flash and rainbow shockwaves, spinning rainbow rays, sparkles, screen shake, a "J O A N" title and a rainbow-bordered card, with its own fanfare. In a x10 he is revealed last.
- **In battle:** costs **¥300**, **only 1 can be placed** (sell him to re-place). Reach 7.5 tiles (up to 11 with upgrades). Every ~0.12s he deals typeless damage scaled to each enemy's own HP+shield to everything in reach, ignoring armour, cursed resistance, shields, wards and Mahoraga's adaptation, so anything that enters his range dies.
- **The one limit:** a boss's own invulnerability window (e.g. Dagon submerged) still blocks all damage until it ends; he erases the boss the moment it ends.
- Art: cut out from the supplied image (`assets/characters/jahjuan.png`).
- Tests: `tests/jahjuan.test.js` (odds, 1 placement, ¥300, kills every enemy and boss, no shard/shop path) and `tests/browser/joan.js` (forces a JOAN pull through the real UI).

## Expansion roster (13 characters) and how to get them

Deliberately harder than the original 14. Each needs a specific condition, not just luck:

| Character | Rarity | How |
|---|---|---|
| Mai Zenin | RARE | Mission: 500 kills |
| Momo Nishimiya | RARE | Mission: clear Detention Center |
| Miwa Kasumi | RARE | Challenge: clear Detention HARD/SPECIAL with **zero units disabled** |
| Utahime Iori | EPIC | Mission: use Domains 10 times |
| Uraume | EPIC | 12% drop from Mahito (also shards) |
| Naoya Zenin | EPIC | Challenge: kill Mahito in ≤55 s or Sukuna in ≤90 s |
| Higuruma, Geto, Yuki | LEGENDARY | Culling Game banner only |
| Kashimo | LEGENDARY | 18% drop from Hanami |
| Jogo, Mahito (playable) | LEGENDARY | Boss mastery: 8 boss kills |
| **Ryomen Sukuna (playable)** | MYTHIC | Win the **Shinjuku Gauntlet on SPECIAL** (45 waves incl. Hanami, Dagon, Mahito, Mahoraga and Heian Sukuna) |

**The Sukuna gate (design intent, not measured).** The prerequisite chain is Lv 15, Cursed Temple HARD, then the Gauntlet on NORMAL/HARD/SPECIAL. That is roughly 255 wave-clears at the very least; by my estimate about 3.5 h at 1× (about 1.8 h at 2×) with zero failed attempts, and far more in practice because the Gauntlet bosses punish untimed play. This number is a calculation from wave counts, not a timed human playthrough. It cannot be skipped with gems or shards. The pieces that need game knowledge: Miwa/Panda wards against Hanami's buds and Shrine disables, Domain timing for the Malevolent Shrine clash, nullifiers (Toji, Higuruma) against Mahoraga's adaptation, and burst timing on Dagon's Exposed window.

**Character art:** all 13 expansion characters use anime-style cut-outs in `assets/characters/` (listed in `assets/manifest.json`), extracted from a contact sheet screenshot, so they are lower resolution than the original 14. Replace any file with a sharper transparent PNG of the same name and it is picked up automatically. The 4 new bosses, Bud, the Rainbow Dragon and Garuda are drawn in code (`js/render/models-bosses2.js`, `models-chars.js`); the code-drawn character figures remain as a fallback if a PNG is missing.
Dev tools: `node tests/dev/cutouts.js out.png` (cut-outs + portraits), `node tests/dev/bossduel.js <boss> <diff> <team>` (staged boss fight), `tests/dev/smartbot.js` (bot with counters).

## Project structure
```
index.html            boot guard + script order
style.css             all styling
assets/manifest.json  optional replacement art/audio map (procedural fallback if empty)
js/core/              util, save-manager, progression (Profile, summon math, shop, missions)
js/data/              balance, characters, enemies+bosses, maps, meta (items, banners, shop, missions)
js/sim/               waves, battle (headless sim), kits + kits2 (expansion), bosses, bot (auto-player for tests)
js/render/            art (procedural sprites), backgrounds, vfx, battle-renderer (canvas)
js/audio.js           synthesised SFX + music
js/ui/                ui-core + one file per screen (menu, play, battle, results, characters, summon,
                      shop, inventory, missions, codex, settings, debug)
js/main.js            entry point
tests/                node:test unit tests, structure test, tests/browser (Playwright), tests/dev (probes)
```
To add a character: add a definition in `js/data/characters.js` (+ a kit in `js/sim/kits.js` if it has unique behaviour). To swap in real art, drop images in `assets/` and list them in `assets/manifest.json` (see the README in each asset folder).

## 3D characters (three.js)

Yuji's tower can be drawn as a real 3D, skinned and animated figure. The camera is fixed at an angled top-down view and the rest of the battlefield stays 2D. Combat, balance, saves and replays are untouched, because the 3D layer only reads the simulation.
- **To give every player 3D Yuji:** copy your rigged model to `assets/models/yuji.glb` (exact, lowercase name) and publish. That is the only step. Animations, materials, scale and facing are configured automatically. Commit it as a normal file, not with Git LFS.
- **No character model is bundled.** Without one, Yuji keeps his 2D art.
- **Players never see model controls.** The public build (`CHAR3D_DEV_TOOLS: false` in `js/data/balance.js`) only offers a plain *Graphics → 3D characters* on/off toggle once a model is in use. Set the flag to `true` for developer tools (model picker, stand-in preview), and back to `false` before publishing.
- Full guide: `docs/CHAR3D.md`. Tests: `node --test tests/*.test.js`, `node tests/browser/char3d.js`, `node tests/browser/char3d-load.js`.

## Tests
```
node --test tests/*.test.js                      # 112 unit/integration/structure tests, ~1 s
python3 -m http.server 8123 &                    # then:
node tests/browser/smoke.js && node tests/browser/domain.js   # 80 browser checks (headless Chrome via Playwright)
```
Results at release: **112/112 unit, 79/79 browser smoke, 1/1 domain UI, models check**. Browser checks use real clicks/keys/touch and cover boot, every menu screen, placement/upgrade/sell/targeting, waves, 2× speed, pause, boss bar, a full bot-played win → results → reward → reload persistence, summon ×1/×10 with skip, shop, inventory, missions, settings, Endless, small-screen scaling + touch placement, memory/DOM growth over repeated battles, sim cost with 60 enemies, and failure cases (corrupt save, malformed-but-valid JSON, blocked localStorage, missing script file, RETRY, RESET SAVE).

### Manual smoke checklist (2 minutes)
Boot → menu; PLAY → Tokyo/Normal → deploy 2 units → START WAVE → upgrade → sell → 2× → pause/resume; win or forfeit → results show rewards; SUMMON ×10 → Skip → OK; Shop (after Lv 2) buy; MISSIONS claim; SETTINGS toggle, reload and confirm it stuck; DevTools → delete `localStorage` key `jjk_td_save` to confirm a fresh start.

## Known limitations
- **Balance is bot-verified only.** A heuristic bot clears NORMAL on Tokyo/Detention/Shibuya with starter-to-mid teams and HARD on Tokyo/Detention with a Lv 25 / 4★ team. It cannot clear SPECIAL or Cursed Temple HARD (it plays the opening poorly; with extra starting Yen it clears Tokyo and Detention SPECIAL, so those waves are beatable in principle). Treat SPECIAL as endgame and expect tuning after human playtests; all numbers are in `js/data/balance.js`.
- No gamepad support; audio is synthesised (basic quality); art is procedural chibi style, replaceable via the manifest.
- Save data is per-browser; there is no cloud sync. Clearing site data erases progress.
- Headless Chrome was the only browser tested; Firefox/Safari are untested.

## Phone / iOS

**Fastest (no Apple account):** deploy to GitHub Pages, open the URL in Safari on the iPhone, Share → *Add to Home Screen*. It launches fullscreen, landscape, with its own icon (`manifest.webmanifest` + Apple meta tags in `index.html`).

**IPA (sideload):** an IPA needs Xcode, so it is built on GitHub's Mac runners:
1. Push the project to GitHub.
2. Actions → *Build iOS IPA (unsigned)* → *Run workflow*.
3. Download the `JJK-TD-ipa` artifact (`JJK-TD.ipa`).
4. The IPA is unsigned. Install it with AltStore or Sideloadly (free Apple ID; re-sign every 7 days), or sign it with a paid Apple Developer account for TestFlight/App Store.

The workflow uses Capacitor (`capacitor.config.json`, `scripts/build-www.js`); `ios/` is generated in CI, not committed.

## Models

All enemies, bosses, shikigami (Divine Dogs, Nue, Max Elephant), Rika and the battlefield character stands are drawn procedurally at runtime (no extra files):
`js/render/models.js` (toolkit + curses), `models-bosses.js` (Finger Bearer, Jogo, Mahito, Sukuna), `models-bosses2.js` (Hanami, Dagon, Mahoraga, Heian Sukuna, Bud), `models-allies.js` (summons, Rika, character stands), `models-chars.js` (expansion cut-outs, Rainbow Dragon, Garuda). Every model is an 8-frame loop. `node tests/dev/sheet.js out.png enemies|bosses|summons|units` renders a contact sheet.
