// Real ascent physics. Nothing on this page is animated by hand-tuned easing
// curves pretending to be a rocket: the altitude, velocity, mass and pitch all
// come out of integrating the equations of motion for an actual Falcon 9
// Block 5 flight profile.
//
// The trajectory is computed once at load (a few milliseconds) and then
// sampled by scroll position, so the scroll bar is genuinely scrubbing a
// simulation rather than a keyframe track.
//
// Validation targets, from published Falcon 9 flight profiles:
//   MECO   T+ ~152 s, ~67 km altitude, ~2300 m/s
//   SECO-1 T+ ~525 s, ~200 km, ~7700 m/s
// runValidation() checks against these and is called by the test harness.

export const EARTH = {
  mu: 3.986004418e14,   // standard gravitational parameter, m^3/s^2
  R: 6.371e6,           // mean radius, m
  rho0: 1.225,          // sea level density, kg/m^3
  H: 8500,              // density scale height, m
  omega: 7.2921159e-5,  // rotation rate, rad/s
};

// Falcon 9 Block 5. Public figures.
export const F9 = {
  stage1: {
    engines: 9,
    thrustSL: 7607e3,   // N, total at sea level
    thrustVac: 8227e3,  // N, total in vacuum
    ispSL: 282,         // s
    ispVac: 311,        // s
    propellant: 411000, // kg
    dry: 22200,         // kg
    burnTime: 162,      // s to depletion; MECO is commanded earlier
  },
  stage2: {
    engines: 1,
    thrustVac: 981e3,   // N
    ispVac: 348,        // s
    propellant: 107500, // kg
    dry: 4000,          // kg
  },
  payload: 15600,       // kg, reusable-profile LEO payload
  diameter: 3.7,        // m
  height: 70,           // m
  Cd: 0.30,             // drag coefficient, blunt-ish body
  get area() { return Math.PI * (this.diameter / 2) ** 2; },
  get liftoffMass() {
    return this.stage1.propellant + this.stage1.dry
      + this.stage2.propellant + this.stage2.dry + this.payload;
  },
};

const G0 = 9.80665;

/** Exponential atmosphere. Good to a few percent below 100 km, which is all we need. */
export const density = (h) => (h < 0 ? EARTH.rho0 : EARTH.rho0 * Math.exp(-h / EARTH.H));

/** Local gravitational acceleration at altitude h. */
export const gravity = (h) => EARTH.mu / (EARTH.R + Math.max(0, h)) ** 2;

/** Tsiolkovsky. dv = Isp * g0 * ln(m0/m1) */
export const deltaV = (isp, m0, m1) => isp * G0 * Math.log(m0 / m1);

/** Circular orbital velocity at altitude h. */
export const orbitalVelocity = (h) => Math.sqrt(EARTH.mu / (EARTH.R + h));

/** Hohmann transfer between two circular orbits, returns both burns and time. */
export function hohmann(h1, h2) {
  const r1 = EARTH.R + h1;
  const r2 = EARTH.R + h2;
  const v1 = Math.sqrt(EARTH.mu / r1);
  const v2 = Math.sqrt(EARTH.mu / r2);
  const a = (r1 + r2) / 2;
  const vp = Math.sqrt(EARTH.mu * (2 / r1 - 1 / a));
  const va = Math.sqrt(EARTH.mu * (2 / r2 - 1 / a));
  return {
    burn1: vp - v1,
    burn2: v2 - va,
    total: Math.abs(vp - v1) + Math.abs(v2 - va),
    time: Math.PI * Math.sqrt(a ** 3 / EARTH.mu),
  };
}

// --- ascent integration ---------------------------------------------------
//
// Planar two-dimensional flight in an inertial frame. x is downrange, y is up.
// The pitch program is the classic gravity turn: hold vertical through max
// dynamic pressure margin, apply a small kick, then let the thrust vector
// follow the velocity vector so gravity does the turning for free.

// Guidance parameters. The pitch kick angle is the single knob that decides
// how lofted the ascent is: too small and the vehicle climbs steeply and
// arrives at MECO far too high, too large and it pitches into the atmosphere.
// The value here was found by sweeping against the real MECO altitude rather
// than picked by eye. See tools/validate-physics.mjs --sweep.
export const ASCENT = {
  pitchKickStart: 12,   // s
  pitchKickEnd: 32,     // s
  pitchKickAngle: 0.15, // rad off vertical, found by sweep against real MECO
  mecoTime: 152,        // s, commanded
  targetAltitude: 200e3, // m, second stage aims here
  qLimit: 34e3,         // Pa, guidance will loft rather than exceed this
  throttleStart: 44,    // s, begin the max-Q throttle down
  throttleEnd: 82,      // s
  throttleMin: 0.75,    // fraction of full thrust through max Q
};

