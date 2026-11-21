/* RISE OF JAHJUAN UI: main-menu entry, map card, the Court Briefing dossier (full pre-run disclosure), the in-battle Court
   Header / Standing Record / inspector strip, and the forensic Court Verdict screen. Reads battle events, court.forecast()
   and the trace only; every command still goes through the six native player actions. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { UI, Util } = JJK;
  const CD = JJK.CourtData;
  if (!UI || !CD) return;
  const el = UI.el, C = CD.C, ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  const DCOL = { NW: '#7fb7ff', SW: '#7fffd0', NE: '#ffb27f', SE: '#ff86c8', C: '#e8c25a', E: '#c0c0d8' };
  const sec = (t) => (t / 60).toFixed(1) + 's';
  const pct = (x) => (x * 100).toFixed(2) + '%';
  const iu = () => CD.integrityUnit();

  // ------------------------------------------------------------ entry points
  function menuButton(wrap, p) {
    const b = UI.btn('', () => briefing(p), 'courtbtn', { 'aria-label': 'RISE OF JAHJUAN', 'data-court': 'menu' });
    b.append(el('span', { class: 'ct', text: 'RISE OF JAHJUAN' }), el('span', { class: 'cs', text: 'The Court of Nine Reflections · unlocked' }));
    wrap.appendChild(b);
  }
  function mapCard(id, on, onClick, cw) {
    const card = el('button', { class: 'mapcard courtcard' + (on ? ' on' : ''), type: 'button', style: 'width:' + cw + 'px;height:112px', 'aria-label': 'RISE OF JAHJUAN' });
    const cv = el('canvas', { width: cw, height: 112 });
    try { JJK.Backgrounds.draw(cv.getContext('2d'), id, cw, 112); } catch (e) { /* drawn on next render */ }
    card.append(cv, el('div', { class: 'mc-name', text: 'RISE OF JAHJUAN' }), el('div', { class: 'mc-sub', text: 'Court of Nine Reflections' }));
    card.addEventListener('click', onClick);
    return card;
  }
  function infoPanel(p, start) {
    const R = p.d.court || {};
    const pan = el('div', { class: 'panel courtpanel col', style: 'gap:8px;padding:14px' });
    pan.append(el('h2', { class: 'gold', text: 'RISE OF JAHJUAN' }), el('div', { class: 'dim', text: 'Chief Justice of the Nine Reflections. Twelve Preparation Dockets, then one nine-phase trial. Every law is announced six seconds before it acts.' }),
      el('div', { text: 'Attempts ' + (R.attempts || 0) + ' · Wins ' + (R.wins || 0) + (R.bestArticles ? ' · Best Recitation ' + R.bestArticles + '/8' : '') }),
      UI.btn('OPEN THE COURT BRIEFING', start, 'primary', { 'data-court': 'brief' }), JJK.CourtReplay ? UI.btn('▶ WATCH A WINNING RUN', () => JJK.CourtReplay.start(), '', { 'data-court': 'watch2' }) : null);
    return pan;
  }

  // ------------------------------------------------------------ the Court Briefing
  function briefing(p) { UI.show('courtBriefing', { from: 'menu' }); }
  UI.register('courtBriefing', {
    enter(ctx) {
      const p = UI.profile, root = ctx.root;
      const wrap = el('div', { class: 'courtbrief col' });
      root.appendChild(wrap);
      const tabs = el('div', { class: 'row ctabs' }), body = el('div', { class: 'cbody scroll' });
      const T = [['MAP', mapTab], ['DOCKET', docketTab], ['SYSTEMS', systemsTab], ['RECORD', recordTab], ['SCALES', scalesTab], ['CHECKLIST', () => checklistTab(p)]];
      let cur = 0;
      const show = (i) => { cur = i; [...tabs.children].forEach((b, k) => b.classList.toggle('on', k === i)); UI.clear(body); body.appendChild(T[i][1]()); };
      T.forEach(([n], i) => tabs.appendChild(UI.btn(n, () => show(i), 'small', { 'data-tab': n })));
      const head = el('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, [
        el('div', null, [el('h1', { class: 'gold', text: 'THE COURT BRIEFING' }), el('div', { class: 'dim', text: 'Everything the Court will do is disclosed here first. Nothing is learned by dying.' })]),
        el('div', { class: 'row', style: 'gap:8px' }, [UI.btn('BACK', () => UI.show('menu'), ''), JJK.CourtReplay ? UI.btn('▶ WATCH A WINNING RUN', () => JJK.CourtReplay.start(), 'gold', { 'data-court': 'watch', tip: 'Watch the bot clear the Court with the four level-1 starters. Nothing is recorded.' }) : null, UI.btn('ENTER THE COURT', () => enter(p), 'primary', { 'data-court': 'enter' })].filter(Boolean))]);
      wrap.append(head, tabs, body);
      show(0);
    },
  });
  function enter(p) {
    const team = p.getLoadout();
    if (!team.length) { UI.toast('Choose at least one character.', 'bad'); return; }
    const adv = advisory(team);
    const body = el('div', { class: 'col', style: 'gap:6px' }, [el('div', { text: 'Loadout: ' + team.map((id) => JJK.Characters[id].name).join(', ') }),
      ...adv.map((a) => el('div', { class: 'warn', text: '⚠ ' + a })), el('div', { class: 'dim', text: '620 Yen · 12 lives · native prices and 70% refunds. The Court grants coins and XP only.' })]);
    UI.modal({ title: 'Confirm your loadout', body, buttons: [{ label: 'CHANGE TEAM', onClick: () => UI.show('play', { from: 'menu' }) }, { label: 'ENTER THE COURT', cls: 'primary', onClick: () => { p.d.settings.lastMap = 'court_of_nine'; UI.show('battle', { mapId: 'court_of_nine', diff: 'court', mode: 'story', from: 'menu' }); } }] });
  }
  function advisory(team) {
    const defs = team.map((id) => JJK.Characters[id]).filter(Boolean);
    const out = [];
    if (!defs.some((d) => d.targets !== 'ground' || d.id === 'yuji')) out.push('No anti-air: Air Dockets fly over the Crossing benches.');
    const cursed = defs.some((d) => d.base.dtype === 'cursed' || ['nobara', 'megumi', 'yuji'].includes(d.id));
    const phys = defs.some((d) => d.base.dtype === 'phys');
    if (!(cursed && phys)) out.push('Only one doctrine: Appellate Parity and Contra Proferentem demand both Corpus and Animus.');
    if (defs.filter((d) => !/Support|Tank/.test(d.role)).length < 2) out.push('Only one damage dealer: the Bill of Attainder will brand it.');
    return out;
  }
  function mapTab() {
    const box = el('div', { class: 'col', style: 'gap:6px' });
    const cv = el('canvas', { width: 960, height: 540, class: 'cmap' }); const g = cv.getContext('2d');
    g.scale(0.75, 0.75); g.drawImage(JJK.Backgrounds.get('court_of_nine'), 0, 0);
    g.strokeStyle = '#9ad8ff'; g.lineWidth = 2; g.setLineDash([6, 6]);
    for (const a of CD.AIR) { g.beginPath(); a.forEach(([c, r], i) => (i ? g.lineTo(CD.tx(c), CD.ty(r)) : g.moveTo(CD.tx(c), CD.ty(r)))); g.stroke(); }
    g.setLineDash([]); g.fillStyle = '#fff'; g.font = '700 16px sans-serif';
    g.fillText('Upper Air', CD.tx(1), CD.ty(0.6)); g.fillText('Lower Air', CD.tx(1), CD.ty(7.6));
    g.fillStyle = '#e8c25a'; g.fillText('Procession: 24.0 s per lap, over all four Crossing benches', CD.tx(4.6), CD.ty(4.15));
    box.append(cv, el('ul', null, ['20 benches: 16 Ground, 4 Elevated Podiums (▲). Districts NW, SW, NE, SE are galleries; C (Clerk\'s Well) and E (Exit Bailiff) are neutral: full damage, no signatures.',
      'West benches are 2.0 tiles apart (safe from 1.4-tile splash disables, too wide for a 1.6-tile ward); East benches (14,r)/(15,r) are 1.0 apart: a Panda on (15,2) or (15,6) wards the East podium.',
      'All four ground routes NN, NS, SN, SS are exactly 33 tiles; the Second Fork is at 1,152 px and the Exit Gate at 1,856 px. The two air lanes mirror across the midline.',
      'Jahjuan marches the raised Procession Causeway (5,3)→(14,3)→(14,5)→(5,5): never blocks, never leaks. Odd phases start at (5,3) going East; even phases at (14,5) going West.'].map((t) => el('li', { text: t }))));
    return box;
  }
  function docketTab() {
    const box = el('div', { class: 'col', style: 'gap:10px' });
    const tb = el('table', { class: 'ctable' }); tb.appendChild(el('tr', null, ['Docket', 'Score', 'What it rehearses'].map((h) => el('th', { text: h }))));
    for (const w of CD.PREP) tb.appendChild(el('tr', null, [el('td', { text: String(w.n) }), el('td', { class: 'mono', text: w.score }), el('td', { text: w.note })]));
    box.append(el('h3', { text: 'The 12-wave Preparation Docket (W wisp, K skitter, B brute, A wraith, S shell, L leech, G aegis, T twin, H hexer)' }), tb);
    const pt = el('table', { class: 'ctable' }); pt.appendChild(el('tr', null, ['Phase', 'Integrity', 'Escorts', 'Laws (reading ticks; every reading opens with a Weighing, vulnerability [960,1560) unless delayed by Bell Debt)', 'Verdict'].map((h) => el('th', { text: h }))));
    for (let n = 1; n <= 8; n++) {
      const P = CD.PHASES[n];
      const laws = (P.laws || []).map((l) => l.kind + (l.zone ? ' ' + l.zone : '') + ' ' + (l.b != null ? '[' + l.a + ',' + l.b + ')' : '@' + l.a) + ' (disclosed ' + l.disclose + ')');
      if (P.bell) laws.unshift('Bell [480,720)'); if (P.adjourn) laws.push('Adjournment [1200,1440)');
      laws.push('Packet 2 route: ' + (Array.isArray(P.route) ? P.route.join(' / ') : P.route));
      pt.appendChild(el('tr', null, [el('td', { text: ROMAN[n] + ' · ' + P.name }), el('td', { text: CD.phaseMax(iu(), n) + ' HP' }), el('td', { class: 'mono', text: P.esc.join('  ') }), el('td', { text: laws.join('; ') }), el('td', { text: P.verdict })]));
    }
    box.append(el('h3', { text: 'The nine phases (three readings each in I-VIII; a third failure is defeat)' }), pt);
    const mt = el('table', { class: 'ctable' }); mt.appendChild(el('tr', null, ['Measure', 'Escorts', 'Laws', 'Verdict'].map((h) => el('th', { text: h }))));
    const MV = { A: 'West seal; kill Packet 2\'s True Witness before the Exit Gate; Integrity <= 75% (floor 65%).', B: 'East seal; the half opposite A\'s signer delivers 2.0% in the open window; the doctrine opposite A\'s delivers 1.0%; Integrity <= 40% (floor 30%).', C: 'Narrow Majority with a gallery other than A/B; every gallery 1.0% across A-C; Integrity <= 15% (floor 10%); both Scale axes Level at the verdict.', D: 'The Recitation [0,1440): eight 3.0 s Articles read the Record backwards; each unaffirmed Article removes 1.5 s from the Last Word [1560,1920). Execute with a gallery hit; the most-cited gallery is Estopped.' };
    for (const M of CD.MEASURES) mt.appendChild(el('tr', null, [el('td', { text: M.id + ' · ' + M.name }), el('td', { class: 'mono', text: M.esc.map((e) => e.s + '(' + e.half + ')').join(' ') }), el('td', { text: M.laws.map((l) => l.kind + (l.zone ? ' ' + l.zone : '') + (l.b != null ? ' [' + l.a + ',' + l.b + ')' : ' @' + l.a)).join('; ') }), el('td', { text: MV[M.id] })]));
    box.append(el('h3', { text: 'Phase IX: one continuous 128-second trial in four Measures (' + CD.phaseMax(iu(), 9) + ' HP)' }), mt);
    return box;
  }
  const SYSTEMS = [
    ['I · The Iron Switch', 'Every packet\'s bridge order (Straight ═ or Countermarch ✕) is shown 6 s before it binds. At 1,152 px a curse commits to its gallery for good.'],
    ['II · The Witness Chain', 'A marked runner [I] links to an Escort (×0.70 damage while linked). Kill it before the Exit Gate for 1 Testimony; crowd control on a linked Witness slows relinking.'],
    ['III · The Book of Precedent', 'The district that removed the most of his HP in the last 12 s deals ×0.65 to him for 6 s, starting 6 s after it is named.'],
    ['IV · The Closed Bench', 'The gallery holding the most capital (plus half of anything sold there in the last 6 s) is sealed against new placement for 8 s.'],
    ['V · The Bell Debt', 'Each Domain you cast during the Bell [8 s, 12 s) delays the vulnerability window by 2 s (max 2).'],
    ['VI · The Gallery Seals', 'Phases demand signatures: a gallery must deal θ of the phase\'s Integrity in qualifying damage. θ = 4% + 1% per Citation, capped at 8%. Neutral pads never sign.'],
    ['VII · The Court Calendar', 'Outside the open window he takes 25% damage; inside it, full damage. Readings are 32 s; Judgment falls at the end of each.'],
    ['VIII · Dual Jurisprudence', 'Physical is Corpus, cursed is Animus. If one doctrine dealt over 68% of the last 12 s, it deals ×0.55 for 6 s and cannot carry a seal past half θ until the other doctrine shows up.'],
    ['IX · Sequestration & Bail', 'Selling mid-wave locks the tile for 12 s, and forfeits half of that tower\'s contribution to an incomplete seal in its gallery.'],
    ['X · The Perjury Mirror', 'A Perjurer [X] trails the Witness. Killing it within 2.5 tiles of a living Witness cleanses the Witness, shields it and taints your Testimony.'],
    ['XI · Gavel & Quorum', 'The Bench Warrant cleaves the quadrant his hitbox stands in (the canal band parries it into the water). The Supreme En Banc disables everyone not covered by a Domain Clash, a Quorum (1.5% this reading) or a ward.'],
    ['XII · The Standing Record', 'Every verdict writes a permanent row: the first gallery to sign and its doctrine. Each seal adds a Citation to its gallery. The last remedy you used against an En Banc is weaker at the next.'],
    ['XIII · The Hanging Scales', 'Capital is weight. If either axis holds more than 65% on one side at a Weighing, the floor lists: curses run downhill there (+12%), and the low corner floods.'],
    ['XIV · Specular Inversion', 'A tower standing in water targets by reflection: first↔last, strongest↔weakest. Set the opposite mode before the water arrives.'],
    ['XV · Habeas Corpus & Remand', 'During a disclosed window his reflection across the midline holds the hitbox; a Remand reverses his march. Both are shown 6 s ahead.'],
    ['XVI · Bill of Attainder', 'The character who removed the most of his HP in the last 12 s deals normal damage but signs nothing for the window. The brand follows the character, not the tower.'],
    ['XVII · Gag Order', 'For the window, nobody may change targeting. Set your answer before it falls.'],
    ['XVIII · Forum of Least Resistance', 'Some packets are routed to whichever East gallery did the least escort killing in the last 12 s.'],
  ];
  function systemsTab() { const box = el('div', { class: 'cgrid' }); for (const [t, d] of SYSTEMS) box.appendChild(el('div', { class: 'panel csys' }, [el('b', { text: t }), el('div', { text: d })])); box.appendChild(el('div', { class: 'panel csys' }, [el('b', { text: 'Warded Sovereign' }), el('div', { text: 'A hexer escort within 2.2 tiles wards him (−25% damage taken) exactly as it wards other curses.' })])); return box; }
  const ART_GEO = [['VIII', 'North edge 5.0→7.75', ['NW']], ['VII', 'North edge 7.75→10.5', ['NW', 'NE']], ['VI', 'North edge 10.5→13.25', ['NE']], ['V', '(13.25,3)→ East leg ↓', ['NE', 'SE']],
    ['IV', 'South edge 14→11.25', ['SE']], ['III', 'South edge 11.25→8.5', ['SE', 'SW']], ['II', 'South edge 8.5→5.75', ['SW']], ['I', 'West leg ↑ to (5,3)', ['SW', 'NW']]];
  function recordTab() {
    const box = el('div', { class: 'col', style: 'gap:8px' });
    box.append(el('p', { text: 'At each phase\'s Judgment the Court writes one immutable row: the Signer of Record (first gallery to notarize a requested seal) and its doctrine. Measures A and B add rows too. In Measure D the Record is read backwards: Article j calls the signer of Phase 9−j while Jahjuan walks the stretch shown below (zero control delay). A Called gallery must land one qualifying hit inside its 3-second Article, or the Article is Struck and 1.5 s is cut from the Last Word. A hit of the opposite doctrine also files a Dissent that refunds a Strike. The gallery with the most Citations is Estopped from executing; a 4-4-4-4 Record has none.' }));
    const cv = el('canvas', { width: 640, height: 360, class: 'cmap' }), g = cv.getContext('2d');
    const info = el('div', { class: 'panel', style: 'padding:8px' });
    const pick = (j) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 640, 360); g.scale(0.5, 0.5); g.drawImage(JJK.Backgrounds.get('court_of_nine'), 0, 0);
      const t0 = (j - 1) * 180, a = JJK.CourtSim.loopXY(t0 * C.FX, { x: 0, y: 0 }), b = JJK.CourtSim.loopXY((t0 + 179) * C.FX, { x: 0, y: 0 });
      g.strokeStyle = '#fff'; g.lineWidth = 12; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      for (const gal of ART_GEO[j - 1][2]) for (const bn of CD.BENCH) if (bn.district === gal) { g.strokeStyle = DCOL[gal]; g.lineWidth = 5; g.strokeRect(CD.tx(bn.c) - 28, CD.ty(bn.r) - 28, 56, 56); }
      UI.clear(info); info.append(el('b', { text: 'Article ' + j + ' reads Phase ' + ART_GEO[j - 1][0] }), el('div', { text: 'Where he stands: ' + ART_GEO[j - 1][1] + '. Galleries beside him: ' + ART_GEO[j - 1][2].join(', ') + '.' }));
    };
    const btns = el('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' });
    for (let j = 1; j <= 8; j++) btns.appendChild(UI.btn('Article ' + j, () => pick(j), 'small', { 'data-article': j }));
    box.append(btns, cv, info); pick(1);
    box.append(el('p', { class: 'dim', text: 'Every tick of control delay you spend anywhere in Phase IX shifts all eight Articles (≈0.0153 tiles per tick). The live Recitation Projection in battle shows the shift.' }));
    return box;
  }
  function scalesTab() {
    const box = el('div', { class: 'col', style: 'gap:8px' });
    box.append(el('p', { text: 'The courthouse hangs from four chains and is itself a balance. Each axis (North/South, West/East) lists when one side holds more than 65% of the capital at a Weighing; the List takes effect 6 s later. A gallery with both axes listing toward it is the low corner: its floor and Ground pads flood. Podiums never flood but always weigh; Crossing pads are ballast beside the pivot.' }));
    const cap = { NW: 1200, SW: 1200, NE: 1200, SE: 1200 };
    const out = el('div', { class: 'panel', style: 'padding:8px' });
    const upd = () => {
      const w = { N: cap.NW + cap.NE, S: cap.SW + cap.SE, W: cap.NW + cap.SW, E: cap.NE + cap.SE };
      const ax = (a, b) => { const hi = Math.max(w[a], w[b]), tot = w[a] + w[b]; return tot && (hi - Math.min(w[a], w[b])) / tot > C.LIST_RHO ? (w[a] > w[b] ? a : b) : null; };
      const ns = ax('N', 'S'), we = ax('W', 'E'), low = ns && we ? ns + we : null;
      UI.clear(out); out.append(el('div', { text: 'North ' + pct(w.N / (w.N + w.S)) + ' · West ' + pct(w.W / (w.W + w.E)) }), el('b', { text: (ns || we ? 'The floor lists ' + [ns, we].filter(Boolean).join(' and ') : 'Level') + (low ? ' → ' + low + ' floods (Depth 2)' : '') }));
    };
    for (const gk of ['NW', 'SW', 'NE', 'SE']) {
      const r = el('input', { type: 'range', min: 0, max: 4000, step: 50, value: cap[gk], 'data-scale': gk });
      r.addEventListener('input', () => { cap[gk] = +r.value; upd(); });
      box.appendChild(el('label', { class: 'row', style: 'gap:8px;align-items:center' }, [el('b', { text: gk, style: 'width:30px;color:' + DCOL[gk] }), r]));
    }
    box.appendChild(out); upd();
    box.append(el('p', { class: 'dim', text: 'With equal capital elsewhere, one gallery can hold about 47.5% of all capital before both axes list.' }));
    return box;
  }
  function checklistTab(p) {
    const team = p.getLoadout();
    const box = el('div', { class: 'col', style: 'gap:6px' });
    for (const t of ['Anti-air on both air lanes (podiums and Crossing benches sit under them)', 'Anti-armor (Animus or pierce for shells)', 'Both doctrines: Corpus (physical) and Animus (cursed)', 'Crowd control or a ward (Panda\'s Steadfast Ward covers the East podium from (15,2)/(15,6))', 'Deploy into all four galleries; keep each Scale axis inside 65/35', 'At least two damage-dealing characters (the Bill of Attainder brands one)', 'A boss-focus targeting plan (strongest/closest focus him; first/last only take him when no curse is in range)'])
      box.appendChild(el('div', { text: '☐ ' + t }));
    for (const a of advisory(team)) box.appendChild(el('div', { class: 'warn', text: '⚠ ' + a }));
    return box;
  }

  // ------------------------------------------------------------ in battle
  function attachBattle(ctx, o) {
    const b = o.battle, c = b.court, root = o.root, A = o.A;
    if (!c) return;
    if (o.replay && JJK.CourtReplay) JJK.CourtReplay.attach(ctx, b, root);
    const hud = el('div', { class: 'courthud' }), head = el('div', { class: 'chead' }), rec = el('div', { class: 'crec' }), laws = el('div', { class: 'claws' });
    hud.append(head); root.append(hud, laws, rec);
    const stack = el('div', { class: 'cbanners' }); root.appendChild(stack);
    const banner = (txt, cls, ms) => { const d = el('div', { class: 'cbanner ' + (cls || ''), text: txt }); stack.appendChild(d); while (stack.children.length > 3) stack.firstChild.remove(); setTimeout(() => d.remove(), ms || 2600); };
    const on = (n, f) => b.events.on(n, f);
    on('courtDocket', (x) => { if (x.docket) banner(x.docket.trial ? 'NEXT: THE TRIAL OF JAHJUAN' : 'DOCKET ' + x.docket.n + ' · ' + x.docket.score + ' — ' + x.docket.note, 'docket', 5400); });
    on('courtPhase', (x) => { banner('PHASE ' + ROMAN[x.phase] + ' · ' + x.name, 'phase', 3200); if (A) A.sfx('boss'); });
    on('courtHungJury', (x) => banner('HUNG JURY (Strike ' + x.strike + '/3): ' + x.fail.text, 'bad', 5200));
    on('courtSeal', (x) => banner('SEALED: ' + x.gallery + (x.via === 'testimony' ? ' (Objection Sustained)' : ''), 'seal', 1800));
    on('courtRecord', (x) => banner('ENTERED INTO THE RECORD: ' + (x.row.phase === 'A' || x.row.phase === 'B' ? 'Measure ' + x.row.phase : 'Phase ' + ROMAN[x.row.phase]) + ' — ' + x.row.signer + ' (' + x.row.doctrine + ')', 'seal', 3200));
    on('courtEstoppel', (x) => banner(x.gallery ? x.gallery + ' IS ESTOPPED FROM THE LAST WORD' : 'UNANIMOUS BENCH: NO GALLERY IS ESTOPPED', 'phase', 3600));
    on('courtRises', (x) => banner('THE COURT RISES — ' + x.net + ' net Strike' + (x.net === 1 ? '' : 's') + '; the Last Word opens at ' + sec(5760 + x.opening), 'phase', 3600));
    on('courtLastWord', () => banner('THE LAST WORD', 'phase', 2200));
    on('courtShatter', (x) => banner('THE CROWN IS SHATTERED' + (x.survivors ? ' — SURVIVE REMAINING ESCORTS (' + x.survivors + ')' : ''), 'win', 4000));
    on('courtGavel', (x) => banner(x.kind === 'warrant' ? 'BENCH WARRANT: ' + x.quadrant.toUpperCase() : 'SUPREME EN BANC: ' + x.remedy.toUpperCase() + (x.exhausted ? ' (exhausted: ' + x.exhausted + ')' : ''), 'docket', 2200));
    on('courtWitness', (x) => banner(x.kind === 'testimony' ? 'TESTIMONY' + (x.tainted ? ' (TAINTED)' : '') : x.kind === 'perjury' ? 'CONTEMPT BY PERJURY' : x.kind === 'hostile' ? 'HOSTILE WITNESS: Testimony void' : 'PRIORITY APPEAL GRANTED', 'seal', 2000));
    let last = 0, raf = 0;
    const tickUI = () => {
      if (!hud.isConnected) return;
      raf = requestAnimationFrame(tickUI);
      const now = performance.now(); if (now - last < 100) return; last = now;
      renderHead(head, b, c); renderLaws(laws, b, c); renderRecord(rec, c); inspector(ctx, b, c);
    };
    raf = requestAnimationFrame(tickUI);
  }
  function stage(c, b) {
    if (c.mode === 'idle') return 'Docket 1 · waiting for you';
    if (c.mode === 'wave') return 'Docket ' + c.n + ' · ' + sec(c.lt);
    if (c.mode === 'inter') return 'Recess · next docket in ' + sec(Math.max(0, C.INTERMISSION - c.lt));
    if (c.mode === 'reading') return 'Phase ' + ROMAN[c.phase] + ' · Reading ' + c.reading + ' · ' + sec(c.lt) + ' / 32.0s';
    if (c.mode === 'measure') return 'Phase IX · Measure ' + CD.MEASURES[c.measure].id + ' · ' + sec(c.lt) + ' / 32.0s';
    if (c.mode === 'cleanup') return 'Escort Cleanup';
    if (c.mode === 'transition') return 'The Chair turns…';
    if (c.mode === 'finale') return 'SURVIVE REMAINING ESCORTS (' + b.enemies.filter((e) => e.alive).length + ')';
    return '';
  }
  function renderHead(h, b, c) {
    const fc = c.forecast(), e = c.boss;
    const th = ['NW', 'SW', 'NE', 'SE'].map((g) => g + ' θ' + (fc.theta[g] * 100).toFixed(0) + '%').join(' · ');
    const lw = c.lastWeigh;
    const sc = lw ? 'N ' + pct(lw.shareN) + ' · W ' + pct(lw.shareW) + (c.list.ns || c.list.we ? ' · LIST ' + [c.list.ns, c.list.we].filter(Boolean).join('/') : ' · Level') + (c.listPending && (c.listPending.ns || c.listPending.we) ? ' · pending ' + [c.listPending.ns, c.listPending.we].filter(Boolean).join('/') : '') : 'Scales: not yet weighed';
    const mit = c.inTrial() ? (c.mitigation() === 1 ? 'FULL DAMAGE' : 'MITIGATED ×0.25') : '';
    UI.clear(h);
    h.append(el('div', { class: 'cst', text: stage(c, b) }), el('div', { class: 'cmid', text: (e && e.alive && c.inTrial() ? 'Integrity ' + Math.ceil(e.hp) + ' / ' + e.maxHp + ' · ' : '') + mit }),
      el('div', { class: 'csm', text: th }), el('div', { class: 'csm', text: '⚖ ' + sc + ' · ' + (fc.budget.spent ? '⛓ UNSTOPPABLE' : 'control ' + fc.budget.lost.toFixed(0) + '/240') }));
    if (c.ph && c.inTrial()) {
      const mx = e.maxHp, chips = el('div', { class: 'row', style: 'gap:6px;justify-content:center' });
      for (const g of ['NW', 'SW', 'NE', 'SE']) { const v = c.ph.seal[g] / (c.theta(g) * mx); chips.appendChild(el('span', { class: 'pill' + (c.ph.notarizedBy[g] ? ' gold' : ''), style: 'border-color:' + DCOL[g], text: g + ' ' + (c.ph.notarizedBy[g] ? '✓' : Math.min(99, Math.floor(v * 100)) + '%') })); }
      if (c.rd) chips.appendChild(el('span', { class: 'pill', text: 'Testimony ' + (c.rd.testimony ? (c.rd.tainted ? 'tainted' : '1') : c.rd.testimonyVoid ? 'void' : '0') + ' · Debt ' + c.debt() }));
      h.appendChild(chips);
    }
  }
  function renderLaws(box, b, c) {
    const fc = c.forecast();
    UI.clear(box);
    const up = fc.laws.filter((l) => (l.state === 'disclosed' && l.a >= c.tick) || (l.state === 'active' && (l.b == null || l.b > c.tick))).sort((x, y) => x.a - y.a).slice(0, 6);
    for (const l of up) {
      const p = l.params, t = l.state === 'active' ? 'until ' + (l.b != null ? sec(l.b - c.tick) : '—') : 'in ' + sec(l.a - c.tick);
      const d = p.district || p.gallery || p.charId || p.mode || p.dominant || l.zone || p.order || '';
      box.appendChild(el('div', { class: 'claw ' + l.state, text: (l.state === 'active' ? '● ' : '○ ') + l.kind.toUpperCase() + (d ? ' ' + d : '') + ' · ' + t }));
    }
  }
  function renderRecord(box, c) {
    UI.clear(box);
    box.appendChild(el('b', { text: 'STANDING RECORD' }));
    for (const r of c.record.rows) box.appendChild(el('div', { text: (typeof r.phase === 'number' ? ROMAN[r.phase] : r.phase) + ' · ' + r.signer + ' · ' + r.doctrine + (r.cosigners && r.cosigners.length ? ' (+' + r.cosigners.join(',') + ')' : '') + ' · r' + r.readings, style: 'color:' + (DCOL[r.signer] || '#fff') }));
    box.appendChild(el('div', { class: 'dim', text: 'Citations ' + ['NW', 'SW', 'NE', 'SE'].map((g) => g + ' ' + c.record.cit[g]).join(' · ') }));
    if (c.ix && c.ix.articles && c.ix.articles.length) box.appendChild(el('div', { text: 'Recitation: ' + c.ix.articles.map((a) => (a.closed ? (a.affirmed ? (a.dissent ? '✓d' : '✓') : '✗') : '·')).join(' ') }));
  }
  function inspector(ctx, b, c) {
    const st = ctx.battleState && ctx.battleState.st; if (!st) return;
    const u = st.selected && b.getUnit(st.selected);
    const pan = ctx.root.querySelector('.upanel');
    if (!u || !pan) return;
    let strip = pan.querySelector('.courtstrip');
    if (!strip) { strip = el('div', { class: 'courtstrip' }); pan.appendChild(strip); }
    const bn = CD.benchAt(u.c, u.r), g = bn ? bn.district : '?';
    const water = c.padState(u.c, u.r);
    const doc = ['nobara', 'megumi'].includes(u.id) || (u.id === 'yuji' && u.level >= 5) ? 'Hybrid' : u.dtype === 'cursed' ? 'Animus' : 'Corpus';
    const mx = c.boss && c.boss.maxHp, seal = c.ph && c.inTrial() && ['NW', 'SW', 'NE', 'SE'].includes(g) ? (c.ph.notarizedBy[g] ? 'Notarized' : 'Uncommitted ' + pct(c.ph.seal[g] / mx) + ' / ' + pct(c.theta(g))) : '—';
    const mods = [];
    const rp = c.activeLaw('redPrecedent'); if (rp && rp.params.district === g) mods.push('Red Precedent');
    const bi = c.activeLaw('blackIndex'); if (bi && bi.params.mode === c.effMode(u)) mods.push('Black Index');
    const at = c.activeLaw('attainder'); if (at && at.params.charId === u.id) mods.push('Attainted');
    if (b.isDisableImmune(u)) mods.push('Warded');
    if (c.rd && ['NW', 'SW', 'NE', 'SE'].includes(g) && mx && c.rd.qual[g] >= C.QUORUM * mx) mods.push('Quorum Exempt');
    const sp = c.sellPreview(u);
    const called = (c.forecast().recitation || []).filter((a) => a.signer === g).map((a) => 'Art.' + a.j + (a.reachable ? ' reach' : ' NO REACH'));
    const lines = ['District ' + g + ' · ' + (bn && bn.type === 'E' ? 'Podium' : 'Ground') + ' · water ' + water, 'Doctrine ' + doc + ' · seal ' + seal,
      'Targeting declared ' + u.targeting + ' / effective ' + c.effMode(u), 'Weight ' + (bn ? bn.ns + ' & ' + bn.we : '—') + (called.length ? ' · Called: ' + called.join(', ') : ''),
      'Modifiers: ' + (mods.join(', ') || 'none'), 'If sold now: ' + (sp.lockTicks ? 'Sub Judice 12s' : 'no lock') + (sp.escheat ? ' · Bail Escheat −' + sp.escheat.toFixed(0) : '') + ' · Scales N ' + pct(sp.shareN) + ' / W ' + pct(sp.shareW)];
    const key = lines.join('|'); if (strip._k === key) return; strip._k = key;
    UI.clear(strip); for (const t of lines) strip.appendChild(el('div', { text: t }));
    const gag = c.activeLaw('gag'); const modes = pan.querySelector('.modes'); if (modes) modes.classList.toggle('gagged', !!gag);
  }

  // ------------------------------------------------------------ the Court Verdict screen
  function results(ctx, r, p) {
    const root = ctx.root, rp = r.debug && JJK.CourtReplay && JJK.CourtReplay.last();
    const cs = r.court || (rp && rp.summary && rp.summary.court) || {}, v = cs.verdict || {};
    if (rp && rp.summary) { r = Object.assign({}, r, { duration: rp.summary.duration, wave: rp.summary.wave }); }
    const col = el('div', { class: 'col scroll courtres', style: 'height:100%;padding:0 80px;gap:10px;overflow:auto' }); root.appendChild(col);
    if (rp && rp.summary) col.appendChild(el('div', { class: 'pill gold', style: 'align-self:center;margin-top:12px', text: 'REPLAY of the bot\'s winning run · ' + (rp.verified ? 'verified identical to the proof run (' + rp.hash + ')' : 'did not match the proof run') + ' · nothing was recorded' }));
    else if (r.debug) col.appendChild(el('div', { class: 'pill', text: 'SANDBOX / DEBUG RUN: nothing was recorded' }));
    col.append(el('div', { class: 'res-title ' + (r.victory ? 'win' : 'lose'), text: r.victory ? 'THE CROWN IS SHATTERED' : (v.title || 'THE COURT RULES AGAINST YOU').toUpperCase() }),
      el('div', { class: 'cforensic', text: v.text || '' }));
    const stat = (k, val) => el('div', { class: 'panel', style: 'padding:8px 14px;text-align:center;min-width:110px' }, [el('div', { class: 'dim', style: 'font-size:11px;letter-spacing:2px', text: k }), el('div', { style: 'font-size:20px', text: String(val) })]);
    col.appendChild(el('div', { class: 'row', style: 'justify-content:center;gap:10px;flex-wrap:wrap' }, [stat('REACHED', cs.phase ? 'Phase ' + ROMAN[cs.phase] + (cs.measure ? ' · ' + cs.measure : '') : 'Docket ' + r.wave), stat('MISTRIALS', cs.mistrials || 0), stat('ARTICLES', (cs.articles || 0) + '/8'), stat('NET STRIKES', cs.strikes == null ? '—' : cs.strikes), stat('TIME', Math.floor(r.duration / 60) + ':' + String(r.duration % 60).padStart(2, '0'))]));
    const tb = el('table', { class: 'ctable' }); tb.appendChild(el('tr', null, ['Phase', 'Signer', 'Doctrine', 'Cosigners', 'Readings'].map((h) => el('th', { text: h }))));
    for (const row of cs.record || []) tb.appendChild(el('tr', null, [typeof row.phase === 'number' ? ROMAN[row.phase] : 'Measure ' + row.phase, row.signer, row.doctrine, (row.cosigners || []).join(', '), String(row.readings)].map((t) => el('td', { text: String(t) }))));
    col.append(el('h3', { text: 'The Standing Record · Citations ' + Object.entries(cs.citations || {}).map(([g, n]) => g + ' ' + n).join(' · ') + (cs.estopped === null ? ' · Unanimous Bench' : cs.estopped ? ' · Estopped ' + cs.estopped : '') }), tb);
    const R = r.rewards || {};
    col.appendChild(el('div', { class: 'row', style: 'justify-content:center;gap:10px' }, [R.coins ? el('span', { class: 'pill', text: '+' + UI.fmt(R.coins) + ' coins' }) : null, R.playerXp ? el('span', { class: 'pill', text: '+' + R.playerXp + ' XP' }) : null].filter(Boolean)));
    const acts = el('div', { class: 'row', style: 'justify-content:center;gap:12px;margin:8px 0 18px' });
    acts.append(UI.btn('MAIN MENU', () => UI.show('menu'), ''), UI.btn('COURT BRIEFING', () => UI.show('courtBriefing', {}), ''));
    if (rp && rp.summary) acts.append(UI.btn('▶ WATCH AGAIN', () => JJK.CourtReplay.start(), ''), UI.btn('ENTER THE COURT YOURSELF', () => enter(p), 'primary'));
    else acts.append(UI.btn('ENTER THE COURT AGAIN', () => enter(p), 'primary'));
    col.appendChild(acts);
  }

  JJK.CourtUI = { menuButton, mapCard, infoPanel, briefing, attachBattle, results, advisory };
})(typeof window !== 'undefined' ? window : globalThis);
