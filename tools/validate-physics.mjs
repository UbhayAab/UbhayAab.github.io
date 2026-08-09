// Checks the ascent simulation against published Falcon 9 flight milestones.
// If this fails, every number the telemetry HUD shows is fiction, so it runs
// before anything is allowed to render.
//
//   node tools/validate-physics.mjs

import { integrateAscent, runValidation, orbitalVelocity, hohmann, SS, ASCENT } from '../js/flight/physics.js';

// --sweep searches the pitch kick angle against the real MECO state instead of
// letting somebody pick a number that looks about right. maxQ is constrained
// too, because a trajectory can hit the right MECO altitude by flying a
// profile that would tear a real vehicle apart.
if (process.argv.includes('--sweep')) {
  console.log('  angle   stage alt   stage vel     maxQ     apogee    error');
  let best = null;
  for (let a = 0.10; a <= 0.36; a += 0.01) {
    ASCENT.pitchKickAngle = a;
    const t = integrateAscent(0.05, 700);
    const e = t.events.meco;
    if (!e) continue;
    const altKm = e.h / 1000;
    const q = t.events.maxQ.q / 1000;
    const err = Math.abs(altKm - 68) / 68 + Math.abs(e.v - 1550) / 1550;
    const sane = q > 20 && q < 45;
    console.log(
      `  ${a.toFixed(2)}  ${altKm.toFixed(1).padStart(8)} km ${e.v.toFixed(0).padStart(8)} m/s`
      + ` ${q.toFixed(1).padStart(7)} kPa ${(t.apogee / 1000).toFixed(0).padStart(7)} km`
      + ` ${err.toFixed(3).padStart(8)}${sane ? '' : '   maxQ out of family'}`
    );
    if (sane && (!best || err < best.err)) best = { angle: a, err, altKm, v: e.v, q };
  }
  console.log(`\nbest: ${JSON.stringify(best)}`);
  process.exit(0);
}

const t0 = Date.now();
const traj = integrateAscent(0.05, 600);
const ms = Date.now() - t0;

console.log(`integrated in ${ms} ms, ${traj.samples.length} samples, duration ${traj.duration.toFixed(1)} s\n`);

const checks = runValidation(traj);
let fails = 0;
for (const c of checks) {
  const g = c.got == null ? 'null' : c.got.toFixed(c.unit === '' ? 2 : 0);
  console.log(
    `${c.pass ? 'ok  ' : 'FAIL'} ${c.name.padEnd(26)} got ${String(g).padStart(8)} ${c.unit.padEnd(4)}`
    + ` want ${c.want} +/- ${c.tol}`
  );
  if (!c.pass) fails += 1;
}

console.log('\n--- events ---');
for (const [k, v] of Object.entries(traj.events)) {
  if (k === 'maxQ') console.log(`  maxQ     T+${v.t.toFixed(0)}s  ${(v.h / 1000).toFixed(1)} km  ${(v.q / 1000).toFixed(1)} kPa`);
  else console.log(`  ${k.padEnd(8)} T+${v.t.toFixed(0)}s  ${(v.h / 1000).toFixed(1)} km  ${v.v.toFixed(0)} m/s`);
}

console.log('\n--- profile ---');
for (const t of [0, 20, 40, 60, 90, 120, 152, 180, 240, 300, 400, 500]) {
  const s = traj.samples.find((x) => x.t >= t);
  if (!s) continue;
  console.log(
    `  T+${String(t).padStart(3)}s  alt ${(s.h / 1000).toFixed(1).padStart(6)} km`
    + `  vel ${s.v.toFixed(0).padStart(5)} m/s  mass ${(s.m / 1000).toFixed(0).padStart(4)} t`
    + `  q ${(s.q / 1000).toFixed(1).padStart(5)} kPa  stage ${s.stage}`
  );
}

console.log('\n--- derived ---');
console.log(`  liftoff mass      ${(SS.liftoffMass / 1000).toFixed(1)} t`);
console.log(`  liftoff TWR       ${(SS.stage1.thrustSL / (SS.liftoffMass * 9.80665)).toFixed(2)}`);
console.log(`  apogee            ${(traj.apogee / 1000).toFixed(1)} km`);
console.log(`  final velocity    ${traj.finalVelocity.toFixed(0)} m/s`);
console.log(`  orbital v @200km  ${orbitalVelocity(200e3).toFixed(0)} m/s`);
const h = hohmann(200e3, 35786e3);
console.log(`  LEO to GEO        ${h.total.toFixed(0)} m/s over ${(h.time / 3600).toFixed(2)} h`);

console.log(`\n${checks.length - fails}/${checks.length} checks passed`);
process.exit(fails ? 1 : 0);

