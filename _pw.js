// helper: resolve playwright from the global install, launch system chrome
// CHAR3D=auto|preview|off (optional) runs any browser suite with that 3D-character mode preset in localStorage.
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
exports.launch = async (extra) => {
  const br = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'].concat(extra || []) });
  const mode = process.env.CHAR3D;
  if (mode) {
    const init = (m) => { try { localStorage.setItem('jjk-td.char3d.mode', m); } catch (e) {} };
    const nc = br.newContext.bind(br);
    br.newContext = async (o) => { const c = await nc(o); await c.addInitScript(init, mode); return c; };
    br.newPage = async (o) => { const c = await br.newContext(o); return c.newPage(); };
  }
  return br;
};
