// The flight director. Turns one scroll value into the complete state the
// renderer needs, and reads the telemetry straight out of the integrated
// trajectory so the HUD cannot drift from what is on screen.
//
// The vehicle stays near the origin and the world moves underneath it. Flying
// the rocket to a real 150 km in world units would put it 150,000 units from
// the pad and destroy depth precision; moving the ground instead keeps
// everything inside a few thousand units.
//
// Altitude is compressed for display with a square root, because a linear map
// makes the first fifteen seconds invisible and the last hundred kilometres
// indistinguishable.

import { integrateAscent, sampleAt, orbitalVelocity, EARTH } from './physics.js';
import { clamp, lerp, smoothstep, remap, v3 } from './gfx.js';

export const PHASES = [
  { id: 'pad', label: 'PAD', from: 0.000, to: 0.105 },
  { id: 'ignition', label: 'IGNITION', from: 0.105, to: 0.150 },
  { id: 'ascent', label: 'ASCENT', from: 0.150, to: 0.330 },
  { id: 'staging', label: 'MECO / SEP', from: 0.330, to: 0.430 },
  { id: 'orbit', label: 'ORBIT', from: 0.430, to: 0.565 },
  { id: 'warp', label: 'WARP', from: 0.565, to: 0.720 },
  { id: 'hole', label: 'GARGANTUA', from: 0.720, to: 1.001 },
];

const EARTH_R_WORLD = 3200;
const ALT_SCALE = 1150;   // world units at the top of the compressed altitude

