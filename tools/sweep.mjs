// Captures the whole flight at many scroll positions in one browser session,
// and stitches a contact sheet so the transitions can be judged as a sequence
// rather than as isolated frames.
//
//   node tools/sweep.mjs [url] [--live]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'http://127.0.0.1:4199/tools/flight-test.html';

const POINTS = [
  0.00, 0.03, 0.06, 0.10, 0.13, 0.17, 0.22, 0.28, 0.33,
  0.36, 0.40, 0.44, 0.48, 0.53, 0.58, 0.61, 0.64, 0.67,
  0.70, 0.72, 0.74, 0.77, 0.81, 0.86, 0.92, 0.98,
];

mkdirSync('shots/sweep', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|GL Driver|WebGL/i.test(m.text())) errs.push(m.text());
});

for (const p of POINTS) {
  await page.goto(`${URL}?p=${p}`, { waitUntil: 'domcontentloaded' });
  // Long enough for the shader to settle and the adaptive tier to stop moving.
  await page.waitForTimeout(2600);
  const name = `p${String(Math.round(p * 100)).padStart(3, '0')}`;
  await page.screenshot({ path: `shots/sweep/${name}.png` });
  process.stdout.write(`${name} `);
}

console.log(`\n${POINTS.length} frames -> shots/sweep/`);
if (errs.length) {
  console.log('errors:');
  [...new Set(errs)].forEach((e) => console.log('  ' + e));
} else {
  console.log('no console errors');
}
await browser.close();
