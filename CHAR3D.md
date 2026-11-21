# 3D characters (three.js layer)

The battlefield stays 2D. Only towers that have a 3D body are drawn in 3D. The 3D layer is **render-only**: it reads the
simulation and listens to its events, but it never writes to it. Combat, balance, saves and replays are therefore
unchanged, and the browser test checks that the simulation stays bit-identical with the layer running.

## What players see

- **The public game** has `Config.CHAR3D_DEV_TOOLS: false` in `js/data/balance.js`, which is how the project ships.
  - A bundled `assets/models/yuji.glb` loads automatically for everyone, and Yuji simply is 3D.
  - Players never see a model picker, an upload control, a status message or the stand-in rig.
  - The only player-facing control is **Settings → Graphics → 3D characters** (on/off, for slow devices). It appears only
    when a 3D model is actually in use.
  - URL overrides (`?char3d=…`) and models saved in browser storage are ignored.
  - If the file is missing, broken, or replaced by a web page, Yuji is the original 2D character.
- **Developer tools** are switched on with `CHAR3D_DEV_TOOLS: true`.
  - Settings shows a **3D characters · developer** section: mode (Auto / Preview stand-in / Off), status, **Test a model
    file** (remembered in this browser) and **Forget saved model**.
  - `?char3d=auto|preview|off` and `?char3dq=high|low` work.
  - Set the flag back to `false` before publishing.
- **Nothing reaches gameplay or progress.** The 3D layer only reads the battle. Its on/off choice is stored under its own
  `localStorage` key (`jjk-td.char3d.mode`), never in the save, and developer models live in a separate IndexedDB store.
- **Client-side limit:** like the Owner Lab's lock, these switches live in the page's JavaScript. Someone using the
  browser's developer tools could flip them, but nothing in the game's own interface can.

## Adding a model (for example, Yuji) — no file editing

**For every player, automatically:** copy the rigged model into `assets/models/` and name it **`yuji.glb`** (all lowercase).
That is the only step. Commit and publish the project as usual (GitHub Pages or any static host). Every player then gets
the 3D model on their first visit, with no download, upload or settings change on their side.

- **What gets set up on load:** animations are matched to their roles by name, and so are the materials and the outline.
  Scale, facing and stance centring are worked out automatically.
- **If the model is still downloading:** Yuji keeps his 2D art until the file has loaded, then switches. An 11 MB file
  takes a moment on a slow connection; it never blocks the game.
- **If the file is missing or unusable:** Yuji keeps his 2D art. That covers a missing file, a host that answers with an
  HTML page instead, and a Git LFS pointer instead of the real file. A missing file shows as one expected 404 line in the
  browser console.

**Developer testing only:** with `CHAR3D_DEV_TOOLS: true`, **Settings → 3D characters · developer → Test a model file**
keeps a model in that browser's storage (IndexedDB) and loads it on every visit; **Forget saved model** removes it. The
public build ignores such saved models.

**Priority:** an entry in `assets/models/char3d.json` (optional, for custom options), then `assets/models/yuji.glb`, then (developer
builds only) a model saved in this browser, then the original 2D art.

### Publishing checklist (GitHub Pages)

- **File name:** the file must be exactly `assets/models/yuji.glb`. GitHub Pages is case-sensitive, so `Yuji.GLB` will not
  be found.
- **Commit it as a normal file, not with Git LFS.** GitHub Pages does not serve LFS files. GitHub accepts normal files up
  to 100 MB.
- **`.nojekyll` is included.** It makes GitHub Pages serve every file as-is, including `vendor/three/`. Keep it.
- **Paths are relative,** so the game works at `https://<user>.github.io/<repo>/` as well as at a domain root.

### Optional: per-model options in `assets/models/char3d.json`

You never need this file for Yuji. It is only for overriding the automatic choices. Add an entry under `"models"`, keyed
by character id:

```json
{ "models": { "yuji": { "file": "yuji.glb", "textureMax": 4096, "heightPx": 90 } } }
```

### Options for each model

