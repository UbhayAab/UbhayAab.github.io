// Super Heavy and Starship, built procedurally at real proportions in metres.
//
//    0.0 -  71.0   Super Heavy booster, 9 m diameter
//   71.0 -  73.6   hot-stage ring
//   73.6 - 103.0   ship barrel
//  103.0 - 121.0   ogive nosecone
//
// Engine layout is the real one: 33 Raptors on the booster as 3 centre, 10
// middle, 20 outer, and 6 on the ship as 3 sea-level inboard plus 3 vacuum
// outboard with much larger bells. It matters visually because the plume
// reads as a cluster of that many engines rather than one flame.
//
// The reason this vehicle replaced the Falcon 9 model: no fairing. Nothing
// jettisons to reveal an empty second stage. The ship is the payload, so the
// object that reaches orbit and flies on is a single coherent thing.

import { tube, disc, merge, translateMesh, rotateMeshY } from './gfx.js';

export const SS_GEOM = {
  radius: 4.5,
  boosterTop: 71.0,
  hotRingTop: 73.6,
  shipBarrelTop: 103.0,
  totalHeight: 121.0,
};

const G = SS_GEOM;

/** Rotates a mesh about X in place, for laying flaps back against the hull. */
function rotateMeshX(mesh, a) {
  const c = Math.cos(a), s = Math.sin(a);
  // Step by 3: these are flat xyz triples. Stepping by 1 writes past the end
  // and keeps extending the array until its length is invalid.
  const rot = (arr) => {
    for (let i = 0; i < arr.length; i += 3) {
      const y = arr[i + 1], z = arr[i + 2];
      arr[i + 1] = y * c - z * s;
      arr[i + 2] = y * s + z * c;
    }
  };
  rot(mesh.positions);
  rot(mesh.normals);
  return mesh;
}

