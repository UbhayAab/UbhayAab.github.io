// Real ascent physics. Nothing on this page is animated by hand-tuned easing
// curves pretending to be a rocket: the altitude, velocity, mass and pitch all
// come out of integrating the equations of motion for a Super Heavy plus
// Starship flight profile.
//
// The trajectory is computed once at load (a few milliseconds) and then
// sampled by scroll position, so the scroll bar is genuinely scrubbing a
// simulation rather than a keyframe track.
//
// Validation targets come from the public flight-test telemetry rather than a
// spec sheet, since SpaceX does not publish Starship dry masses:
//   hot-stage / MECO   T+ ~2:40, ~68 km, ~1550 m/s
//   SECO               T+ ~8:35, ~150-190 km, ~7200 m/s
// runValidation() checks against these and is called by the test harness.

export const EARTH = {
  mu: 3.986004418e14,   // standard gravitational parameter, m^3/s^2
  R: 6.371e6,           // mean radius, m
  rho0: 1.225,          // sea level density, kg/m^3
  H: 8500,              // density scale height, m
  omega: 7.2921159e-5,  // rotation rate, rad/s
};

// Super Heavy + Starship. Published figures, which are less settled than
// Falcon 9's: SpaceX has changed masses between blocks and does not publish
// dry mass. These are the commonly cited values and the validation below is
// against real flight-test telemetry rather than against a spec sheet.
//
// Chosen over Falcon 9 because Starship has no fairing. On a Falcon the
// fairing jettisons and the second stage carries a payload you never see,
// which reads as incoherent: a cargo bay opens and nothing comes out. The
// ship IS the payload, so the vehicle that reaches orbit is a whole object.
export const SS = {
  name: 'Starship',
  stage1: {                // Super Heavy
    label: 'SUPER HEAVY',
    engines: 33,           // Raptor 2
    thrustSL: 74400e3,     // N, total at sea level
    thrustVac: 79000e3,    // N
    ispSL: 327,            // s
    ispVac: 350,           // s
    propellant: 3400000,   // kg
    dry: 200000,           // kg
    // Super Heavy does not burn to depletion. It stages with propellant held
    // back for the boostback and landing burns, which is exactly why it hot
    // stages at only ~1550 m/s where a Falcon 9 is doing 2300. Without this
    // reserve the simulated booster overperforms by nearly a kilometre a
    // second and arrives at staging almost twice as high as the real one.
    reserve: 620000,       // kg
  },
  stage2: {                // Ship
    label: 'SHIP',
    engines: 6,            // 3 Raptor sea level + 3 Raptor Vacuum
    thrustVac: 14265e3,    // N
    ispVac: 372,           // s, blended across the two engine types
    propellant: 1200000,   // kg
    dry: 120000,           // kg
  },
  // A nominal operational LEO load. With zero payload the ship's mass ratio
  // gives it nearly 8.8 km/s of delta-v on its own, which is real but not a
  // flight anybody actually flies.
  payload: 100000,         // kg
  diameter: 9,             // m
  height: 121,             // m
  Cd: 0.32,
  // Hot staging: the ship lights its engines while still attached and pushes
  // off the booster, so there is no coast between cutoff and separation.
  hotStaging: true,
  get area() { return Math.PI * (this.diameter / 2) ** 2; },
  get liftoffMass() {
    return this.stage1.propellant + this.stage1.dry
      + this.stage2.propellant + this.stage2.dry + this.payload;
  },
};

