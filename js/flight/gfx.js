// The smallest 3D layer that can fly a rocket. Matrix math, procedural mesh
// building, and thin WebGL2 wrappers.
//
// This exists instead of three.js on purpose. A Falcon 9 is cylinders, cones
// and flat fins; the black hole is a fullscreen raymarch that needs no
// geometry at all. Importing 600 KB of scene graph to draw that would
// contradict the entire point of the page it sits on. Total here is about
// 9 KB uncompressed.

/* ------------------------------------------------------------------ mat4 */
// Column-major, same convention as GL itself, so matrices upload directly.

export const m4 = {
  identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),

  multiply(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = s;
      }
    }
    return out;
  },

  perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
    const f = 1 / Math.tan(fovY / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  lookAt(eye, target, up, out = new Float32Array(16)) {
    const z = v3.normalize(v3.sub(eye, target));
    const x = v3.normalize(v3.cross(up, z));
    const y = v3.cross(z, x);
    out.set([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1,
    ]);
    return out;
  },

  translation(x, y, z) {
    const m = m4.identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },

  scaling(x, y = x, z = x) {
    const m = m4.identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  },

  rotationX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  },

  rotationY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  },

  rotationZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const m = m4.identity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  },

  /** Compose translate * rotZ * rotY * rotX * scale, the order a rocket wants. */
  compose(pos, rot, scale) {
    let m = m4.translation(pos[0], pos[1], pos[2]);
    m = m4.multiply(m, m4.rotationY(rot[1]));
    m = m4.multiply(m, m4.rotationZ(rot[2]));
    m = m4.multiply(m, m4.rotationX(rot[0]));
    return m4.multiply(m, m4.scaling(scale[0], scale[1], scale[2]));
  },

  /** Inverse-transpose of the upper 3x3, for normals under non-uniform scale. */
  normalMatrix(m, out = new Float32Array(9)) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[4], a11 = m[5], a12 = m[6];
    const a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) { out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]); return out; }
    det = 1 / det;
    out[0] = b01 * det;
    out[1] = (-a22 * a01 + a02 * a21) * det;
    out[2] = (a12 * a01 - a02 * a11) * det;
    out[3] = b11 * det;
    out[4] = (a22 * a00 - a02 * a20) * det;
    out[5] = (-a12 * a00 + a02 * a10) * det;
    out[6] = b21 * det;
    out[7] = (-a21 * a00 + a01 * a20) * det;
    out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
  },
};

/* ------------------------------------------------------------------- vec3 */
export const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Maps x from one range to another and clamps, which is most of a scroll rig. */
export const remap = (x, a, b, c, d) => c + (d - c) * clamp((x - a) / (b - a), 0, 1);

/* --------------------------------------------------------------- geometry */
// Builders return { positions, normals, indices } in a Y-up frame with the
// body axis along +Y, because that is the axis a rocket stands on.

/** Open-ended tube, or a cone/frustum when the two radii differ. */
export function tube(r0, r1, height, segments = 24, yBase = 0) {
  const positions = [];
  const normals = [];
  const indices = [];
  const slope = (r0 - r1) / height;
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    // Normal accounts for the taper, otherwise cones light like cylinders.
    const n = v3.normalize([cx, slope, cz]);
    positions.push(cx * r0, yBase, cz * r0);
    normals.push(n[0], n[1], n[2]);
    positions.push(cx * r1, yBase + height, cz * r1);
    normals.push(n[0], n[1], n[2]);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  return { positions, normals, indices };
}

/** Flat disc facing +Y (or -Y when flipped), used for caps and the pad. */
export function disc(radius, segments = 24, y = 0, flip = false) {
  const positions = [0, y, 0];
  const ny = flip ? -1 : 1;
  const normals = [0, ny, 0];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    normals.push(0, ny, 0);
  }
  for (let i = 1; i <= segments; i += 1) {
    if (flip) indices.push(0, i + 1, i);
    else indices.push(0, i, i + 1);
  }
  return { positions, normals, indices };
}

/** UV sphere, for Earth and the moon. */
export function sphere(radius, lat = 32, lon = 48) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i <= lat; i += 1) {
    const theta = (i / lat) * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let j = 0; j <= lon; j += 1) {
      const phi = (j / lon) * Math.PI * 2;
      const n = [st * Math.cos(phi), ct, st * Math.sin(phi)];
      normals.push(n[0], n[1], n[2]);
      positions.push(n[0] * radius, n[1] * radius, n[2] * radius);
    }
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const a = i * (lon + 1) + j;
      const b = a + lon + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

/** A flat quad standing in the XY plane, used for fins and grid fins. */
export function plate(w, h, thickness = 0.02) {
  const hw = w / 2, ht = thickness / 2;
  const positions = [];
  const normals = [];
  const indices = [];
  const face = (nx, nz, z) => {
    const base = positions.length / 3;
    positions.push(-hw, 0, z, hw, 0, z, hw, h, z, -hw, h, z);
    for (let i = 0; i < 4; i += 1) normals.push(nx, 0, nz);
    if (z > 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  face(0, 1, ht);
  face(0, -1, -ht);
  return { positions, normals, indices };
}

/** Concatenates meshes, offsetting indices. */
export function merge(...meshes) {
  const out = { positions: [], normals: [], indices: [] };
  for (const m of meshes) {
    const offset = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.normals.push(...m.normals);
    for (const i of m.indices) out.indices.push(i + offset);
  }
  return out;
}

/** Applies a translation to a mesh in place, for assembling a stack. */
export function translateMesh(mesh, x, y, z) {
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] += x;
    mesh.positions[i + 1] += y;
    mesh.positions[i + 2] += z;
  }
  return mesh;
}

/** Rotates a mesh about Y in place, for placing fins around a body. */
export function rotateMeshY(mesh, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const rot = (arr) => {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i], z = arr[i + 2];
      arr[i] = x * c - z * s;
      arr[i + 2] = x * s + z * c;
    }
  };
  rot(mesh.positions);
  rot(mesh.normals);
  return mesh;
}

/* ------------------------------------------------------------------ WebGL */

export function compileProgram(gl, vertSrc, fragSrc, label = 'program') {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) || '';
      // Report the offending line, because a GLSL error with no line is a
      // twenty minute hunt through a template string.
      const line = /ERROR: \d+:(\d+)/.exec(log);
      const ctx = line ? src.split('\n').slice(Math.max(0, +line[1] - 3), +line[1] + 2).join('\n') : '';
      throw new Error(`${label} ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader:\n${log}\n${ctx}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);
  }
  // Cache uniform locations up front; looking them up per frame is a
  // surprisingly large cost once there are a few dozen.
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { program: p, uniforms };
}

/**
 * Uploads a mesh and returns a VAO plus draw info. Attribute 0 is position and
 * attribute 1 is normal, fixed across every shader here so one VAO works with
 * any of them.
 */
export function uploadMesh(gl, mesh, instanceData = null) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const pos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const nrm = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.normals), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const idx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  const use32 = mesh.positions.length / 3 > 65535;
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    use32 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices),
    gl.STATIC_DRAW
  );

  let instanceBuffer = null;
  if (instanceData) {
    instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);
    // vec4 per instance: xyz offset, w scale or life
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
  }

  gl.bindVertexArray(null);
  return {
    vao,
    count: mesh.indices.length,
    type: use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    instanceBuffer,
  };
}
