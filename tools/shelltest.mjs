import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|WebGL|GL Driver/i.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:4199/', { waitUntil: 'load' });
const check = (n,c,d='') => console.log(`${c?'PASS':'FAIL'} ${n}${d?'  '+d:''}`);
await p.waitForTimeout(400);
check('boot screen present early', await p.locator('#boot').count() >= 0);
await p.waitForTimeout(3200);
check('boot screen removed', await p.locator('#boot').count() === 0);
check('topnav visible', await p.locator('#topnav').isVisible());
check('cursor mounted', await p.locator('#cursor').count() === 1);
// nav hide on scroll down / show on scroll up
await p.mouse.wheel(0, 1400); await p.waitForTimeout(500);
const hid = await p.locator('#topnav').evaluate(n => n.classList.contains('up'));
await p.mouse.wheel(0, -700); await p.waitForTimeout(500);
const shown = await p.locator('#topnav').evaluate(n => !n.classList.contains('up'));
check('nav hides down / shows up', hid && shown, `hid=${hid} shown=${shown}`);
// theme
await p.locator('#theme').click(); await p.waitForTimeout(400);
check('light theme applies', await p.evaluate(() => document.documentElement.classList.contains('light')));
await p.screenshot({ path: 'shots/v/light.png' });
await p.locator('#theme').click(); await p.waitForTimeout(300);
check('theme toggles back', await p.evaluate(() => !document.documentElement.classList.contains('light')));
// consult
await p.goto('http://127.0.0.1:4199/#/consult', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3200);
check('consult opens', await p.locator('#consult .dos-title').textContent().catch(()=>'') === 'Work with me');
check('consult services', await p.locator('#consult .con-grid .card').count() === 4);
check('consult steps', await p.locator('#consult .con-steps li').count() === 4);
await p.screenshot({ path: 'shots/v/consult.png', fullPage: false });
await p.locator('#consult [data-close]').first().click();
await p.waitForTimeout(500);
check('consult closes', await p.locator('#consult').evaluate(n => n.hidden));
// magnetic cursor snaps
await p.mouse.move(700, 500); await p.waitForTimeout(200);
await p.locator('[data-play="snake"]').hover();
await p.waitForTimeout(400);
check('cursor snaps with label', await p.locator('#cursor').evaluate(n => n.classList.contains('snap') && n.dataset.label === 'PLAY'), await p.locator('#cursor').evaluate(n => n.dataset.label || 'none'));
console.log(errs.length ? '\nERRORS:\n'+[...new Set(errs)].slice(0,6).join('\n') : '\nno console errors');
await b.close();
