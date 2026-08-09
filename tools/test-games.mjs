// Launches every arcade game in a real browser, plays a few keystrokes, and
// fails on any console error or page exception. Five games written without a
// browser open is five games that do not work.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:4199/';
const GAMES = ['quant', 'tokenize', 'pagefault', 'bandit', 'scraper'];
const KEYS = {
  quant: ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Enter'],
  tokenize: ['ArrowRight', ' ', 'ArrowRight', 'ArrowRight', ' ', 'Enter'],
  pagefault: ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'x'],
  bandit: ['ArrowDown', 'ArrowRight', 'ArrowRight', 'Enter', 'Enter', 'Enter'],
  scraper: ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'b'],
};

mkdirSync('shots/games', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon|WebGL|GL Driver/i.test(t)) return;
  problems.push(`console: ${t}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

let failures = 0;
for (const id of GAMES) {
  const before = problems.length;
  await page.locator(`[data-play="${id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`[data-play="${id}"]`).click();
  await page.waitForTimeout(900);

  const mounted = await page.locator('#stage [data-host]').count();
  if (!mounted) { problems.push(`${id}: stage never mounted`); }

  const host = page.locator('#stage [data-host]');
  await host.focus().catch(() => {});
  for (const k of KEYS[id]) {
    await page.keyboard.press(k === ' ' ? 'Space' : k);
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(700);

  // A game that rendered nothing is a failed game even without an exception.
  const box = await page.locator('#stage').boundingBox();
  if (!box || box.height < 120) problems.push(`${id}: stage rendered only ${box ? box.height.toFixed(0) : 0}px tall`);

  await page.locator('#stage').screenshot({ path: `shots/games/${id}.png` }).catch(() => {});
  const newProblems = problems.slice(before);
  if (newProblems.length) {
    failures += 1;
    console.log(`FAIL ${id}`);
    newProblems.forEach((p) => console.log(`     ${p}`));
  } else {
    console.log(`ok   ${id.padEnd(12)} stage ${box.height.toFixed(0)}px`);
  }

  await page.locator('#stage [data-close]').click().catch(() => {});
  await page.waitForTimeout(250);
}

// Terminal and Konami, same trip.
await page.keyboard.press('Backquote');
await page.waitForTimeout(400);
const termOpen = await page.locator('#term:not([hidden])').count();
if (!termOpen) { problems.push('terminal did not open on backtick'); failures += 1; console.log('FAIL terminal'); }
else {
  for (const cmd of ['help', 'whoami', 'stats', 'bench', 'rhythm', 'ls', 'cat soop', 'neofetch']) {
    await page.locator('#term input').fill(cmd);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
  }
  await page.locator('#term').screenshot({ path: 'shots/games/terminal.png' });
  console.log('ok   terminal     ran 8 commands');
  await page.keyboard.press('Escape');
}

for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
  await page.keyboard.press(k);
}
await page.waitForTimeout(700);
const neon = await page.locator('html.neon').count();
console.log(neon ? 'ok   konami       palette flipped' : 'FAIL konami did not fire');
if (!neon) failures += 1;
await page.screenshot({ path: 'shots/games/konami.png' });

await browser.close();
console.log(`\n${GAMES.length + 2 - failures}/${GAMES.length + 2} checks passed`);
process.exit(failures ? 1 : 0);