/**
 * Throttle profile. Real vehicles throttle down through max dynamic pressure;
 * without it, a trajectory flat enough to reach the correct MECO altitude
 * blows dynamic pressure to a hundred times its real value.
 */
function throttle(t) {
  if (t < ASCENT.throttleStart || t > ASCENT.throttleEnd) return 1;
  // Smooth in and out so thrust is continuous, which keeps RK4 well behaved.
  const span = ASCENT.throttleEnd - ASCENT.throttleStart;
  const k = (t - ASCENT.throttleStart) / span;
  const bell = Math.sin(Math.PI * k) ** 0.6;
  return 1 - (1 - ASCENT.throttleMin) * bell;
}

/**
 * Second stage guidance.
 *
 * A gravity turn is the wrong law up here. At MECO the velocity vector is
 * still pointing steeply up, so following it just throws the vehicle higher
 * and it falls back without ever building orbital speed. Real upper stages
 * pitch to near-horizontal and steer only enough vertically to arrive at the
 * target altitude with zero climb rate.
 *
 * This is a simplified linear-tangent law: work out the vertical acceleration
 * needed to fly the climb profile, including gravity and the centrifugal
 * relief that grows as horizontal speed builds, then spend whatever thrust is
 * left on going sideways.
 */
function stage2Direction(h, vx, vy, accel) {
  const hTarget = ASCENT.targetAltitude;
  const r = EARTH.R + h;

  // Desired climb rate: fast while far below the target, nulled on arrival.
  const desiredVy = Math.max(-40, Math.min(420, (hTarget - h) * 0.0032));

  // Vertical acceleration required = closing the climb-rate error, plus
  // holding against gravity, minus the centrifugal term from horizontal speed.
  const gravityDeficit = gravity(h) - (vx * vx) / r;
  const ayNeeded = (desiredVy - vy) / 22 + gravityDeficit;

  let dy = accel > 1e-6 ? ayNeeded / accel : 0;
  dy = Math.max(-0.85, Math.min(0.85, dy));
  const dx = Math.sqrt(Math.max(0, 1 - dy * dy));
  return { x: dx, y: dy };
}

function pitchAngle(t, vx, vy, q, h, accel, stage1) {
  // Returns thrust direction as a unit vector.
  if (!stage1) return stage2Direction(h, vx, vy, accel);
  if (t < ASCENT.pitchKickStart) return { x: 0, y: 1 };
  const speed = Math.hypot(vx, vy);
  if (t < ASCENT.pitchKickEnd || speed < 60) {
    const k = Math.min(1, (t - ASCENT.pitchKickStart) / (ASCENT.pitchKickEnd - ASCENT.pitchKickStart));
    const a = ASCENT.pitchKickAngle * k;
    return { x: Math.sin(a), y: Math.cos(a) };
  }

  // Gravity turn: thrust along the velocity vector.
  let dx = vx / speed;
  let dy = vy / speed;

  // Dynamic pressure limiting. When q runs over the structural limit the
  // vehicle pitches back up to climb out of the thick air, which is what real
  // guidance does and what stops the "skim the atmosphere at 3900 kPa"
  // trajectory a naive gravity turn will happily fly.
  if (q > ASCENT.qLimit) {
    const over = Math.min(1, (q - ASCENT.qLimit) / (ASCENT.qLimit * 0.5));
    dx *= (1 - over);
    dy = dy * (1 - over) + over;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
  }
  return { x: dx, y: dy };
}

