/* WATCH A WINNING RUN: replays the policy bot's winning command log (js/ui/court-replay-log.js) inside a real court battle,
   on screen, tick for tick. It uses only the six player commands at the exact ticks the bot issued them, with the four level-1
   starters, so the run is identical to the headless proof (the trace hash is checked at the end). Your own input is locked during
   the replay, and nothing is recorded: no attempt, no win, no rewards. */
(function (G) {
  'use strict';
  const JJK = (G.JJK = G.JJK || {});
  const { UI } = JJK;
  if (!UI) return;
  const NAME = { yuji: 'Yuji', panda: 'Panda', nobara: 'Nobara', megumi: 'Megumi' };
  const SPOT = (c, r) => { const bn = JJK.CourtData.benchAt(c, r); if (!bn) return '(' + c + ',' + r + ')'; const where = { NW: 'top-left', SW: 'bottom-left', NE: 'top-right', SE: 'bottom-right', C: 'middle', E: 'exit' }[bn.district]; return where + (bn.type === 'E' ? ' ▲' : '') + ' (' + c + ',' + r + ')'; };
  const CMDS = ['place', 'upgrade', 'sell', 'setTargeting', 'activateDomain', 'startWave'];
  let last = null;

  function team() { const L = JJK.CourtReplayLog; return (L && L.team ? L.team : ['yuji', 'panda', 'nobara', 'megumi'].map((id) => ({ id, level: 1, stars: 0 }))).map((t) => Object.assign({}, t)); }
  function start() { UI.show('battle', { mapId: 'court_of_nine', diff: 'court', mode: 'story', from: 'menu', courtReplay: true }); }

  function attach(ctx, battle, root) {
    const L = JJK.CourtReplayLog, STEP = JJK.Balance.STEP, c = battle.court;
    if (!L || !c) return;
    last = { summary: null, verified: null, hash: L.hash };
    battle.debugUsed = true; // a replay is never your run: nothing is recorded
    let i = 0, inside = false;
    const describe = (e, u) => {
      if (e.cmd === 'place') return 'Place ' + NAME[e.id] + ' on the ' + SPOT(e.c, e.r);
      if (e.cmd === 'upgrade') return 'Upgrade ' + (u ? NAME[u.id] + ' (' + SPOT(e.c, e.r) + ') to level ' + u.level : 'tower');
      if (e.cmd === 'sell') return 'Sell the tower on the ' + SPOT(e.c, e.r);
      if (e.cmd === 'setTargeting') return 'Set ' + (u ? NAME[u.id] : 'tower') + ' (' + SPOT(e.c, e.r) + ') to ' + String(e.mode).toUpperCase();
      if (e.cmd === 'activateDomain') return 'Cast a Domain';
      return 'Start the next wave';
    };
    const feed = UI.el('div', { class: 'creplayfeed' }), head = UI.el('div', { class: 'creplayhead' });
    const ff = UI.btn('FAST-FORWARD: OFF', () => { mode = (mode + 1) % 3; ff.textContent = 'FAST-FORWARD: ' + ['OFF', '×4', '×16'][mode]; }, 'small', { 'data-replay': 'ff' });
    head.append(UI.el('b', { text: '▶ REPLAY: the bot\'s winning run' }), UI.el('span', { class: 'dim', text: ' · four level-1 starters · watching only, nothing is recorded' }), ff);
    root.append(head, feed);
    const push = (txt) => { feed.prepend(UI.el('div', { text: 'BOT: ' + txt })); while (feed.children.length > 5) feed.lastChild.remove(); };
    const orig = {};
    for (const n of CMDS) {
      orig[n] = battle[n].bind(battle);
      battle[n] = function () { if (inside) return orig[n].apply(null, arguments); UI.toast('Replay in progress: you are watching the bot.', ''); return n === 'place' || n === 'upgrade' || n === 'sell' ? { ok: false, reason: 'Replay in progress' } : false; };
    }
    const applyDue = () => {
      while (i < L.log.length && L.log[i].t === c.tick) {
        const e = L.log[i++], u = e.c != null && e.cmd !== 'place' ? battle.unitAt(e.c, e.r) : null;
        if (e.cmd === 'place') orig.place(e.id, e.c, e.r); else if (e.cmd === 'upgrade') orig.upgrade(u); else if (e.cmd === 'sell') orig.sell(u);
        else if (e.cmd === 'setTargeting') orig.setTargeting(u, e.mode); else if (e.cmd === 'activateDomain') orig.activateDomain(u); else orig.startWave();
        push(describe(e, e.cmd === 'place' ? null : battle.unitAt(e.c, e.r)));
      }
    };
    const update = battle.update.bind(battle);
    battle.update = function (dt) { inside = true; try { if (dt === STEP) applyDue(); return update(dt); } finally { inside = false; } };
    let mode = 0;
    const extra = [0, 3, 15];
    const loop = () => {
      if (!head.isConnected || battle.over) return;
      requestAnimationFrame(loop);
      const st = ctx.battleState && ctx.battleState.st;
      if (!st || st.paused) return;
      for (let k = 0; k < extra[mode] && !battle.over; k++) battle.update(STEP);
    };
    requestAnimationFrame(loop);
    battle.events.on('victory', (x) => { last.summary = x.summary; last.verified = c.hash() === L.hash; });
    battle.events.on('defeat', (x) => { last.summary = x.summary; last.verified = false; });
  }
  JJK.CourtReplay = { team, start, attach, last: () => last };
})(typeof window !== 'undefined' ? window : globalThis);
