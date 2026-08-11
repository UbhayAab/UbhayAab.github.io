import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots/live', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|GL Driver|WebGL/i.test(m.text())) errs.push(m.text()); });
await p.goto('https://ubhayaab.github.io/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
console.log('page height', H, '| sections', await p.locator('section[id]').count(), '| career cards', await p.locator('.hcard').count());
for (const [n,f] of [['who',0.06],['career',0.16],['ascent',0.26],['vision',0.62],['hole',0.93]]) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H*f));
  await p.waitForTimeout(2400);
  await p.screenshot({ path: `shots/live/L-${n}.png` });
  process.stdout.write(n + ' ');
}
console.log('\n' + (errs.length ? 'ERRORS: ' + [...new Set(errs)].join(' | ') : 'no console errors'));
await b.close();
