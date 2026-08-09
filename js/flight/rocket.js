// Falcon 9 geometry, built procedurally at real proportions in metres and
// split into the parts that have to move independently.
//
//   0.0  - 42.6  stage 1 tank
//  42.6  - 49.3  interstage
//  49.3  - 56.9  stage 2 tank
//  56.9  - 70.0  fairing
//
// Nine Merlins at the base: one centre, eight on a 1.2 m ring, which is the
// real octaweb layout and the reason the plume reads as a cluster rather than
// a single flame.

import { tube, disc, plate, merge, translateMesh, rotateMeshY } from './gfx.js';

export const F9_GEOM = {
  coreRadius: 1.85,
  stage1Top: 42.6,
  interstageTop: 49.3,
  stage2Top: 56.9,
  totalHeight: 70,
  fairingRadius: 2.6,
  engineRing: 1.2,
  engineRadius: 0.42,
};

const G = F9_GEOM;

/** Nine Merlin bells hanging below y=0. */
function merlins(bellLength = 2.4) {
  const parts = [];
  const bell = () => merge(
    tube(0.22, G.engineRadius, bellLength, 12, -bellLength),
    disc(G.engineRadius, 12, 0, true)
  );
  parts.push(bell());
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const m = bell();
    translateMesh(m, Math.cos(a) * G.engineRing, 0, Math.sin(a) * G.engineRing);
    parts.push(m);
  }
  return merge(...parts);
}

/** Four grid fins, stowed flat against the interstage. */
function gridFins() {
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const f = plate(1.5, 2.2, 0.12);
    translateMesh(f, 0, 0, G.coreRadius + 0.06);
    rotateMeshY(f, (i / 4) * Math.PI * 2 + Math.PI / 4);
    translateMesh(f, 0, G.stage1Top + 2.6, 0);
    parts.push(f);
  }
  return merge(...parts);
}

/** Four landing legs, folded along the tank. */
function legs() {
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const l = merge(tube(0.28, 0.16, 9, 8, 0));
    translateMesh(l, G.coreRadius + 0.18, 0.4, 0);
    rotateMeshY(l, (i / 4) * Math.PI * 2 + Math.PI / 4);
    parts.push(l);
  }
  return merge(...parts);
}

/**
 * Builds every part. Each is returned separately so the renderer can move
 * them apart at staging and fairing deploy.
 */
export function buildFalcon9() {
  const r = G.coreRadius;

  const stage1 = merge(
    tube(r, r, G.stage1Top, 28, 0),
    disc(r, 28, 0, true),
    // black soot band the reused boosters wear
    tube(r * 1.002, r * 1.002, 4.5, 28, 6),
    legs(),
    merlins()
  );

  const interstage = merge(
    tube(r, r, G.interstageTop - G.stage1Top, 28, G.stage1Top),
    gridFins()
  );

  const stage2 = merge(
    tube(r, r, G.stage2Top - G.interstageTop, 28, G.interstageTop),
    disc(r, 28, G.interstageTop, true),
    // single Merlin Vacuum, much larger bell
    tube(0.3, 1.15, 3.2, 16, G.interstageTop - 3.2),
    disc(1.15, 16, G.interstageTop - 3.2, true)
  );

  // Fairing split into two half-shells so it can deploy. Each half is the
  // same profile, drawn over half the circumference.
  const fairingHalf = (startAngle) => {
    const segs = 14;
    const positions = [];
    const normals = [];
    const indices = [];
    // Profile: flare out, straight section, then an ogive to the tip.
    const profile = [
      [G.stage2Top, r],
      [G.stage2Top + 2.0, G.fairingRadius],
      [G.stage2Top + 7.0, G.fairingRadius],
      [G.stage2Top + 10.0, G.fairingRadius * 0.82],
      [G.stage2Top + 12.0, G.fairingRadius * 0.45],
      [G.totalHeight, 0.12],
    ];
    for (let p = 0; p < profile.length; p += 1) {
      const [y, rad] = profile[p];
      const next = profile[Math.min(p + 1, profile.length - 1)];
      const slope = next[0] === y ? 0 : (rad - next[1]) / (next[0] - y);
      for (let i = 0; i <= segs; i += 1) {
        const a = startAngle + (i / segs) * Math.PI;
        const cx = Math.cos(a), cz = Math.sin(a);
        positions.push(cx * rad, y, cz * rad);
        const n = Math.hypot(1, slope) || 1;
        normals.push(cx / n, slope / n, cz / n);
      }
    }
    for (let p = 0; p < profile.length - 1; p += 1) {
      for (let i = 0; i < segs; i += 1) {
        const a = p * (segs + 1) + i;
        const b = a + segs + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { positions, normals, indices };
  };

  return {
    stage1,
    interstage,
    stage2,
    fairingA: fairingHalf(-Math.PI / 2),
    fairingB: fairingHalf(Math.PI / 2),
  };
}

/** Simple launch pad and tower so the vehicle has somewhere to stand. */
export function buildPad() {
  // Kept deliberately small relative to the vehicle. A real pad deck is far
  // wider, but at this camera it swallows the rocket and the rocket is the
  // subject.
  const parts = [
    disc(21, 32, 0),
    tube(16, 19, 3.5, 32, -3.5),
  ];
  // Strongback, set behind and to one side so it never occludes the vehicle.
  const tower = merge(tube(1.0, 0.8, 58, 10, 0));
  translateMesh(tower, -8.5, 0, -6.5);
  parts.push(tower);
  for (let i = 0; i < 6; i += 1) {
    const a = plate(5.0, 0.45, 0.45);
    translateMesh(a, -6.0, 9 + i * 8.5, -6.5);
    parts.push(a);
  }
  return merge(...parts);
}
