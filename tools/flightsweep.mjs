// Dense sweep of the real page (not the test harness) in both themes, so the
// flight is judged in the context it actually ships in.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const theme = process.argv[2] || 'dark';
const dir = `shots/flight-${theme}`;
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
const POINTS = [];
for (let i = 0; i <= 40; i++) POINTS.push(i / 40);
for (const f of POINTS) {
  await p.evaluate(y => window.scrollTo(0, y), Math.round(H * f));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${dir}/p${String(Math.round(f*100)).padStart(3,'0')}.png` });
  process.stdout.write('.');
}
console.log(`\n${POINTS.length} frames -> ${dir}`);
console.log(errs.length ? 'ERRORS: '+[...new Set(errs)].join(' | ') : 'no page errors');
await b.close();