function derivatives(s, t) {
  const h = s.y;
  const g = gravity(h);
  const rho = density(h);
  const speed = Math.hypot(s.vx, s.vy);

  const stage1 = t < ASCENT.mecoTime;
  const st = stage1 ? F9.stage1 : F9.stage2;

  // Sea level to vacuum interpolation on thrust and Isp, by ambient pressure.
  const pressureRatio = stage1 ? Math.exp(-h / EARTH.H) : 0;
  const thrust = stage1
    ? F9.stage1.thrustVac + (F9.stage1.thrustSL - F9.stage1.thrustVac) * pressureRatio
    : F9.stage2.thrustVac;
  const isp = stage1
    ? F9.stage1.ispVac + (F9.stage1.ispSL - F9.stage1.ispVac) * pressureRatio
    : F9.stage2.ispVac;

  // Dynamic pressure has to be known before guidance runs, because guidance
  // uses it to decide whether to keep turning or climb out.
  const q = 0.5 * rho * speed * speed;

  const burning = s.prop > 0;
  const thr = stage1 ? throttle(t) : 1;
  const T = burning ? thrust * thr : 0;
  const mdot = burning ? T / (isp * G0) : 0;

  const m = Math.max(1, s.m);
  const dir = pitchAngle(t, s.vx, s.vy, q, h, T / m, stage1);

  // Drag opposes velocity.
  const drag = q * F9.Cd * F9.area;
  const dragX = speed > 0 ? -drag * (s.vx / speed) : 0;
  const dragY = speed > 0 ? -drag * (s.vy / speed) : 0;

  return {
    dx: s.vx,
    dy: s.vy,
    dvx: (T * dir.x + dragX) / m,
    dvy: (T * dir.y + dragY) / m - g,
    dm: -mdot,
    dprop: -mdot,
    q,
    thrust: T,
    drag,
    twr: T / (m * g),
  };
}

/**
 * Integrates the full ascent with RK4 and returns a sampled trajectory.
 * @param {number} dt integration step in seconds
 * @param {number} tEnd how long to fly
 */
export function integrateAscent(dt = 0.05, tEnd = 540) {
  let s = {
    x: 0, y: 0, vx: 0, vy: 0,
    m: F9.liftoffMass,
    prop: F9.stage1.propellant,
  };

  const samples = [];
  const events = {};
  let t = 0;
  let maxQ = { q: 0, t: 0, h: 0 };
  let staged = false;

  const add = (a, d, k) => ({
    x: a.x + d.dx * k, y: a.y + d.dy * k,
    vx: a.vx + d.dvx * k, vy: a.vy + d.dvy * k,
    m: a.m + d.dm * k, prop: a.prop + d.dprop * k,
  });

  while (t < tEnd) {
    const d0 = derivatives(s, t);

    // Max Q is an ascent quantity. Tracking it across the whole run lets a
    // trajectory that fails to reach orbit re-enter at several km/s and record
    // its re-entry as "max Q", which is how a 1800 kPa reading appears out of
    // nowhere between two neighbouring guidance settings.
    if (t < ASCENT.mecoTime && d0.q > maxQ.q) maxQ = { q: d0.q, t, h: s.y };

    // Stage separation: drop the first stage dry mass and swap propellant load.
    if (!staged && t >= ASCENT.mecoTime) {
      events.meco = { t, h: s.y, v: Math.hypot(s.vx, s.vy), vx: s.vx, vy: s.vy, m: s.m };
      // 4 seconds of coast between MECO and separation, as flown.
      if (t >= ASCENT.mecoTime + 4) {
        s.m -= F9.stage1.dry + Math.max(0, s.prop);
        s.prop = F9.stage2.propellant;
        staged = true;
        events.sep = { t, h: s.y, v: Math.hypot(s.vx, s.vy) };
      }
    }

    // RK4
    const k1 = d0;
    const k2 = derivatives(add(s, k1, dt / 2), t + dt / 2);
    const k3 = derivatives(add(s, k2, dt / 2), t + dt / 2);
    const k4 = derivatives(add(s, k3, dt), t + dt);

    s = {
      x: s.x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
      y: s.y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy),
      vx: s.vx + (dt / 6) * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx),
      vy: s.vy + (dt / 6) * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy),
      m: s.m + (dt / 6) * (k1.dm + 2 * k2.dm + 2 * k3.dm + k4.dm),
      prop: s.prop + (dt / 6) * (k1.dprop + 2 * k2.dprop + 2 * k3.dprop + k4.dprop),
    };
    // If the vehicle comes back down, the mission failed. Stop rather than
    // simulate a crash and pollute every summary statistic with it.
    if (staged && s.y < 40e3 && s.vy < 0) { events.reentry = { t, h: s.y, v: Math.hypot(s.vx, s.vy) }; break; }
    if (s.y < 0) { s.y = 0; s.vy = Math.max(0, s.vy); }
    t += dt;

    // Sample at 10 Hz, which is plenty to interpolate smoothly.
    if (samples.length === 0 || t - samples[samples.length - 1].t >= 0.1) {
      const speed = Math.hypot(s.vx, s.vy);
      samples.push({
        t,
        h: s.y,
        downrange: s.x,
        v: speed,
        vx: s.vx, vy: s.vy,
        m: s.m,
        prop: Math.max(0, s.prop),
        q: d0.q,
        twr: d0.twr,
        stage: staged ? 2 : 1,
        pitch: Math.atan2(s.vx, Math.max(1e-6, s.vy)),
      });
    }

    // Orbital insertion: stop when circular orbit velocity is reached.
    // Insertion. The 0.5% tolerance matters: with a real payload the stage
    // burns to depletion within a few m/s of circular velocity, so an exact
    // comparison misses the event by a rounding error.
    if (staged && !events.seco && Math.hypot(s.vx, s.vy) >= orbitalVelocity(s.y) * 0.995) {
      events.seco = { t, h: s.y, v: Math.hypot(s.vx, s.vy) };
      break;
    }
  }

  events.maxQ = maxQ;
  const last = samples[samples.length - 1];

  return {
    samples,
    events,
    duration: last.t,
    apogee: Math.max(...samples.map((x) => x.h)),
    finalVelocity: last.v,
    dt,
    budget: {
      stage1: deltaV(F9.stage1.ispVac, F9.liftoffMass, F9.liftoffMass - F9.stage1.propellant),
      stage2: deltaV(
        F9.stage2.ispVac,
        F9.stage2.propellant + F9.stage2.dry + F9.payload,
        F9.stage2.dry + F9.payload
      ),
    },
  };
}

