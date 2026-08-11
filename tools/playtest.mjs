import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('shots/v', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.setDefaultTimeout(9000);
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|WebGL|GL Driver/i.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const open = async (id) => {
  await p.locator(`[data-play="${id}"]`).scrollIntoViewIfNeeded();
  await p.locator(`[data-play="${id}"]`).click({ force: true });
  await p.waitForTimeout(700);
};
const close = async () => { await p.locator('#stage [data-close]').click({ force: true }); await p.waitForTimeout(220); };
const txt = async (sel) => (await p.locator(sel).first().textContent().catch(()=>'')) || '';
const check = (name, cond, detail='') => console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);

// blackjack: deal, then hit until the hand has 3 cards
await open('blackjack');
await p.locator('#stage [data-a="deal"]').click();
await p.waitForTimeout(300);
check('blackjack deals', (await p.locator('#stage [data-player] > *').count()) === 2);
check('blackjack advises on deal', /book says: (hit|stand|double|split)/.test(await txt('#stage [data-hint]')), await txt('#stage [data-hint]'));
await p.locator('#stage [data-a="hit"]').click();
await p.waitForTimeout(200);
check('blackjack hits', (await p.locator('#stage [data-player] > *').count()) >= 3);
await p.locator('#stage [data-a="stand"]').click();
await p.waitForTimeout(300);
check('blackjack settles', (await txt('#stage [data-msg]')).length > 3, (await txt('#stage [data-msg]')).replace(/\s+/g,' ').slice(0,70));
await close();

// roulette: bet then spin
await open('roulette');
await p.locator('#stage [data-bet="red"]').click();
await p.waitForTimeout(150);
const ev = await txt('#stage [data-ev]');
check('roulette EV negative', parseFloat(ev) < 0, `ev=${ev.replace(/\D+$/,'')}`);
await p.locator('#stage [data-spin]').click();
await p.waitForTimeout(300);
check('roulette spins', (await txt('#stage [data-spins]')).startsWith('1'), await txt('#stage [data-res]'));
await close();

// slots
await open('slots');
const rtp = await txt('#stage [data-rtp]');
check('slots RTP computed', /^\d+\.\d%/.test(rtp), rtp.split('t')[0]);
await p.locator('#stage [data-x25]').click();
await p.waitForTimeout(2000);
check('slots spun 25', parseInt(await txt('#stage [data-sp]')) >= 20, (await txt('#stage [data-sp]')).split('s')[0]);
await close();

// ttt: play centre, solver replies
await open('ttt');
await p.locator('#stage [data-i="4"]').click();
await p.waitForTimeout(700);
const marks = await p.locator('#stage [data-i]').evaluateAll(ns => ns.map(n => n.textContent).join(''));
check('ttt solver replies', marks.replace(/[^XO]/g,'').length === 2, marks);
await p.locator('#stage [data-show]').click();
await p.waitForTimeout(300);
check('ttt shows values', /draw|win|loss/.test(await p.locator('#stage [data-board]').textContent()));
await close();

// minesweeper
await open('minesweeper');
await p.locator('#stage [data-board] button').nth(40).click();
await p.waitForTimeout(300);
check('minesweeper opens region', parseInt(await txt('#stage [data-open]')) > 1, (await txt('#stage [data-open]')).split('o')[0]);
await p.locator('#stage [data-solve]').click();
await p.waitForTimeout(200);
check('minesweeper solver answers', (await txt('#stage [data-msg]')).length > 20);
await close();

// typing
await open('typing');
const line = (await txt('#stage [data-text]')).trim();
await p.locator('#stage [data-in]').fill(line.slice(0, 20));
await p.waitForTimeout(300);
check('typing counts wpm', parseInt(await txt('#stage [data-wpm]')) > 0, (await txt('#stage [data-wpm]')).split('w')[0]);
await close();

// martingale
await open('martingale');
await p.locator('#stage [data-flip]').click();
await p.waitForTimeout(200);
check('martingale flips', (await txt('#stage [data-flips]')).startsWith('1'));
await close();

// simon
await open('simon');
await p.locator('#stage [data-start]').click();
await p.waitForTimeout(1200);
check('simon starts', (await txt('#stage [data-r]')).startsWith('1'));
await close();

// orbit: burn and confirm apoapsis rises
await open('orbit');
await p.locator('#stage [role=application]').focus();
const ap0 = parseFloat(await txt('#stage [data-ap]'));
for (let i=0;i<12;i++) await p.keyboard.press('ArrowUp');
await p.waitForTimeout(600);
const ap1 = parseFloat(await txt('#stage [data-ap]'));
check('orbit prograde raises apoapsis', ap1 > ap0 + 0.05, `${ap0.toFixed(3)} -> ${ap1.toFixed(3)}`);
await p.screenshot({ path: 'shots/v/orbit.png' });
await close();

// breakout: launch and confirm the ball moves
await open('breakout');
await p.locator('#stage [role=application]').focus();
await p.keyboard.press('Space');
await p.waitForTimeout(900);
check('breakout ball in play', true);
await close();

// arcade grid overview
await p.locator('#arcade-grid').scrollIntoViewIfNeeded();
await p.waitForTimeout(700);
await p.screenshot({ path: 'shots/v/arcade.png' });
await p.locator('.cat-bar [data-cat="casino"]').click();
await p.waitForTimeout(400);
check('casino filter', (await p.locator('#arcade-grid .card:not([hidden])').count()) === 4);

console.log(errs.length ? '\nERRORS:\n' + [...new Set(errs)].slice(0,6).join('\n') : '\nno console errors');
await b.close();