// Kept so anything importing the old name still resolves.
export const F9 = SS;

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
  pitchKickStart: 14,   // s
  pitchKickEnd: 38,     // s
  pitchKickAngle: 0.34, // rad off vertical, found by sweep against real hot-stage state
  mecoTime: 160,        // s, hot-stage command on the flights flown so far
  stagingCoast: 0,      // s; hot staging means no coast before separation
  targetAltitude: 190e3, // m, the ship aims here
  qLimit: 34e3,         // Pa, guidance will loft rather than exceed this
  throttleStart: 46,    // s, begin the max-Q throttle down
  throttleEnd: 88,      // s
  throttleMin: 0.72,    // fraction of full thrust through max Q
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
  const st = stage1 ? SS.stage1 : SS.stage2;

  // Sea level to vacuum interpolation on thrust and Isp, by ambient pressure.
  const pressureRatio = stage1 ? Math.exp(-h / EARTH.H) : 0;
  const thrust = stage1
    ? SS.stage1.thrustVac + (SS.stage1.thrustSL - SS.stage1.thrustVac) * pressureRatio
    : SS.stage2.thrustVac;
  const isp = stage1
    ? SS.stage1.ispVac + (SS.stage1.ispSL - SS.stage1.ispVac) * pressureRatio
    : SS.stage2.ispVac;

  // Dynamic pressure has to be known before guidance runs, because guidance
  // uses it to decide whether to keep turning or climb out.
  const q = 0.5 * rho * speed * speed;

  const floor = stage1 ? (SS.stage1.reserve || 0) : 0;
  const burning = s.prop > floor;
  const thr = stage1 ? throttle(t) : 1;
  const T = burning ? thrust * thr : 0;
  const mdot = burning ? T / (isp * G0) : 0;

  const m = Math.max(1, s.m);
  const dir = pitchAngle(t, s.vx, s.vy, q, h, T / m, stage1);

  // Drag opposes velocity.
  const drag = q * SS.Cd * SS.area;
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
    m: SS.liftoffMass,
    prop: SS.stage1.propellant,
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
      if (t >= ASCENT.mecoTime + ASCENT.stagingCoast) {
        s.m -= SS.stage1.dry + Math.max(0, s.prop);
        s.prop = SS.stage2.propellant;
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
    // SECO is engine cutoff, which happens when the propellant is gone or
    // when the target velocity is reached, whichever comes first. Testing
    // only for orbital velocity meant a ship that fell 40 m/s short never
    // registered the event at all, ran on for another five minutes of
    // simulated time, and re-entered, so the telemetry at the end of the page
    // was reporting a vehicle at 56 km with 47 kPa on it.
    const reachedOrbit = Math.hypot(s.vx, s.vy) >= orbitalVelocity(s.y) * 0.995;
    if (staged && !events.seco && (reachedOrbit || s.prop <= 0)) {
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
      stage1: deltaV(SS.stage1.ispVac, SS.liftoffMass, SS.liftoffMass - SS.stage1.propellant),
      stage2: deltaV(
        SS.stage2.ispVac,
        SS.stage2.propellant + SS.stage2.dry + SS.payload,
        SS.stage2.dry + SS.payload
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
      name: 'hot-stage time',
      got: events.meco?.t, want: 160, tol: 14, unit: 's',
    },
    {
      name: 'hot-stage altitude',
      got: events.meco ? events.meco.h / 1000 : null, want: 68, tol: 24, unit: 'km',
    },
    {
      name: 'hot-stage velocity',
      got: events.meco?.v, want: 1600, tol: 750, unit: 'm/s',
    },
    {
      name: 'max Q altitude',
      got: events.maxQ ? events.maxQ.h / 1000 : null, want: 12, tol: 8, unit: 'km',
    },
    {
      name: 'max Q value',
      got: events.maxQ ? events.maxQ.q / 1000 : null, want: 32, tol: 18, unit: 'kPa',
    },
    {
      name: 'liftoff TWR',
      got: SS.stage1.thrustSL / (SS.liftoffMass * 9.80665), want: 1.50, tol: 0.18, unit: '',
    },
    {
      name: 'booster delta-v',
      got: traj.budget.stage1, want: 3600, tol: 900, unit: 'm/s',
    },
    {
      name: 'ship delta-v',
      got: traj.budget.stage2, want: 6700, tol: 1500, unit: 'm/s',
    },
    {
      name: 'SECO velocity',
      got: events.seco?.v ?? traj.finalVelocity, want: 7250, tol: 750, unit: 'm/s',
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
