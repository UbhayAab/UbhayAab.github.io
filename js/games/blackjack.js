// Blackjack with basic strategy on tap. Six decks, dealer stands on soft 17,
// blackjack pays 3:2, double on any two, no surrender. Those five rules put
// the house edge near 0.5% against perfect play, which makes it the best bet
// on any casino floor and still a losing one.
//
// The advisor is a real basic-strategy table, so you can see how often your
// instinct disagrees with it. The counter at the bottom keeps that score.
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export function create({ host, rng, audio, announce, submit }) {
  let shoe = [];
  let bank = 200;
  let bet = 10;
  let player = [];
  let dealer = [];
  let state = 'bet';   // bet | play | dealer | done
  let hands = 0;
  let agreed = 0;
  let asked = 0;
  let doubled = false;

  function newShoe() {
    shoe = [];
    for (let d = 0; d < 6; d += 1) {
      for (const r of RANKS) for (const s of SUITS) shoe.push({ r, s });
    }
    for (let i = shoe.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
  }

  const val = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r));

  function score(hand) {
    let t = hand.reduce((a, c) => a + val(c), 0);
    let aces = hand.filter((c) => c.r === 'A').length;
    while (t > 21 && aces) { t -= 10; aces -= 1; }
    return { total: t, soft: aces > 0 && t <= 21 };
  }

  // Standard multi-deck basic strategy, dealer stands soft 17.
  function advise() {
    const { total, soft } = score(player);
    const up = val(dealer[0]) === 11 ? 11 : val(dealer[0]);
    const two = player.length === 2;
    const pair = two && val(player[0]) === val(player[1]);

    if (pair) {
      const p = val(player[0]);
      if (p === 11 || p === 8) return 'split (not offered here, so hit)';
    }
    if (soft) {
      if (total >= 19) return 'stand';
      if (total === 18) return up >= 9 ? 'hit' : (up >= 3 && up <= 6 && two ? 'double' : 'stand');
      if (total === 17) return up >= 3 && up <= 6 && two ? 'double' : 'hit';
      if (total >= 15) return up >= 4 && up <= 6 && two ? 'double' : 'hit';
      return up >= 5 && up <= 6 && two ? 'double' : 'hit';
    }
    if (total >= 17) return 'stand';
    if (total >= 13) return up <= 6 ? 'stand' : 'hit';
    if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
    if (total === 11) return two ? 'double' : 'hit';
    if (total === 10) return up <= 9 && two ? 'double' : 'hit';
    if (total === 9) return up >= 3 && up <= 6 && two ? 'double' : 'hit';
    return 'hit';
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 16px">
      Six decks, dealer stands on soft 17, blackjack pays 3:2. Basic strategy holds the house
      to about 0.5%. The advisor is that strategy, and the tally tracks how often you agree.</p>
    <div class="row" style="gap:26px;flex-wrap:wrap;margin-bottom:18px">
      <span class="metric" data-bank>200<small>bankroll</small></span>
      <span class="metric" data-bet>10<small>bet</small></span>
      <span class="metric" data-hands>0<small>hands</small></span>
      <span class="metric" data-agree>-<small>agreed with book</small></span>
    </div>
    <div style="border:1px solid var(--line);border-radius:12px;padding:20px;background:var(--panel)">
      <p class="mono" style="font-size:11px;letter-spacing:.2em;color:var(--faint);margin:0 0 8px">DEALER</p>
      <div data-dealer style="display:flex;gap:8px;flex-wrap:wrap;min-height:66px"></div>
      <p class="mono" style="font-size:11px;letter-spacing:.2em;color:var(--faint);margin:20px 0 8px">YOU</p>
      <div data-player style="display:flex;gap:8px;flex-wrap:wrap;min-height:66px"></div>
    </div>
    <div class="row" style="gap:10px;margin-top:16px;flex-wrap:wrap">
      <button class="btn" data-a="deal">deal</button>
      <button class="btn" data-a="hit">hit</button>
      <button class="btn" data-a="stand">stand</button>
      <button class="btn" data-a="double">double</button>
      <button class="btn" data-a="bet">bet 25</button>
      <button class="btn" data-a="cash">cash out</button>
    </div>
    <p class="mono" data-hint style="font-size:12.5px;color:var(--accent);margin:14px 0 0;min-height:1.4em"></p>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:8px 0 0"></p>`;
  host.appendChild(wrap);

  const msg = wrap.querySelector('[data-msg]');
  const hint = wrap.querySelector('[data-hint]');
  const set = (sel, v) => { wrap.querySelector(sel).firstChild.textContent = v; };

  function cardEl(c, hidden) {
    const d = document.createElement('div');
    const red = c && (c.s === '♥' || c.s === '♦');
    d.style.cssText = `width:46px;height:64px;border-radius:8px;display:grid;place-items:center;
      font:500 14px var(--mono);border:1px solid var(--line);
      background:${hidden ? 'var(--panel-2)' : '#eaf0ff'};color:${hidden ? 'var(--faint)' : red ? '#c92a3c' : '#06070b'}`;
    d.textContent = hidden ? '?' : `${c.r}${c.s}`;
    return d;
  }

  function paint() {
    const dh = wrap.querySelector('[data-dealer]');
    const ph = wrap.querySelector('[data-player]');
    dh.innerHTML = ''; ph.innerHTML = '';
    dealer.forEach((c, i) => dh.appendChild(cardEl(c, state === 'play' && i === 1)));
    player.forEach((c) => ph.appendChild(cardEl(c, false)));
    set('[data-bank]', bank);
    set('[data-bet]', bet);
    set('[data-hands]', hands);
    set('[data-agree]', asked ? `${Math.round((agreed / asked) * 100)}%` : '-');
    hint.textContent = state === 'play' ? `book says: ${advise()}` : '';
  }

  function checkAgree(action) {
    if (state !== 'play') return;
    asked += 1;
    if (advise().startsWith(action)) agreed += 1;
  }

  function deal() {
    if (state === 'play' || state === 'dealer') return;
    if (bank < bet) { msg.innerHTML = '<b style="color:#ff4d4d">Not enough left to cover the bet.</b>'; submit(0); return; }
    if (shoe.length < 40) newShoe();
    bank -= bet;
    doubled = false;
    player = [shoe.pop(), shoe.pop()];
    dealer = [shoe.pop(), shoe.pop()];
    state = 'play';
    hands += 1;
    msg.textContent = '';
    audio.tick();
    if (score(player).total === 21) { settle(true); return; }
    paint();
  }

  function hit() {
    if (state !== 'play') return;
    checkAgree('hit');
    player.push(shoe.pop());
    audio.tick();
    // A bust still has to settle, or the stake vanishes without a word about it.
    if (score(player).total > 21) { state = 'dealer'; settle(false); return; }
    paint();
  }

  function dbl() {
    if (state !== 'play' || player.length !== 2 || bank < bet) return;
    checkAgree('double');
    bank -= bet;
    doubled = true;
    player.push(shoe.pop());
    stand();
  }

  function stand() {
    if (state !== 'play') return;
    if (!doubled) checkAgree('stand');
    state = 'dealer';
    while (score(dealer).total < 17) dealer.push(shoe.pop());
    settle(false);
  }

  function settle(natural) {
    state = 'done';
    const stake = bet * (doubled ? 2 : 1);
    const p = score(player).total;
    const d = score(dealer).total;
    if (natural) {
      const dn = score(dealer).total === 21;
      if (dn) { bank += stake; msg.innerHTML = 'Both blackjack. Push.'; }
      else { bank += stake + Math.round(stake * 1.5); msg.innerHTML = `<b class="accent">Blackjack.</b> Paid 3:2. A table that pays 6:5 on this instead moves the house edge from 0.5% to 1.9%, which is the single most expensive rule change on a casino floor.`; audio.chime(); }
    } else if (p > 21) { msg.innerHTML = '<span style="color:#ff4d4d">Bust.</span>'; audio.bad(); }
    else if (d > 21) { bank += stake * 2; msg.innerHTML = `Dealer busts at ${d}. You take ${stake}.`; audio.good(); }
    else if (p > d) { bank += stake * 2; msg.innerHTML = `${p} beats ${d}.`; audio.good(); }
    else if (p === d) { bank += stake; msg.innerHTML = `Push at ${p}.`; }
    else { msg.innerHTML = `<span style="color:#ff4d4d">${d} beats ${p}.</span>`; audio.bad(); }
    finish();
  }

  function finish() {
    state = 'done';
    paint();
    wrap.querySelector('[data-dealer]').innerHTML = '';
    dealer.forEach((c) => wrap.querySelector('[data-dealer]').appendChild(cardEl(c, false)));
    announce(`bankroll ${bank}`);
    if (bank <= 0) {
      submit(0);
      msg.innerHTML += ' <b style="color:#ff4d4d">Broke.</b> At 0.5% a hand this takes a while, which is the point of it.';
    }
  }

  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'deal') deal();
    else if (a === 'hit') hit();
    else if (a === 'stand') stand();
    else if (a === 'double') dbl();
    else if (a === 'bet') { bet = bet === 10 ? 25 : bet === 25 ? 50 : 10; b.textContent = `bet ${bet === 10 ? 25 : bet === 25 ? 50 : 10}`; paint(); }
    else if (a === 'cash') {
      submit(bank);
      msg.innerHTML = `<b class="accent">Cashed out at ${bank}</b> over ${hands} hands, agreeing with the book
        ${asked ? Math.round((agreed / asked) * 100) : 0}% of the time. Every point of disagreement is
        expectation you handed back on top of the house's half a percent.`;
      audio.chime();
    }
  });

  newShoe();
  paint();
  msg.textContent = 'Press deal.';
  return { destroy() { wrap.remove(); } };
}
