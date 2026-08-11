// FACTORY: balance a robotic assembly line.
//
// Line balancing is the oldest result in industrial engineering and the least
// intuitive: throughput is set entirely by the slowest station, so every robot
// you add anywhere else buys you nothing at all. Spend on the bottleneck, the
// bottleneck moves, and the answer changes. It is also exactly the shape of the
// robotics bet: the value is in removing the constraint, not in owning machines.

const STATIONS = [
  { name: 'Frame weld', task: 96, dexterity: 0.2 },
  { name: 'Harness route', task: 138, dexterity: 0.9 },
  { name: 'Torque fasten', task: 74, dexterity: 0.4 },
  { name: 'Panel align', task: 112, dexterity: 0.7 },
  { name: 'Inspect', task: 58, dexterity: 0.8 },
  { name: 'Pack', task: 84, dexterity: 0.3 },
];

const FLEET = 10;
const SHIFT = 8 * 3600;

export function create({ host, audio, announce, submit }) {
  const bots = STATIONS.map(() => 1);
  let cursor = 0;
  let done = false;

  // Dexterous tasks parallelise badly: two robots on a fiddly harness are not
  // twice as fast, which is Moravec's paradox showing up as a spreadsheet.
  const stationTime = (i) => {
    const n = Math.max(1, bots[i]);
    const eff = 1 + (n - 1) * (1 - STATIONS[i].dexterity * 0.72);
    return STATIONS[i].task / eff;
  };
  const used = () => bots.reduce((a, b) => a + b, 0);
  const cycle = () => Math.max(...STATIONS.map((_, i) => stationTime(i)));
  const throughput = () => SHIFT / cycle();
  const bottleneck = () => STATIONS.map((_, i) => stationTime(i))
    .reduce((best, t, i, arr) => (t > arr[best] ? i : best), 0);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="mono" style="font-size:12.5px;color:var(--dim);margin:0 0 18px">
      <b class="accent">${FLEET} robots</b>, six stations, one 8-hour shift. Throughput is set by the
      slowest station and nothing else, so a robot anywhere but the bottleneck buys you zero units.
      Dexterous tasks parallelise badly. <span class="accent">Arrows to assign, enter to run the shift.</span>
    </p>
    <div class="table-scroll" style="margin-bottom:18px">
      <table class="data"><thead><tr>
        <th>Station</th><th>Task time</th><th>Dexterity</th><th>Robots</th><th>Station time</th><th></th>
      </tr></thead><tbody data-rows></tbody></table>
    </div>
    <div class="row" style="align-items:flex-end;gap:26px;flex-wrap:wrap">
      <span class="metric" data-bots>6<small>of ${FLEET} assigned</small></span>
      <span class="metric" data-cyc>0<small>s cycle time</small></span>
      <span class="metric" data-out>0<small>units per shift</small></span>
      <button class="btn" data-run>run shift</button>
    </div>
    <p class="mono" data-msg style="font-size:12.5px;min-height:3.4em;margin:16px 0 0"></p>`;
  host.appendChild(wrap);

  const tbody = wrap.querySelector('[data-rows]');
  const msg = wrap.querySelector('[data-msg]');
  STATIONS.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = String(i);
    tr.innerHTML = `<td class="num" data-n>${s.name}</td><td>${s.task}s</td>
      <td>${s.dexterity.toFixed(1)}${s.dexterity > 0.7 ? ' <span class="hi">high</span>' : ''}</td>
      <td class="num hi" data-b></td><td class="num" data-t></td><td data-f></td>`;
    tbody.appendChild(tr);
  });

  function render() {
    const bn = bottleneck();
    STATIONS.forEach((s, i) => {
      const tr = tbody.children[i];
      tr.querySelector('[data-b]').textContent = bots[i];
      tr.querySelector('[data-t]').textContent = `${stationTime(i).toFixed(0)}s`;
      tr.querySelector('[data-f]').innerHTML = i === bn ? '<span class="hi">bottleneck</span>' : '';
      tr.style.background = i === cursor && !done ? 'rgba(239,68,68,0.09)' : '';
      tr.querySelector('[data-n]').style.color = i === cursor && !done ? '#ef4444' : '';
    });
    const over = used() > FLEET;
    wrap.querySelector('[data-bots]').firstChild.textContent = used();
    wrap.querySelector('[data-bots]').style.color = over ? '#ff4d4d' : 'var(--accent)';
    wrap.querySelector('[data-cyc]').firstChild.textContent = cycle().toFixed(0);
    wrap.querySelector('[data-out]').firstChild.textContent = Math.floor(throughput());
    announce(`${Math.floor(throughput())} units per shift`);
  }

  function run() {
    if (used() > FLEET) {
      msg.innerHTML = `<span style="color:#ff4d4d">You have assigned ${used()} robots and own ${FLEET}.</span>`;
      audio.bad();
      return;
    }
    done = true;
    // Brute-force the optimum over every allocation of the fleet.
    let best = 0, bestAlloc = null;
    const n = STATIONS.length;
    const walk = (idx, left, acc) => {
      if (idx === n) {
        const c = Math.max(...acc.map((b, i) => {
          const eff = 1 + (Math.max(1, b) - 1) * (1 - STATIONS[i].dexterity * 0.72);
          return STATIONS[i].task / eff;
        }));
        const out = SHIFT / c;
        if (out > best) { best = out; bestAlloc = [...acc]; }
        return;
      }
      for (let b = 1; b <= left - (n - idx - 1); b += 1) walk(idx + 1, left - b, [...acc, b]);
    };
    walk(0, FLEET, []);

    const mine = Math.floor(throughput());
    submit(mine);
    const pct = (mine / Math.floor(best)) * 100;
    msg.innerHTML = `<b class="accent">${mine} units</b> against an optimum of
      <b class="accent">${Math.floor(best)}</b>, so ${pct.toFixed(0)}% of the line's capacity.
      The best allocation was ${bestAlloc.join(' / ')}. Harness routing is the constraint and it is
      the one station where extra robots help least, which is the whole problem with automating
      dexterity: the task that most needs the help is the one that accepts it worst.`;
    (pct > 92 ? audio.good : audio.bad)();
    render();
  }

  const onKey = (e) => {
    if (done) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + STATIONS.length) % STATIONS.length; render(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % STATIONS.length; render(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); bots[cursor] += 1; audio.tick(); render(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); bots[cursor] = Math.max(1, bots[cursor] - 1); audio.tick(); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(); }
  };
  host.addEventListener('keydown', onKey);
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr && !done) { cursor = Number(tr.dataset.i); render(); }
  });
  wrap.querySelector('[data-run]').addEventListener('click', run);

  msg.textContent = 'One robot per station. Find the bottleneck before you spend anything.';
  render();
  return { destroy() { host.removeEventListener('keydown', onKey); wrap.remove(); } };
}
