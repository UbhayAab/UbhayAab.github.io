import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const theme = process.argv[2] || 'dark';
const dir = `shots/warp-${theme}`;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.evaluate(t => { localStorage.setItem('theme', t); localStorage.setItem('tier','high'); }, theme);
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(3200);
const H = await p.evaluate(() => document.body.scrollHeight - innerHeight);
for (let f = 0.50; f <= 0.70001; f += 0.01) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H*f));
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${dir}/w${String(Math.round(f*100)).padStart(3,'0')}.png` });
  process.stdout.write('.');
}
console.log('\n' + (errs.length ? 'ERRORS: '+errs.join(' | ') : 'ok'));
await b.close();
