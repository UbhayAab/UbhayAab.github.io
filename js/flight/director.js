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
  { id: 'warp', label: 'WARP', from: 0.565, to: 0.655 },
  { id: 'hole', label: 'GARGANTUA', from: 0.655, to: 1.001 },
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
  /** Sky colours matching the sky shader, so the vehicle reflects its own background. */
  function skyColours(altNorm, warp) {
    const k = smoothstep(0.0, 0.72, altNorm);
    const low = [
      lerp(0.020, 0.003, k) + warp * 0.05,
      lerp(0.030, 0.005, k) + warp * 0.07,
      lerp(0.062, 0.014, k) + warp * 0.16,
    ];
    // Warm sodium glow near the ground, cold airglow once the limb appears.
    const g = smoothstep(0.10, 0.55, altNorm);
    const high = [
      lerp(0.30, 0.06, g) + warp * 0.10,
      lerp(0.16, 0.16, g) + warp * 0.14,
      lerp(0.06, 0.34, g) + warp * 0.32,
    ];
    return { low, high };
  }

  function state(p) {
    p = clamp(p, 0, 1);
    const phase = phaseOf(p);
    const t = missionTime(p);
    const tel = sampleAt(traj, Math.max(0.1, t));

    // Compressed altitude in world units.
    const altNorm = clamp(tel.h / 160e3, 0, 1);
    const altWorld = Math.sqrt(altNorm) * ALT_SCALE;

    // --- stacking on the pad ---------------------------------------------
    // The booster is already standing when the page opens: an empty pad is a
    // weak first frame. Scrolling lowers the ship onto it.
    //
    // It descends from 34 m above the stack, not from off screen. Starting it
    // hundreds of metres up meant the ship spent the whole first section as a
    // dot and then arrived, which read as slow and disconnected.
    const mate = smoothstep(0.008, 0.088, p);
    const shipDrop = (1 - mate) * 34;

    // --- staging ----------------------------------------------------------
    const sepP = smoothstep(0.345, 0.445, p);
    // Hot staging: the ship lights first and pushes off, so the booster falls
    // away beneath a already-burning ship.
    const boosterY = -sepP * sepP * 520;
    const boosterZ = sepP * 46;
    const boosterFlip = sepP * Math.PI * 0.86;

    // --- warp and hole ----------------------------------------------------
    // One continuous move, not three states.
    //
    // The sky-based warp winds up and hands over to the hole pass, which keeps
    // drawing the same streaks while the hole itself fades up behind them. The
    // streaks then decay as the ship decelerates into orbit. Previously these
    // windows barely overlapped, so the sequence was: blue screen, white
    // screen, black hole, with no motion connecting them.
    const warp = smoothstep(0.570, 0.638, p) * (1 - smoothstep(0.640, 0.700, p));
    const hole = smoothstep(0.648, 0.726, p);
    const flare = smoothstep(0.600, 0.648, p) * (1 - smoothstep(0.652, 0.728, p));

    // Approach: the camera falls toward the hole through the last section,
    // ending in a stable orbit well outside the photon sphere.
    //
    // 26 is the closest it goes. Any nearer and the accretion disk is wider
    // than the frame and gets cut off at the screen edges, which is the
    // "clipped" look: you stop reading a black hole and start reading a
    // brown band across the middle of the page.
    const approach = smoothstep(0.655, 1.0, p);
    const holeDist = lerp(82, 28, Math.pow(approach, 0.45));
    const holeAngle = Math.pow(approach, 0.7) * 1.9;
    const holeCam = [
      Math.sin(holeAngle) * holeDist,
      lerp(1.6, 4.2, smoothstep(0.80, 1.0, p)),
      Math.cos(holeAngle) * holeDist,
    ];

    // --- camera -----------------------------------------------------------
    // Follows the ship up after separation rather than staying pinned to the
    // pad, so the subject stays framed once the booster drops away.
    // Framed for a 121 m stack, which is nearly twice the Falcon 9 it
    // replaced: at the old 150 m standoff the vehicle ran off both edges.
    // Before separation the subject is the whole stack, centred around 60 m.
    // After it, the subject is the ship alone, centred on its own midpoint.
    const focusY = lerp(0, 97 - 60 + 24, smoothstep(0.335, 0.470, p));
    const camDist = lerp(245, 320, smoothstep(0.10, 0.56, p)) * lerp(1, 0.68, warp);
    const camHeight = lerp(54, 130, smoothstep(0.05, 0.45, p));
    const orbitA = 0.5 + p * 2.1;
    const camPos = [
      Math.sin(orbitA) * camDist,
      camHeight + focusY * 0.55,
      Math.cos(orbitA) * camDist,
    ];
    // Offset the aim point early on so the vehicle sits right of centre and
    // leaves the left column clear for the headline.
    const camTarget = [
      lerp(-52, 0, smoothstep(0.02, 0.20, p)),
      lerp(62, 34, smoothstep(0.0, 0.2, p)) + focusY,
      0,
    ];

    const thrust = (() => {
      if (p < 0.105) return 0;
      if (p < 0.150) return smoothstep(0.105, 0.145, p);   // ignition ramp
      if (t < mecoT) return 1;
      if (p < 0.360) return clamp(1 - smoothstep(mecoT - 2, mecoT + 2, t), 0, 1);
      if (p < 0.565) return 0.72;                          // ship
      if (p < 0.660) return 0.85;                          // warp burn
      return 0;
    })();

    // --- attitude ----------------------------------------------------------
    // The vehicle leans into the gravity turn using the pitch angle the
    // integrator actually flew. Standing perpendicular the whole way up is the
    // single clearest tell that a launch animation is faked.
    const pitch = tel.pitch || 0;
    const boosterVisible = p < 0.500;

    // The vehicle's own up-axis once pitched. rotZ(-pitch) applied to (0,1,0).
    //
    // Everything mounted on the stack has to be placed along THIS, not along
    // world up. Placing the ship at a fixed world height while the booster
    // tilted underneath it is what tore the stack in half during the gravity
    // turn: by 40 degrees of pitch the ship was floating clear of the booster
    // with a visible gap between them.
    const axis = [Math.sin(pitch), Math.cos(pitch), 0];
    const along = (base, d) => [base[0] + axis[0] * d, base[1] + axis[1] * d, base[2] + axis[2] * d];

    const SHIP_BASE = 73.6;
    const boosterPos = [0, boosterY, boosterZ];
    // Mated: the ship rides the booster's axis, so the stack stays one object
    // through the gravity turn.
    //
    // Separated: it holds station and the world moves around it, as everything
    // else here does. Continuing to offset it along the pitched axis put it 98
    // units downrange once the pitch went near horizontal, which walked the
    // subject off the bottom of the frame during the entire warp section.
    const shipPos = p > 0.345
      ? [0, SHIP_BASE + sepP * 26, 0]
      : along(boosterPos, SHIP_BASE + shipDrop);

    // Exhaust leaves along the vehicle's axis, not straight down. A tilted
    // rocket with a vertical flame is the most obvious tell there is.
    const exhaustDir = [-axis[0], -axis[1], -axis[2]];

    const sky = skyColours(altNorm, Math.max(warp, flare * 0.6));

    // Earth grows in across a long window instead of switching on between two
    // frames, which is what made it appear out of nowhere.
    const earthIn = smoothstep(0.180, 0.340, p) * (1 - smoothstep(0.545, 0.624, p));

    // Where the burning engines are: used both to emit the plume and to light
    // the hull from below.
    // Also on the axis: the engine plane sits below the base along the body,
    // which is not the same as below it in world space once pitched.
    const enginePos = p > 0.345
      ? along(shipPos, -2.6)
      : along(boosterPos, -2.6);

    // --- the ship at the black hole ---------------------------------------
    // The finale used to be a bare shader: the ship simply vanished and
    // Gargantua appeared. Keeping the ship in frame, silhouetted against the
    // disk and settling into orbit, is the difference between a picture of a
    // black hole and being at one.
    const holeShip = p > 0.652;
    let holeSceneCam = camPos;
    let holeSceneTarget = camTarget;
    let holeShipPos = shipPos;
    let holeShipRot = [0, 0, -pitch];
    if (holeShip) {
      // A fixed rig. The hole behind is drawn by the raymarcher from holeCam;
      // the two layers are composed by draw order rather than sharing a frame.
      holeSceneCam = [0, 26, 300];
      holeSceneTarget = [0, 18, 0];
      const arrive = smoothstep(0.652, 0.960, p);
      // Flies in from the right, decelerates, and settles broadside on as it
      // enters orbit.
      holeShipPos = [
        lerp(470, -104, arrive),
        lerp(150, -18, arrive),
        lerp(-340, 150, arrive),
      ];
      // Nose toward the hole and broadside to the camera, so the silhouette
      // reads as a ship: nosecone, flaps, engine cluster. Rotated further
      // round it becomes an anonymous cylinder seen end on.
      holeShipRot = [0, lerp(0.28, 0.58, arrive), lerp(-1.02, -1.30, arrive)];
    }

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
      camPos: holeShip ? holeSceneCam : camPos,
      camTarget: holeShip ? holeSceneTarget : camTarget,
      fov: lerp(0.95, 1.22, Math.max(warp, flare)),
      holeCam,

      // background
      skyAlt: clamp(altNorm * 1.35 + (p > 0.43 ? 1 : 0), 0, 1),
      warp,
      flare,
      hole,

      // lighting, matched to the sky so reflections and fog agree with it
      lightDir: holeShip ? v3.normalize([0.43, 0.29, -0.82]) : v3.normalize([0.45, 0.72, 0.52]),
      ambient: holeShip ? 0.30 : lerp(0.40, 0.14, smoothstep(0.15, 0.45, p)),
      // At the hole the environment is the accretion disk, not Earth's sky.
      // Leaving the sky palette in place lit the ship cold blue while it sat
      // beside a furnace, which is the single most obvious way to make a
      // metal object look composited in rather than present.
      skyLow: holeShip ? [0.40, 0.235, 0.115] : sky.low,
      skyHigh: holeShip ? [0.020, 0.021, 0.036] : sky.high,
      // Air only exists low down; above about 60 km there is nothing to fog with.
      fog: lerp(0.55, 0.0, smoothstep(0.02, 0.34, altNorm)),
      fogDist: lerp(900, 4200, altNorm),
      // The ship's origin IS its engine plane, so at the black hole the plume
      // has to follow the overridden position. Leaving it on the ascent value
      // left a flame burning in empty space on the far side of the frame.
      enginePos: holeShip ? holeShipPos : enginePos,
      engineLight: holeShip ? 0.25 : 1,
      // Derived from the ship's actual attitude rather than hardcoded. A fixed
      // vector pointed the plume at the camera while the ship faced elsewhere,
      // so the exhaust drifted away and sat as a separate blob in the frame.
      //   axis = rotY(ry) * rotZ(rz) * (0,1,0)
      exhaustDir: holeShip
        ? (() => {
          const ry = holeShipRot[1];
          const rz = holeShipRot[2];
          return [
            Math.cos(ry) * Math.sin(rz),
            -Math.cos(rz),
            -Math.sin(ry) * Math.sin(rz),
          ];
        })()
        : exhaustDir,

      // world
      // The pad recedes with the vehicle and is gone well before orbit. It
      // used to be drawn at a fixed height, so it followed the rocket into
      // space, which is the single most obviously wrong thing on the page.
      showPad: altWorld < 620,
      padY: -altWorld,
      showEarth: earthIn > 0.001,
      earthPos: [0, -(EARTH_R_WORLD + altWorld * 0.9), 0],
      // Scaled in rather than switched on, so the planet grows into frame
      // instead of appearing between two frames.
      earthRadius: EARTH_R_WORLD * lerp(0.55, 1, earthIn),

      // vehicle
      showVehicle: true,
      boosterVisible: boosterVisible && !holeShip,
      boosterPos,
      boosterRot: [0, 0, -pitch * (1 - sepP) - boosterFlip],
      shipPos: holeShip ? holeShipPos : shipPos,
      shipRot: holeShip ? holeShipRot : [0, 0, -pitch],
      thrust: holeShip ? 0.22 : thrust,
      thrustStage: p > 0.345 ? 2 : 1,

      // debug
      mate,
      pitchDeg: (pitch * 180) / Math.PI,
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