| Key | Default | Meaning |
|---|---|---|
| `file` | — | File name inside `assets/models/`. |
| `enabled` | `true` | Set to `false` to keep the entry but not load the model. |
| `animation` | auto | `"clips"` uses the animations embedded in the file. `"procedural"` uses the built-in animation system, retargeted onto the model's skeleton. Auto picks clips when it finds at least an idle clip and a punch clip. |
| `clips` | by name | Maps each role to a clip name in the file: `idle`, `punchL`, `punchR`, `divergent`, `blackflash`, `turnL`, `turnR`. Roles you leave out are matched by name patterns. |
| `toon` | auto | `false` keeps the file's own materials and textures exactly as they are. `true` converts them to cel-shaded toon materials (keeping their colour, normal and emissive textures) and adds outline hulls. Auto keeps the file's materials when the file already contains an outline mesh. |
| `outline` | `0.012` | Width of the added outline in metres, used only when `toon` is on. |
| `heightPx` | `86` | Standing height on screen in pixels. Any model scale or unit works. |
| `yawDeg` | auto | Rotates a model that faces the wrong way. Models facing +Z or −Z are detected automatically. |
| `footIK` | `true` | Keeps planted feet fixed on the ground while the tower turns. Set to `false` to show the clips' foot motion untouched. |
| `textureMax` | 2048 (1024 on phones) | Largest texture size uploaded to the GPU. The file itself is never changed. |
| `lighting` | auto | `"painted"` uses soft, even light, which suits textures with shading painted in. `"toon"` uses a strong key light. |

### What the file needs

- glTF 2.0 binary (`.glb`) with textures embedded, one skinned humanoid mesh, Y-up. Any scale or unit works.
- Bone names recognised automatically: Mixamo (`mixamorig…`, `Hips`, `LeftArm`, `LeftForeArm`, `LeftUpLeg`, …),
  Blender/Rigify (`upper_arm.L`, `thigh.R`, …) and VRM (`leftUpperArm`, …). The spine and chest are worked out from the
  bone hierarchy, so misleading names like `Spine02` at the bottom of the spine still map correctly.
- Optional clips. Strike clips can be of any length. The layer finds each strike's impact frame (the moment the fist is
  furthest forward) and which hand throws it.
- If the file animates a root or orientation node above the hips, that motion is baked into the hips. A turn clip's
  rotation becomes the tower's facing, so the figure turns about its platter.
- Draco- or meshopt-compressed files are **not** supported. Their decoders are not vendored, so export without that
  compression.

## How it works

```
js/char3d/
  boot.js        hooks BattleRenderer.drawUnits / setBattle / dispose; finds models (char3d.json, <id>.glb, browser storage); settings; JJK.Char3D
  stage.js       shared WebGL renderer, angled orthographic camera, per-battle scene, fighters, compositing, impact effects
  sync.js        combat events -> animation triggers; wind-up prediction from the attack cooldown (read-only)
  animator.js    procedural poses/clips, state machine, crossfades, facing spring, foot planter
  rig.js         humanoid rig analysis + two-bone IK solver (any skeleton, T- or A-pose)
  clipdriver.js  drives a model with its own clips: impact-synced time-warping, turn clips, foot IK
  fx2d.js        pooled screen-space effects: sparks, rings, Black Flash lightning and impact frames
  assets.js      stand-in rig, cel/outline materials, GLB loading and bone mapping
vendor/three/    three.js r170 (MIT) + GLTFLoader, SkeletonUtils, GLTFExporter (imports rewritten to relative paths)
```

### Rendering

- **Camera.** A fixed orthographic camera, pitched 55° downward. The ground maps exactly onto the 2D field, so a
  fighter's feet sit on its tower platter and the picture lines up with the rest of the map.
- **One frame.**
  - All 3D fighters are drawn into one offscreen WebGL canvas, clipped to the area they cover.
  - That area is copied into the battle canvas inside `drawUnits`. The 3D figures therefore keep the game's draw order:
    platters, rings and level pips first, then the figures, then enemies, projectiles and effects. Screen shake applies
    to them too.
  - Shadows are real shadow maps falling on a transparent ground plane.