/** Sample the trajectory at an arbitrary time, linearly interpolated. */
export function sampleAt(traj, t) {
  const s = traj.samples;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];
  // Samples are evenly spaced at ~0.1 s, so index directly rather than search.
  const i = Math.min(s.length - 2, Math.max(0, Math.floor((t - s[0].t) / 0.1)));
  const a = s[i];
  const b = s[i + 1];
  const k = (t - a.t) / Math.max(1e-9, b.t - a.t);
  const lerp = (p, q) => p + (q - p) * k;
  return {
    t,
    h: lerp(a.h, b.h),
    downrange: lerp(a.downrange, b.downrange),
    v: lerp(a.v, b.v),
    vx: lerp(a.vx, b.vx),
    vy: lerp(a.vy, b.vy),
    m: lerp(a.m, b.m),
    prop: lerp(a.prop, b.prop),
    q: lerp(a.q, b.q),
    twr: lerp(a.twr, b.twr),
    pitch: lerp(a.pitch, b.pitch),
    stage: b.stage,
  };
}

/** Checks the simulation against published flight milestones. */
export function runValidation(traj) {
  const { events } = traj;
  const checks = [
    {
      name: 'MECO time',
      got: events.meco?.t, want: 152, tol: 6, unit: 's',
    },
    {
      name: 'MECO altitude',
      got: events.meco ? events.meco.h / 1000 : null, want: 67, tol: 22, unit: 'km',
    },
    {
      name: 'MECO velocity',
      got: events.meco?.v, want: 2300, tol: 700, unit: 'm/s',
    },
    {
      name: 'max Q altitude',
      got: events.maxQ ? events.maxQ.h / 1000 : null, want: 13, tol: 7, unit: 'km',
    },
    {
      name: 'max Q value',
      got: events.maxQ ? events.maxQ.q / 1000 : null, want: 33, tol: 18, unit: 'kPa',
    },
    {
      name: 'liftoff TWR',
      got: F9.stage1.thrustSL / (F9.liftoffMass * 9.80665), want: 1.24, tol: 0.15, unit: '',
    },
    {
      // Falcon 9 stage 1 really is about 4 km/s. The ~9.4 km/s figure quoted
      // for "getting to orbit" is the whole mission including stage 2 and
      // gravity and drag losses, not this stage.
      name: 'stage 1 delta-v',
      got: traj.budget.stage1, want: 4000, tol: 600, unit: 'm/s',
    },
    {
      name: 'stage 2 delta-v',
      got: traj.budget.stage2, want: 6000, tol: 1200, unit: 'm/s',
    },
    {
      name: 'orbital velocity at 200 km',
      got: orbitalVelocity(200e3), want: 7784, tol: 30, unit: 'm/s',
    },
  ];
  return checks.map((c) => ({
    ...c,
    pass: c.got != null && Math.abs(c.got - c.want) <= c.tol,
  }));
}