export function createDirector() {
  const traj = integrateAscent(0.05, 600);
  const mecoT = traj.events.meco?.t ?? 152;
  const secoT = traj.events.seco?.t ?? traj.duration;

  /** Scroll to mission elapsed time. */
  function missionTime(p) {
    if (p < 0.150) return 0;
    if (p < 0.330) return remap(p, 0.150, 0.330, 0, mecoT);
    if (p < 0.430) return remap(p, 0.330, 0.430, mecoT, mecoT + 48);
    if (p < 0.565) return remap(p, 0.430, 0.565, mecoT + 48, secoT);
    return secoT;
  }

  const phaseOf = (p) => PHASES.find((ph) => p >= ph.from && p < ph.to) || PHASES[PHASES.length - 1];

  /**
   * @param {number} p scroll progress 0..1
   * @returns the full render state
   */
  function state(p) {
    p = clamp(p, 0, 1);
    const phase = phaseOf(p);
    const t = missionTime(p);
    const tel = sampleAt(traj, Math.max(0.1, t));

    // Compressed altitude in world units.
    const altNorm = clamp(tel.h / 160e3, 0, 1);
    const altWorld = Math.sqrt(altNorm) * ALT_SCALE;

    // --- assembly on the pad ---------------------------------------------
    // Stages stack up as the first section scrolls.
    // The booster is already standing when the page opens: an empty pad is a
    // weak first frame. Scrolling mates the upper stage and the fairing onto it.
    const build = smoothstep(0.0, 0.095, p);
    const stage1Drop = 0; // booster is already on the pad when the page opens
    const interDrop = (1 - smoothstep(0.020, 0.052, p)) * 180;
    const stage2Drop = (1 - smoothstep(0.030, 0.072, p)) * 230;
    const fairingDrop = (1 - smoothstep(0.060, 0.098, p)) * 280;

    // --- staging ----------------------------------------------------------
    const sepP = smoothstep(0.345, 0.430, p);
    const separated = p > 0.345;
    // Booster falls away and flips for the boostback burn.
    const s1Y = -sepP * 260;
    const s1Z = sepP * 40;
    const s1Pitch = sepP * Math.PI * 0.92;

    // Fairing deploys just after staging.
    const fairingSpread = smoothstep(0.400, 0.470, p) * 26;
    const fairingOn = p < 0.470;

    // --- warp and hole ----------------------------------------------------
    const warp = smoothstep(0.575, 0.660, p) * (1 - smoothstep(0.700, 0.735, p));
    const hole = smoothstep(0.715, 0.775, p);

    // Approach: the camera falls toward the hole through the last section,
    // ending in a stable orbit outside the photon sphere.
    const approach = smoothstep(0.720, 1.0, p);
    const holeDist = lerp(52, 17, approach);
    const holeAngle = approach * 2.4;
    const holeCam = [
      Math.sin(holeAngle) * holeDist,
      lerp(1.2, 3.4, smoothstep(0.85, 1.0, p)),
      Math.cos(holeAngle) * holeDist,
    ];

    // --- camera -----------------------------------------------------------
    // Pulls back and rises as the flight progresses, with a slow orbit so the
    // vehicle is never a flat silhouette.
    const camDist = lerp(132, 300, smoothstep(0.10, 0.56, p)) * lerp(1, 0.72, warp);
    const camHeight = lerp(58, 92, smoothstep(0.05, 0.45, p));
    const orbitA = 0.5 + p * 2.1;
    const camPos = [
      Math.sin(orbitA) * camDist,
      camHeight + lerp(0, 40, smoothstep(0.33, 0.44, p)),
      Math.cos(orbitA) * camDist,
    ];
    // Offset the aim point early on so the vehicle sits right of centre and
    // leaves the left column clear for the headline.
    const camTarget = [
      lerp(-26, 0, smoothstep(0.02, 0.20, p)),
      lerp(40, 20, smoothstep(0.0, 0.2, p)),
      0,
    ];

    const thrust = (() => {
      if (p < 0.105) return 0;
      if (p < 0.150) return smoothstep(0.105, 0.145, p);   // ignition ramp
      if (t < mecoT) return 1;
      if (p < 0.360) return clamp(1 - smoothstep(mecoT - 2, mecoT + 2, t), 0, 1);
      if (p < 0.565) return 0.72;                          // second stage
      return 0;
    })();

    return {
      p,
      phase,
      t,
      telemetry: {
        t,
        altitude: tel.h,
        velocity: tel.v,
        mass: tel.m,
        q: tel.q,
        stage: p > 0.345 ? 2 : 1,
        propellant: tel.prop,
        orbitalTarget: orbitalVelocity(tel.h),
        downrange: tel.downrange,
        twr: tel.twr,
      },

      // camera
      camPos,
      camTarget,
      fov: lerp(0.95, 1.15, warp),
      holeCam,

      // background
      skyAlt: clamp(altNorm * 1.35 + (p > 0.43 ? 1 : 0), 0, 1),
      warp,
      hole,

      // lighting
      lightDir: v3.normalize([0.45, 0.72, 0.52]),
      ambient: lerp(0.34, 0.11, smoothstep(0.15, 0.45, p)),

      // world
      showPad: p < 0.30,
      padY: -altWorld,
      showEarth: p > 0.24 && p < 0.70,
      earthPos: [0, -(EARTH_R_WORLD + altWorld * 0.9), 0],
      earthRadius: EARTH_R_WORLD,

      // vehicle
      showVehicle: p < 0.71,
      stage1Visible: p < 0.520,
      // Assembly reads as two groups mating: the booster rises from below,
      // the upper stage and fairing come down to meet it.
      stage1Pos: [0, -stage1Drop + s1Y, s1Z],
      stage1Rot: [s1Pitch, 0, 0],
      stage2Pos: [0, stage2Drop, 0],
      stage2Rot: [0, 0, 0],
      fairingOn,
      fairingSpread,
      thrust,
      thrustStage: p > 0.345 ? 2 : 1,

      // debug
      build,
      _drops: { stage1Drop, interDrop, stage2Drop, fairingDrop },
    };
  }

  return { state, traj, phases: PHASES, mecoT, secoT };
}

/** Formats the telemetry the way a launch webcast does. */
export function formatTelemetry(tel, phase) {
  const mm = String(Math.floor(tel.t / 60)).padStart(2, '0');
  const ss = String(Math.floor(tel.t % 60)).padStart(2, '0');
  return {
    time: `T+ ${mm}:${ss}`,
    altitude: tel.altitude >= 1000
      ? `${(tel.altitude / 1000).toFixed(1)} km`
      : `${Math.round(tel.altitude)} m`,
    velocity: `${Math.round(tel.velocity * 3.6).toLocaleString('en-US')} km/h`,
    velocityMs: `${Math.round(tel.velocity)} m/s`,
    mass: `${(tel.mass / 1000).toFixed(0)} t`,
    q: `${(tel.q / 1000).toFixed(1)} kPa`,
    stage: `STAGE ${tel.stage}`,
    phase: phase.label,
    orbitPct: clamp(tel.velocity / tel.orbitalTarget, 0, 1),
  };
}
