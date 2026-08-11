import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.setDefaultTimeout(9000);
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|WebGL|GL Driver/i.test(m.text())) errs.push(m.text()); });
const check = (n,c,d='') => console.log(`${c?'PASS':'FAIL'} ${n}${d?'  '+d:''}`);
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
const open = async (id) => { await p.locator(`[data-play="${id}"]`).scrollIntoViewIfNeeded(); await p.locator(`[data-play="${id}"]`).click({force:true}); await p.waitForTimeout(700); };
const close = async () => { await p.locator('#stage [data-close]').click({force:true}); await p.waitForTimeout(220); };
const txt = async s => (await p.locator(s).first().textContent().catch(()=>''))||'';

// duel: space arms, wait for NOW, press a
await open('duel');
await p.locator('#stage [role=application]').focus();
await p.keyboard.press('Space');
await p.waitForTimeout(200);
await p.keyboard.press('a');   // early press -> right wins the round
await p.waitForTimeout(250);
const sc = await p.locator('#stage [data-p="1"] [data-s]').textContent();
check('duel penalises early press', sc === '1', `right=${sc}`);
await close();

// pong: serve and confirm the ball moves and mode toggles
await open('pong');
await p.locator('#stage [data-serve]').click();
await p.waitForTimeout(900);
await p.locator('#stage [data-mode]').click();
check('pong mode toggles', (await txt('#stage [data-mode]')).includes('player two'), await txt('#stage [data-mode]'));
await close();

// typerace: type the line, ghost gets recorded, second run races it
await open('typerace');
let line = (await txt('#stage [data-text]')).replace(/\u00a0/g, ' ').trim();
await p.locator('#stage [data-in]').focus();
for (const ch of line) { await p.keyboard.type(ch); }
await p.waitForTimeout(400);
check('typerace records a ghost', (await txt('#stage [data-msg]')).includes('ghost recorded'), (await txt('#stage [data-msg]')).replace(/\s+/g,' ').slice(0,60));
const stored = await p.evaluate(() => localStorage.getItem('ghost:typerace'));
check('ghost persisted', Boolean(stored) && JSON.parse(stored).stamps.length > 10, stored ? JSON.parse(stored).stamps.length + ' stamps' : 'none');
await close();
await open('typerace');
check('ghost loads on next run', (await txt('#stage [data-glabel]')).includes('wpm run'), await txt('#stage [data-glabel]'));
await close();

// aim: click 22 targets
await open('aim');
const cbox = await p.locator('#stage canvas').boundingBox();
await p.mouse.click(cbox.x + cbox.width/2, cbox.y + cbox.height/2);
for (let i=0;i<40;i++) {
  const t = await p.locator('#stage canvas').evaluate(() => null).catch(()=>null);
  // click a spiral of points to try to hit the target
  const ang = i * 2.4, r = 30 + (i%7)*40;
  await p.mouse.click(cbox.x + cbox.width/2 + Math.cos(ang)*r, cbox.y + cbox.height/2 + Math.sin(ang)*r);
  await p.waitForTimeout(30);
}
check('aim registers hits', (await txt('#stage p.mono')).length > 20);
await close();

// shooter: fire and confirm no crash over 3s
await open('shooter');
await p.locator('#stage [role=application]').focus();
for (let i=0;i<25;i++){ await p.keyboard.press('Space'); await p.keyboard.press('ArrowRight'); }
await p.waitForTimeout(2500);
check('shooter survives play', errs.length === 0, errs.slice(0,2).join(' | '));
await close();

// 404
await p.goto('http://127.0.0.1:4199/404.html', { waitUntil: 'load' });
await p.waitForTimeout(600);
check('404 renders', (await p.locator('.lost h1').textContent()).includes('trajectory'));
await p.screenshot({ path: 'shots/v/404.png' });

console.log(errs.length ? '\nERRORS:\n'+[...new Set(errs)].slice(0,6).join('\n') : '\nno console errors');
await b.close();
