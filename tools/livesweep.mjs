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
for (const f of [0.00, 0.22, 0.40, 0.62, 0.70, 0.95]) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H * f));
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `shots/live/f${String(Math.round(f*100)).padStart(3,'0')}.png` });
  process.stdout.write(`${f} `);
}
console.log('\n' + (errs.length ? 'errors: ' + [...new Set(errs)].join(' | ') : 'no console errors'));
await b.close();
