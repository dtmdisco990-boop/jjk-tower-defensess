/* SKIBRIB CHALLENGE presentation: the map card + SUFFER panel on the Play screen, every in-battle story beat (act titles, the
   Wave 65 dread intro, "1/3 OF THE WAY THERE", "YOU HAVE 25 WAVES LEFT", the Wave 70 fake ending + glitch + "LOL NO", the silence
   before 75, the final boss ENRAGE alarms) and the death / victory results screens. Purely cosmetic: it never changes the battle. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const UI = JJK.UI, { Util } = JJK;
  const SK = () => JJK.Skibrib;
  const el = (...a) => UI.el(...a);
  const SKULLS = '💀'.repeat(10);
  const fmtT = (s) => (Util.fmtTime ? Util.fmtTime(s) : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));

  // ------------------------------------------------------------------ Play screen
  function mapCard(id, selected, onPick, w) {
    const m = JJK.Maps[id];
    const card = el('button', { class: 'mapcard skibcard' + (selected ? ' on' : ''), type: 'button', style: 'width:' + w + 'px;height:112px', 'aria-label': m.name });
    const cv = el('canvas', { width: w, height: 112 });
    try { JJK.Backgrounds.draw(cv.getContext('2d'), id, w, 112); } catch (e) { /* art still loading */ }
    card.appendChild(cv);
    card.appendChild(el('div', { class: 'cap' }, [el('b', { class: 'skibtitle', text: m.name }), el('span', { class: 'skulls', text: SKULLS })]));
    card.addEventListener('click', onPick);
    return card;
  }

  function sufferFlow(start) {
    const A = JJK.Audio;
    UI.modal({
      title: 'Are you sure?', width: 420, dismiss: false,
      body: el('div', { class: 'skibq', text: '75 waves. No checkpoints. Lose anywhere and it is Wave 1.' }),
      buttons: [
        { label: 'NO' },
        { label: 'YES', cls: 'danger', onClick: () => {
          A.sfx('telegraph');
          setTimeout(() => UI.modal({
            title: 'Are you REALLY sure?', width: 460, dismiss: false,
            body: el('div', { class: 'skibq', text: 'This is your last chance to walk away with your dignity.' }),
            buttons: [{ label: 'YES', cls: 'danger', onClick: () => { A.sfx('flush'); start(); } }, { label: 'I HAVE CHANGED MY MIND', cls: 'primary' }],
          }), 30);
        } },
      ],
    });
  }

  function infoPanel(p, start) {
    const m = JJK.Maps.skibrib, K = p.d.skibrib;
    const pan = el('div', { class: 'panel col skibpanel scroll', style: 'width:520px;flex:none;gap:8px;overflow:auto' });
    pan.append(
      el('div', { class: 'skibhead', text: 'SKIBRIB CHALLENGE' }),
      el('div', { class: 'row', style: 'gap:10px;align-items:center' }, [el('span', { class: 'dim', style: 'font-size:12px;letter-spacing:2px', text: 'DIFFICULTY' }), el('span', { class: 'skulls big', text: SKULLS })]),
      el('div', { class: 'skibdesc', text: '"' + m.desc + '"' }),
      el('div', { class: 'dim', style: 'font-size:12.5px', text: '75 waves · no checkpoints · 15 lives · 50% sell refund · a starving economy · 4 bosses · requires nothing to unlock. Your current team is used.' }),
      el('div', { style: 'font-size:12.5px' }, [el('b', { class: 'gold', text: 'Map: ' }), m.twist]),
    );
    const rec = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px 14px;font-size:12px' });
    const r = (k, v) => rec.appendChild(el('span', null, [el('span', { class: 'dim', text: k + ' ' }), el('b', { text: v })]));
    r('Attempts', String(K.attempts)); r('Deaths', String(K.deaths)); r('Highest wave', K.highestWave + ' / 75');
    r('Completed', K.completed ? 'YES (' + K.wins + 'x)' : 'never'); if (K.bestTime) r('Best time', fmtT(K.bestTime)); if (K.bestLives) r('Best lives left', String(K.bestLives));
    pan.appendChild(rec);
    const er = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:4px' });
    for (const id of m.enemies) { const im = el('img', { src: JJK.Art.enemyThumbURL(id, 44), width: 38, height: 38, style: 'border-radius:5px;border:1px solid #3a3566', alt: JJK.Enemies[id].name }); UI.tip(im, () => UI.enemyTipText(id)); er.appendChild(im); }
    for (const id of SK().BOSSES) { const im = el('img', { src: JJK.Art.enemyThumbURL(id, 44), width: 38, height: 38, style: 'border-radius:5px;border:2px solid #ff3b5c', alt: JJK.Bosses[id].name }); UI.tip(im, () => '<b style="color:#ff5a7a">' + JJK.Bosses[id].name + '</b> · ' + JJK.Bosses[id].title + '<br>' + JJK.Bosses[id].mechanics.map((x) => '• ' + x).join('<br>')); er.appendChild(im); }
    pan.append(el('div', { class: 'dim', style: 'font-size:11px;letter-spacing:1px', text: 'THE TROLLS (hover for details)' }), er, el('div', { class: 'grow' }));
    const team = p.getLoadout();
    const go = UI.btn('SUFFER', () => sufferFlow(start), 'danger big sufferbtn', { disabled: team.length === 0 });
    pan.appendChild(go);
    if (!team.length) pan.appendChild(el('div', { class: 'hot', style: 'font-size:12px;text-align:center', text: 'Pick at least 1 character for your team →' }));
    return pan;
  }

  // ------------------------------------------------------------------ battle
  function overlay(root, cls, kids, ms) {
    const o = el('div', { class: 'skibover ' + (cls || '') }, kids);
    root.appendChild(o);
    if (ms) setTimeout(() => o.remove(), ms);
    return o;
  }
  function attachBattle(ctx, o) {
    const { battle, root, banner, A, R, bossBar, lab } = o;
    const on = (e, fn) => UI.sub(ctx, battle.events, e, fn);
    const timers = [];
    const later = (ms, fn) => { const t = setTimeout(() => { if (!battle.over || fn.always) fn(); }, ms); timers.push(t); return t; };
    ctx.onExit(() => { timers.forEach(clearTimeout); clearInterval(alarmT); });
    let alarmT = 0;
    const music = (m) => later(30, () => A.music(m));
    if (lab) overlay(root, 'skibtag', [el('div', { text: 'SANDBOX: this run does not count' })], 3500);
    music('skibrib');
    // act titles + scripted messages
    on('wave', (e) => {
      const spec = e.spec || {};
      const act = SK().ACTS.find((x) => x[0] === e.n);
      if (spec.intro) {
        // WAVE 65: the dread intro
        A.music(null); A.sfx('heartbeat'); later(1500, () => A.sfx('heartbeat'));
        overlay(root, 'dread', [el('div', { class: 'big', text: 'WAVE 65' }), el('div', { class: 'sub', text: 'THE WAVE PEOPLE HATE' })], 4200);
        later(3600, () => A.music('skibFinal'));
        return;
      }
      if (e.n === 61) { overlay(root, 'regards', [el('div', { class: 'big', text: 'THE OWNER SENDS HIS REGARDS.' })], 3200); A.sfx('lolno'); }
      else if (act && e.n !== 1) later(900, () => banner(act[1], 'WAVES ' + e.n + '+', '#ff4ad0'));
      if (spec.msg && e.n !== 61) later(act ? 2600 : 1200, () => overlay(root, 'note', [el('div', { text: spec.msg })], 3000));
      if (e.n === 75) { A.music('skibFinal'); }
      else if (e.n === 66 || e.n === 71) music('skibFinal');
    });
    on('waveClear', (e) => {
      const spec = battle.waves[e.n - 1] || {};
      if (spec.fakeEnd) {
        // WAVE 70: the fake ending
        battle.autoTimer = Math.max(battle.autoTimer, 8);
        A.music(null); A.sfx('victory');
        const ov = overlay(root, 'fakewin', [el('div', { class: 'big', text: 'SKIBRIB CHALLENGE COMPLETE!' }), el('div', { class: 'sub', text: 'VICTORY · 70 / 70' })]);
        later(2000, () => { ov.classList.add('glitch'); A.sfx('glitch'); if (R.vfx) { R.vfx.flash('#ff4ad0', 0.5, 0.45); R.vfx.shake(8, 0.5); } });
        later(2700, () => { UI.clear(ov); ov.classList.remove('glitch'); ov.classList.add('lolno'); ov.append(el('div', { class: 'big', text: 'LOL NO.' }), el('div', { class: 'sub', text: '5 WAVES REMAIN.' })); A.sfx('lolno'); });
        later(5600, () => { ov.remove(); music('skibFinal'); });
        return;
      }
      if (e.n === 74) {
        // brief silence before the real final boss
        A.music(null);
        later(900, () => overlay(root, 'shouldstop', [el('div', { class: 'big', text: 'You should have stopped.' })], 4200));
        return;
      }
      if (spec.clearMsg) later(1400, () => overlay(root, 'note', [el('div', { text: spec.clearMsg })], 3200));
    });
    on('bossSpawn', (e) => { if (e.enemy.type === 'skibAbom' || e.enemy.type === 'skibKing') music('skibFinal'); else music('boss'); });
    on('bossDeath', (e) => {
      const t = e.enemy.type;
      if (t === 'skibPrime') later(600, () => overlay(root, 'milestone', [el('div', { class: 'big', text: '1/3 OF THE WAY THERE 💀' })], 3600));
      if (t === 'skibDemon') {
        later(500, () => {
          const ov = overlay(root, 'milestone', [el('div', { class: 'big', text: 'CONGRATULATIONS!' })]);
          later(2200, () => { UI.clear(ov); ov.append(el('div', { class: 'big', text: 'YOU HAVE 25 WAVES LEFT.' })); A.sfx('lolno'); });
          later(5200, () => ov.remove());
        });
      }
      if (t !== 'skibAbom') music('skibrib');
      clearInterval(alarmT); bossBar.classList.remove('enrage'); root.classList.remove('skibenrage');
    });
    on('skibEnrage', () => {
      bossBar.classList.add('enrage'); root.classList.add('skibenrage');
      A.sfx('alarm');
      if (R.vfx) { R.vfx.shake(6, 0.8); R.vfx.flash('#ff2a3a', 0.6, 0.35); }
      alarmT = setInterval(() => { if (battle.over || !battle.enemies.some((x) => x.alive && x.type === 'skibAbom')) { clearInterval(alarmT); return; } A.sfx('alarm'); if (R.vfx) R.vfx.shake(3, 0.35); }, 3200);
    });
    on('defeat', () => { clearInterval(alarmT); });
  }

  // ------------------------------------------------------------------ results
  function confetti(host) {
    const cv = el('canvas', { class: 'skibconfetti', width: 1280, height: 720 });
    host.appendChild(cv);
    const g = cv.getContext('2d'); if (!g) return;
    const ps = Array.from({ length: 220 }, (_, i) => ({ x: Math.random() * 1280, y: -Math.random() * 720, v: 80 + Math.random() * 220, w: Math.random() * 6.28, s: 4 + Math.random() * 7, h: (i * 37) % 360, r: Math.random() * 6 }));
    let last = performance.now(), alive = true;
    const loop = (now) => {
      if (!alive || !cv.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, 1280, 720);
      for (const p of ps) { p.y += p.v * dt; p.x += Math.sin(now / 400 + p.w) * 40 * dt; p.r += dt * 4; if (p.y > 740) { p.y = -10; p.x = Math.random() * 1280; } g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = 'hsl(' + ((p.h + now / 20) % 360) + ',100%,62%)'; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setTimeout(() => { alive = false; cv.remove(); }, 20000);
  }
  function results(ctx, r, p) {
    const A = JJK.Audio, root = ctx.root, K = r.skibrib;
    const col = el('div', { class: 'col scroll skibres' + (r.victory ? ' win' : ' lose'), style: 'height:100%;padding:0 80px;gap:10px;overflow:auto' });
    root.appendChild(col);
    const stats = el('div', { class: 'row', style: 'justify-content:center;gap:12px;flex-wrap:wrap' });
    const stat = (k, v) => el('div', { class: 'panel', style: 'padding:8px 16px;text-align:center;min-width:110px' }, [el('div', { class: 'dim', style: 'font-size:11px;letter-spacing:2px', text: k }), el('div', { style: 'font-family:var(--head);font-size:24px', text: v })]);
    if (r.debug) col.appendChild(el('div', { class: 'pill', style: 'align-self:center;border-color:#f80;color:#fb4;margin-top:16px', text: 'SANDBOX / DEBUG RUN: nothing was recorded' }));
    if (r.victory) {
      A.music(null); setTimeout(() => A.sfx('skibWin'), 200);
      confetti(root);
      const t1 = el('div', { class: 'skibwin1', text: 'YOU ACTUALLY BEAT' }), t2 = el('div', { class: 'skibwin2', text: 'SKIBRIB CHALLENGE.' }), t3 = el('div', { class: 'skibwin3', text: 'WHAT IS WRONG WITH YOU?' });
      col.append(t1, t2, t3);
      if (K) UI.append(stats, [stat('ATTEMPTS', String(K.attempts)), stat('TIME', fmtT(K.duration)), stat('DAMAGE', UI.fmt(K.damage)), stat('UNITS PLACED', String(K.deploys)), stat('UNITS SOLD', String(K.sold)), stat('LIVES LEFT', K.lives + ' / 15')]);
      col.appendChild(stats);
      if ((r.challenges || []).some((c) => c.id === 'skib_win') || (K && K.wins === 1)) col.appendChild(el('div', { class: 'skibach', text: '🏆 ACHIEVEMENT UNLOCKED: SKIBRIB SURVIVOR' }));
    } else {
      const msgs = SK().DEATH_MESSAGES;
      col.appendChild(el('div', { class: 'skibdeath', text: msgs[Math.floor(Math.random() * msgs.length)] }));
      col.appendChild(el('div', { class: 'dim', style: 'text-align:center;letter-spacing:4px', text: r.forfeit ? 'YOU WALKED AWAY.' : 'BACK TO WAVE 1.' }));
      if (K) UI.append(stats, [stat('REACHED', 'WAVE ' + K.wave), stat('CLEARED', K.wavesCleared + ' / 75'), stat('HIGHEST EVER', K.highestWave + (K.newHighest ? ' ★' : '')), stat('ATTEMPTS', String(K.attempts)), stat('DEATHS', String(K.deaths)), stat('TIME', fmtT(K.duration))]);
      col.appendChild(stats);
      if (K && K.newHighest && K.wavesCleared > 0) col.appendChild(el('div', { class: 'gold', style: 'text-align:center;font-family:var(--head);letter-spacing:6px;font-size:20px', text: '★ NEW PERSONAL RECORD: WAVE ' + K.wavesCleared + ' ★' }));
    }
    // rewards + milestones (compact)
    const R = r.rewards || {};
    const rw = el('div', { class: 'row', style: 'justify-content:center;gap:10px;flex-wrap:wrap' });
    if (R.coins) rw.appendChild(el('span', { class: 'pill' }, [UI.icon('coins', 16), ' +' + UI.fmt(R.coins)]));
    if (R.gems) rw.appendChild(el('span', { class: 'pill' }, [UI.icon('gems', 16), ' +' + UI.fmt(R.gems)]));
    if (R.playerXp) rw.appendChild(el('span', { class: 'pill' }, [UI.icon('xp', 16), ' +' + R.playerXp + ' XP']));
    for (const ch of r.challenges || []) rw.appendChild(el('span', { class: 'pill gold', text: '✓ ' + ch.name }));
    col.appendChild(rw);
    const acts = el('div', { class: 'row', style: 'justify-content:center;gap:12px;margin:8px 0 18px' });
    acts.appendChild(UI.btn('MAIN MENU', () => UI.show('menu'), ''));
    acts.appendChild(UI.btn('MAP SELECT', () => UI.show('play', { from: 'menu' }), ''));
    const retry = ctx.params.retry;
    if (retry && !r.victory) acts.appendChild(UI.btn('SUFFER AGAIN', () => sufferFlow(() => UI.show('battle', Object.assign({ from: 'play' }, retry))), 'danger'));
    col.appendChild(acts);
  }

  function menuBadge(wrap, p) {
    if (!p.d.skibrib || !p.d.skibrib.completed) return;
    wrap.appendChild(el('div', { class: 'skibbadge', text: '🏆 SKIBRIB SURVIVOR', tip: 'Beat SKIBRIB CHALLENGE ' + p.d.skibrib.wins + 'x' }));
  }

  JJK.SkibUI = { mapCard, infoPanel, sufferFlow, attachBattle, results, menuBadge, SKULLS };
})(typeof window !== 'undefined' ? window : globalThis);
