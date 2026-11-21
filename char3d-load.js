/* 3D model loading, public vs developer builds. Uses fixture models generated from the original stand-in rig
   (tests/browser/char3d-fixture.js) — no third-party model is used or left behind.
   PUBLIC (Config.CHAR3D_DEV_TOOLS = false, the shipped default):
     - a bundled assets/models/yuji.glb loads for every player automatically (fresh profile, sub-folder site like GitHub Pages);
     - no model upload/replacement controls anywhere; dev URL overrides and leftover saved models are ignored;
     - missing, broken or HTML-substituted model files fall back to the original 2D Yuji; the save is never touched.
   DEVELOPER (CHAR3D_DEV_TOOLS = true in a temporary copy): picker, browser storage, priority, forget.
   needs: python3 -m http.server 8123 (from the game folder). Temporary sites are served from a temp folder on :8124 and
   deleted afterwards. run: node tests/browser/char3d-load.js */
const { launch } = require('./_pw');
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const res = []; const ok = (n, c, extra) => { res.push({ n, c: !!c, extra }); console.log((c ? 'PASS ' : 'FAIL ') + n + (c || !extra ? '' : '  ' + extra)); };

(async () => {
  const br = await launch();
  const errs = [];
  const page = async (ctx, url) => {
    const pg = await ctx.newPage(); await pg.setViewportSize({ width: 1280, height: 720 });
    pg.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errs.push(m.text()); });
    await pg.goto(url);
    await pg.waitForFunction(() => window.JJK && JJK.Char3D && JJK.Char3D.ready, null, { timeout: 30000 });
    return pg;
  };
  const info = (pg) => pg.evaluate(() => { const r = JJK.Char3D.registry.yuji, t = r.supplied; return { origin: r.origin, source: r.source, saved: r.saved, status: JJK.Char3D.status(), clips: t ? t.clipCount : 0, useClips: t ? t.useClips : false, offset: t && t.clipInfo ? +t.clipInfo.idle.C.x.toFixed(2) : null, mode: JJK.Char3D.mode, dev: JJK.Char3D.dev() }; });
  const battle = async (pg) => {
    await pg.evaluate(() => __jjk.UI.show('menu')); await pg.waitForTimeout(300);
    await pg.locator('.menu-wrap button', { hasText: /^\s*PLAY/ }).first().click(); await pg.waitForTimeout(300);
    await pg.locator('button:has-text("START BATTLE")').click(); await pg.waitForTimeout(700);
    await pg.evaluate(() => { const b = __battle.battle; b.addYen(5000); const s = [...b.geo.slots.values()].find((x) => x.type === 'G'); b.place('yuji', s.c, s.r); });
    await pg.waitForTimeout(800);
    return pg.evaluate(() => ({ snap: JJK.Char3D.snapshot(), sprite2d: [...JJK.Char3D.views].every((v) => !v.handled.has('yuji')) }));
  };
  const fightUntilPunch = async (pg) => {
    await pg.evaluate(() => { __battle.startWave(); __battle.setSpeed(2); });
    await pg.waitForFunction(() => { const s = JJK.Char3D.snapshot()[0]; return s && s.counts.punchL + s.counts.punchR > 1; }, null, { timeout: 45000 }).catch(() => {});
    return pg.evaluate(() => (JJK.Char3D.snapshot()[0] || { counts: { punchL: 0, punchR: 0 } }).counts);
  };
  const settings = async (pg) => { await pg.evaluate(() => __jjk.UI.show('settings')); await pg.waitForTimeout(500); };
  // everything a player could see on Settings that would reveal model loading
  const publicUi = (pg) => pg.evaluate(() => {
    const txt = document.body.innerText, sec = document.querySelector('[data-char3d=section]');
    const fileInputs = [...document.querySelectorAll('input[type=file]')].filter((i) => /glb|gltf|model/i.test((i.accept || '') + (i.getAttribute('aria-label') || '')));
    return { fileInputs: fileInputs.length, picker: !!document.querySelector('[data-char3d=file],[data-char3d=forget],[data-char3d=mode]'), words: (txt.match(/\.glb|gltf|upload|drop .*here|model file|load 3d model|stand-in|replace/gi) || []), toggle: !!document.querySelector('[data-char3d=toggle]'), section: !!sec && sec.style.display !== 'none' && sec.childNodes.length > 0 };
  });
  const putIdb = (pg, b64) => pg.evaluate((b64) => new Promise((res) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = indexedDB.open('jjk-td-char3d', 1); r.onupgradeneeded = () => r.result.createObjectStore('models'); r.onsuccess = () => { const tx = r.result.transaction('models', 'readwrite'); tx.objectStore('models').put({ name: 'sneaky.glb', size: u.length, savedAt: Date.now(), buf: u.buffer }, 'yuji'); tx.oncomplete = () => res(true); }; }), b64);

  // fixtures: "remembered" (stance offset 0.1 m -> 0.08) and "bundled" (0.3 m -> 0.28), so tests can tell which one loaded
  const gen = await br.newContext(); const gp = await page(gen, 'http://localhost:8123/index.html');
  const mk = (off) => gp.evaluate(async (off) => { const fx = await import('/tests/browser/char3d-fixture.js'); const b = new Uint8Array(await fx.buildClipGLB({ offset: off })); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }, off);
  const rememberedB64 = await mk(0.1), bundledB64 = await mk(0.3);
  const remembered = Buffer.from(rememberedB64, 'base64'), bundled = Buffer.from(bundledB64, 'base64');
  await gen.close();
  ok('fixtures built (' + (remembered.length / 1024).toFixed(0) + ' KB each)', remembered.length > 100000 && bundled.length > 100000);
  ok('the shipped build is public: CHAR3D_DEV_TOOLS is false and no model file is bundled', /CHAR3D_DEV_TOOLS: false/.test(fs.readFileSync(path.join(ROOT, 'js/data/balance.js'), 'utf8')) && !fs.readdirSync(path.join(ROOT, 'assets/models')).some((f) => /\.glb$/i.test(f)));

  // temporary published sites (sub-folders, like https://<user>.github.io/<repo>/)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jjk-sites-'));
  const site = (name, glb, devTools) => {
    const d = path.join(tmp, name); fs.mkdirSync(d); execSync('cp -r ' + JSON.stringify(ROOT) + '/. ' + JSON.stringify(d));
    if (glb) fs.writeFileSync(path.join(d, 'assets/models/yuji.glb'), glb);
    if (devTools) { const f = path.join(d, 'js/data/balance.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('CHAR3D_DEV_TOOLS: false', 'CHAR3D_DEV_TOOLS: true')); }
    return 'http://localhost:8124/' + name + '/';
  };
  const broken = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(4000, 7)]);
  const PUB = site('public-model', bundled, false), PUB_BROKEN = site('public-broken', broken, false), DEV = site('dev', null, true), DEV_MODEL = site('dev-model', bundled, true);
  const srv = spawn('python3', ['-m', 'http.server', '8124'], { cwd: tmp, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  try {
    // ============================================================ PUBLIC, model bundled
    const c1 = await br.newContext(); const p1 = await page(c1, PUB);
    let I = await info(p1);
    ok('PUBLIC: a fresh player gets the bundled model automatically, no action (' + I.clips + ' clips, auto-configured)', !I.dev && I.mode === 'auto' && I.origin === 'bundled' && I.offset === 0.28 && I.clips === 7 && I.useClips);
    let B = await battle(p1);
    ok('PUBLIC: Yuji is 3D in battle like a built-in character', B.snap.length === 1 && B.snap[0].kind === 'glb' && B.snap[0].clips);
    const pc = await fightUntilPunch(p1);
    ok('PUBLIC: his animations play on real hits (L ' + pc.punchL + ' / R ' + pc.punchR + ')', pc.punchL + pc.punchR > 1);
    await settings(p1);
    let U = await publicUi(p1);
    ok('PUBLIC: Settings has no model upload / replacement controls (file inputs ' + U.fileInputs + ', words ' + JSON.stringify(U.words) + ')', U.fileInputs === 0 && !U.picker && U.words.length === 0);
    ok('PUBLIC: only a plain "3D characters" graphics toggle is offered', U.toggle && U.section);
    const before = await p1.evaluate(() => localStorage.getItem(JJK.Config.SAVE_KEY));
    await p1.click('[data-char3d=toggle]'); await p1.waitForTimeout(200);
    const offMode = await p1.evaluate(() => JJK.Char3D.mode);
    await p1.click('[data-char3d=toggle]'); await p1.waitForTimeout(200);
    const after = await p1.evaluate(() => localStorage.getItem(JJK.Config.SAVE_KEY));
    ok('PUBLIC: the toggle switches 3D off/on without touching the save', offMode === 'off' && (await p1.evaluate(() => JJK.Char3D.mode)) === 'auto' && before === after);
    ok('PUBLIC: the save contains nothing from the 3D system', await p1.evaluate(() => !/char3d|\.glb|gltf/i.test(JSON.stringify(__jjk.profile.d))));
    // developer back doors are inert in the public build
    const dl = await p1.evaluate(async () => { try { await JJK.Char3D.loadModel('yuji', new ArrayBuffer(8), 'x.glb'); return 'loaded'; } catch (e) { return e.message; } });
    ok('PUBLIC: the model-loading API refuses (developer-only)', /developer-only/.test(dl));
    await putIdb(p1, rememberedB64);
    const p1b = await page(c1, PUB + '?char3d=preview'); I = await info(p1b);
    ok('PUBLIC: ?char3d=preview and a leftover saved model are ignored; the bundled model stays', I.mode === 'auto' && I.origin === 'bundled' && I.offset === 0.28 && !I.saved);
    await c1.close();
    // a host that serves an HTML page instead of a missing file
    const c3 = await br.newContext(); await c3.route('**/assets/models/yuji.glb', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Not here</title>' }));
    const p3 = await page(c3, PUB); I = await info(p3);
    ok('PUBLIC: an HTML page in place of the model -> original 2D Yuji', !I.origin && /keeping the 2D art/.test(I.status));
    await c3.close();

    // ============================================================ PUBLIC, broken model file
    const c4 = await br.newContext(); const p4 = await page(c4, PUB_BROKEN); I = await info(p4);
    B = await battle(p4);
    ok('PUBLIC: a corrupt yuji.glb falls back to the original 2D Yuji and the battle runs', !I.origin && B.snap.length === 0 && B.sprite2d && (await p4.evaluate(() => __battle.battle.units.length)) === 1);
    await settings(p4); U = await publicUi(p4);
    ok('PUBLIC: with no usable model, Settings shows no 3D section at all', !U.section && !U.toggle && U.fileInputs === 0);
    await c4.close();

    // ============================================================ PUBLIC, no model (the shipped project as-is)
    const c5 = await br.newContext(); const p5 = await page(c5, 'http://localhost:8123/index.html');
    await putIdb(p5, rememberedB64);
    const p5b = await page(c5, 'http://localhost:8123/index.html?char3d=preview'); I = await info(p5b);
    B = await battle(p5b);
    ok('PUBLIC (shipped as-is): Yuji is 2D; URL overrides and stored models do nothing', !I.origin && I.mode === 'auto' && B.snap.length === 0 && B.sprite2d);
    await c5.close();

    // ============================================================ DEVELOPER tools (temporary copy with the flag on)
    const c6 = await br.newContext(); let p6 = await page(c6, DEV);
    I = await info(p6);
    ok('DEV: tools enabled only by Config.CHAR3D_DEV_TOOLS', I.dev && !I.origin);
    await settings(p6);
    ok('DEV: model picker visible in the developer section', await p6.isVisible('[data-char3d=file]') && /No model saved/.test(await p6.textContent('[data-char3d=saved]')));
    await p6.setInputFiles('[data-char3d=file]', { name: 'not-a-model.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('this is not a glb') });
    await p6.waitForTimeout(800); I = await info(p6);
    ok('DEV: an invalid file is rejected with a message and nothing is saved', /Could not use not-a-model\.glb/.test(await p6.textContent('[data-char3d=status]')) && !I.saved && !I.origin);
    await p6.setInputFiles('[data-char3d=file]', { name: 'yuji_itadori.glb', mimeType: 'model/gltf-binary', buffer: remembered });
    await p6.waitForFunction(() => /Saved/.test(document.querySelector('[data-char3d=status]').textContent), null, { timeout: 30000 });
    await p6.reload(); await p6.waitForFunction(() => JJK.Char3D.ready, null, { timeout: 30000 }); I = await info(p6);
    ok('DEV: a chosen model is remembered and loads after a reload (' + I.source + ')', I.origin === 'saved' && I.offset === 0.08 && I.clips === 7);
    B = await battle(p6); const dc = await fightUntilPunch(p6);
    ok('DEV: the remembered model fights in 3D (L ' + dc.punchL + ' / R ' + dc.punchR + ')', B.snap.length === 1 && B.snap[0].clips && dc.punchL + dc.punchR > 1);
    await settings(p6); await p6.click('[data-char3d=forget]'); await p6.waitForTimeout(400);
    await p6.reload(); await p6.waitForFunction(() => JJK.Char3D.ready, null, { timeout: 30000 }); I = await info(p6);
    ok('DEV: "Forget saved model" returns Yuji to 2D', !I.origin && !I.saved);
    await c6.close();
    const c7 = await br.newContext(); const p7 = await page(c7, DEV_MODEL);
    await settings(p7);
    await p7.setInputFiles('[data-char3d=file]', { name: 'yuji_itadori.glb', mimeType: 'model/gltf-binary', buffer: remembered });
    await p7.waitForFunction(() => /Saved/.test(document.querySelector('[data-char3d=status]').textContent), null, { timeout: 30000 });
    await p7.reload(); await p7.waitForFunction(() => JJK.Char3D.ready, null, { timeout: 30000 }); I = await info(p7);
    ok('DEV: the bundled yuji.glb always takes priority over a saved one', I.origin === 'bundled' && I.offset === 0.28 && I.saved && I.saved.name === 'yuji_itadori.glb');
    await c7.close();
  } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
  ok('temporary sites removed; nothing written into the project', !fs.existsSync(tmp) && !fs.existsSync(path.join(ROOT, 'assets/models/yuji.glb')));

  ok('no JavaScript errors (an absent optional yuji.glb 404 is expected and ignored)', errs.length === 0, errs.slice(0, 4).join(' | '));
  await br.close();
  const failed = res.filter((r) => !r.c);
  console.log('\n' + (res.length - failed.length) + '/' + res.length + ' model-loading checks passed');
  if (failed.length) { console.log('FAILED:\n' + failed.map((f) => ' - ' + f.n + ' ' + (f.extra || '')).join('\n')); process.exit(1); }
})().catch((e) => { console.error('CHAR3D-LOAD CRASH', e); process.exit(2); });