/** Trapezoidal control surface, thick enough to catch light from the side. */
function flap(rootChord, tipChord, span, thickness = 0.55) {
  const positions = [];
  const normals = [];
  const indices = [];
  const ht = thickness / 2;
  // Root at y=0 spanning x, tip at y=span, swept back a little.
  const sweep = rootChord * 0.22;
  const pts = [
    [-rootChord / 2, 0], [rootChord / 2, 0],
    [tipChord / 2 + sweep, span], [-tipChord / 2 + sweep, span],
  ];
  const face = (z, nz) => {
    const base = positions.length / 3;
    for (const [x, y] of pts) { positions.push(x, y, z); normals.push(0, 0, nz); }
    if (nz > 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  face(ht, 1);
  face(-ht, -1);
  // Edge band so the flap is a solid, not two planes.
  for (let i = 0; i < 4; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    const base = positions.length / 3;
    const nx = y1 - y0, ny = -(x1 - x0);
    const n = Math.hypot(nx, ny) || 1;
    positions.push(x0, y0, ht, x1, y1, ht, x1, y1, -ht, x0, y0, -ht);
    for (let k = 0; k < 4; k += 1) normals.push(nx / n, ny / n, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

/** Raptor bell. */
function raptor(bellRadius, length) {
  return merge(
    tube(bellRadius * 0.36, bellRadius, length, 10, -length),
    disc(bellRadius, 10, -length, true)
  );
}

function boosterEngines() {
  const parts = [];
  const ring = (count, radius, bell, len, phase = 0) => {
    for (let i = 0; i < count; i += 1) {
      const a = phase + (i / count) * Math.PI * 2;
      const m = raptor(bell, len);
      translateMesh(m, Math.cos(a) * radius, 0, Math.sin(a) * radius);
      parts.push(m);
    }
  };
  ring(3, 1.5, 0.62, 2.6);           // gimbaling centre engines
  ring(10, 2.75, 0.58, 2.4, 0.12);   // middle ring
  ring(20, 3.95, 0.55, 2.2, 0.05);   // outer ring
  return merge(...parts);
}

function shipEngines() {
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const m = raptor(0.68, 2.4);
    translateMesh(m, Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
    parts.push(m);
  }
  // Vacuum Raptors: much larger bells, which is a visible identifying feature.
  for (let i = 0; i < 3; i += 1) {
    const a = Math.PI / 3 + (i / 3) * Math.PI * 2;
    const m = raptor(1.30, 3.4);
    translateMesh(m, Math.cos(a) * 2.75, 0, Math.sin(a) * 2.75);
    parts.push(m);
  }
  return merge(...parts);
}

/** Four grid fins near the top of the booster, stowed flat. */
function gridFins() {
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const f = flap(3.4, 3.0, 2.6, 0.42);
    rotateMeshX(f, Math.PI / 2);          // lay it flat against the hull
    translateMesh(f, 0, G.boosterTop - 7.5, G.radius + 0.3);
    rotateMeshY(f, (i / 4) * Math.PI * 2 + Math.PI / 4);
    parts.push(f);
  }
  return merge(...parts);
}

export function buildStarship() {
  const r = G.radius;

  const booster = merge(
    tube(r, r, G.boosterTop, 32, 0),
    disc(r, 32, 0, true),
    // Hot-stage ring: a vented extension the ship fires through at separation.
    tube(r * 0.985, r * 0.985, G.hotRingTop - G.boosterTop, 32, G.boosterTop),
    gridFins(),
    boosterEngines()
  );

  // Ship: barrel, ogive nose, flaps, engines. Built in world coordinates so
  // the stack sits correctly, then drawn with its own transform after staging.
  const noseSegments = 12;
  const noseBase = G.shipBarrelTop;
  const noseLen = G.totalHeight - noseBase;
  const nosePositions = [];
  const noseNormals = [];
  const noseIndices = [];
  for (let i = 0; i <= noseSegments; i += 1) {
    const t = i / noseSegments;
    const y = noseBase + t * noseLen;
    // Ogive profile: full radius at the base tapering to a rounded tip.
    const rad = r * Math.sqrt(Math.max(0, 1 - t * t * 0.985));
    const tNext = Math.min(1, t + 1 / noseSegments);
    const radNext = r * Math.sqrt(Math.max(0, 1 - tNext * tNext * 0.985));
    const slope = (rad - radNext) / (noseLen / noseSegments);
    for (let j = 0; j <= 32; j += 1) {
      const a = (j / 32) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      nosePositions.push(cx * rad, y, cz * rad);
      const n = Math.hypot(1, slope) || 1;
      noseNormals.push(cx / n, slope / n, cz / n);
    }
  }
  for (let i = 0; i < noseSegments; i += 1) {
    for (let j = 0; j < 32; j += 1) {
      const a = i * 33 + j;
      const b = a + 33;
      noseIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const flaps = [];
  // Two forward flaps high on the nose, two larger aft flaps at the base.
  for (const side of [0, Math.PI]) {
    const fwd = flap(5.0, 3.4, 5.2, 0.55);
    rotateMeshX(fwd, 0.42);
    translateMesh(fwd, 0, G.shipBarrelTop - 5.5, r - 0.4);
    rotateMeshY(fwd, side + Math.PI / 2);
    flaps.push(fwd);

    const aft = flap(7.6, 5.0, 6.4, 0.62);
    rotateMeshX(aft, -0.30);
    translateMesh(aft, 0, G.hotRingTop + 4.5, r - 0.4);
    rotateMeshY(aft, side + Math.PI / 2);
    flaps.push(aft);
  }

  // shipEngines() builds its bells around y = 0, which is the pad, not the
  // ship's base. Merged untranslated they ended up 73.6 m below the ship: while
  // the stack was mated they sat among the booster's own engines and nobody
  // noticed, but once the ship flew alone its engine cluster trailed along
  // behind it as a detached clump of nozzles in open space.
  const engines = shipEngines();
  translateMesh(engines, 0, G.hotRingTop, 0);

  const ship = merge(
    tube(r, r, G.shipBarrelTop - G.hotRingTop, 32, G.hotRingTop),
    disc(r, 32, G.hotRingTop, true),
    { positions: nosePositions, normals: noseNormals, indices: noseIndices },
    ...flaps,
    engines
  );

  // Rebase the ship so its own origin is its engine plane rather than the pad.
  // Built in stack coordinates it sits 73.6 m up in its own local space, and
  // any rotation then swings it that far sideways: pitching into the gravity
  // turn threw the ship a hundred metres out of frame and left its plume
  // hanging in empty space.
  translateMesh(ship, 0, -G.hotRingTop, 0);

  return { booster, ship, shipBaseHeight: G.hotRingTop };
}

/** Orbital launch mount and tower. Kept small so the vehicle stays the subject. */
export function buildPad() {
  const parts = [
    disc(26, 32, 0),
    tube(20, 24, 5, 32, -5),
  ];
  // Launch mount the booster stands on.
  parts.push(tube(7.5, 7.5, 9, 20, -9));
  // Tower, set behind and to one side so it never occludes the vehicle.
  const tower = merge(tube(1.6, 1.3, 108, 10, 0));
  translateMesh(tower, -15, 0, -11);
  parts.push(tower);
  for (let i = 0; i < 9; i += 1) {
    const a = flap(7.0, 6.0, 0.7, 0.7);
    rotateMeshX(a, Math.PI / 2);
    translateMesh(a, -11.5, 10 + i * 11, -11);
    parts.push(a);
  }
  return merge(...parts);
}