- **Sprites.** While `drawUnits` runs, a 3D tower's `Art.unitSprite` returns its platter without the flat figure.
  Selection, placement previews, menus and every other character keep using their normal sprites.
- **Sharing and memory.** Geometry, materials and textures are shared by all copies of the same model; each tower only
  gets its own skeleton. Fighters are pooled when a tower is sold, and leaving a battle disposes the scene. If WebGL is
  missing, or something throws, the 2D art comes back on its own.

### Animation

- **Combat sync.**
  - Each attack in the simulation emits a `slash` effect. That event triggers the strike.
  - Black Flash is flagged on the event itself (`bf`).
  - The Divergent Fist echo is the simulation's scheduled second hit. It is the same tower attacking again with an
    unchanged hit count.
  - Wind-ups start *before* the hit. The unit's attack cooldown tells the layer when the next hit will land, and
    `pickTarget` (a pure read) tells it at whom. The anticipation is timed so that the clip's impact frame lands on the
    hit.
- **Supplied clips.**
  - A strike plays only a window of its clip: anticipation, then impact, then part of the recovery. Each part is
    time-warped so it fits the tower's attack interval. Real attack clips are 3–4 times longer than one attack.
  - Black Flash holds briefly on its impact frame (hit-stop).
  - Large changes of target play the turn clips in place. Small ones rotate the tower on a critically damped spring.
  - A foot planter with two-bone leg IK keeps planted feet fixed. A foot that needs to move takes a step with lift.
- **Stand-in and models without clips.** A procedural state machine on the same IK system. It covers stance, breathing
  and weight shift, alternating jab and cross, Divergent follow-up, Black Flash, power-up, landing and a stunned slump.
- **Reactions.** Upgrading plays a power-up with an aura. Placement plays a landing with dust. A disabled tower slumps.
  Higher levels make the fists glow.

### Effects

- **Punches:** sparks and a ring at the fist.
- **Divergent Fist:** a delayed cursed-energy burst at the target.
- **Black Flash:**
  - Wind-up: the fist charges with black-red crackle.
  - Impact:
    - a manga-style impact frame;
    - black-red lightning;
    - black and red sparks;
    - double shockwave rings;
    - a short screen shake and flash;
    - a `BLACK FLASH` callout.
  - The shake and flashes respect Settings → Reduce motion.

## Tests

```
python3 -m http.server 8123 &                 # from the game folder
node --test tests/*.test.js                   # includes tests/char3d.test.js (rig, IK, animator, planter, mapping, sync)
node tests/browser/char3d.js                  # 3D layer in headless Chrome (WebGL 2): 31 checks
node tests/browser/char3d-load.js             # public build (auto-load, no model controls, fallbacks, save untouched) + developer tools: 24 checks
CHAR3D=preview node tests/browser/court.js    # any browser suite can run with a 3D mode preset
```

- `tests/browser/char3d-fixture.js` builds a test model with embedded clips from the stand-in rig. It deliberately
  includes the awkward parts of real exports: Mixamo names, misleading spine numbering, an animated root node,
  centimetre bones, off-centre stances and long clips. The supplied-model path is tested with no third-party file.

## Known limitations

- **No finger or face animation.** Neither the stand-in nor the clip driver animates fingers or faces.
- **Supplied clips play from the file.**
  - The strike window and impact frame are found automatically. A file whose punches are unusual (for example, the
    fist peaks twice) may need its clips re-timed in a 3D editor.
  - The power-up, landing and stun reactions for clip-driven models are procedural overlays, because the files have no
    clips for them.
- **Slow without a GPU.** In software rendering (no GPU, for example headless CI) the layer drops to low quality and
  copying the 3D frame into the 2D canvas costs about 15 ms per frame. With a GPU the 3D layer costs about 1 ms.
- **Opening `index.html` directly from disk (`file://`).** Browsers block ES modules there, so the 3D layer is skipped
  and the 2D game runs as before. Use the local server or GitHub Pages.
