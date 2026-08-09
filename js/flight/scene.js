// The renderer. Owns the GL context and every pass, and draws whichever
// phase the director asks for.
//
// Passes, in draw order:
//   sky      fullscreen, atmosphere colour by altitude, stars fading in
//   warp     fullscreen, star streaks, only during the cruise
//   hole     fullscreen, the Schwarzschild raymarch, only at the end
//   earth    lit sphere, once high enough to see the curve
//   solids   lit meshes: pad, Super Heavy booster, Starship ship
//   plume    additive instanced billboards
//
// One context, one depth buffer, no framebuffers. Everything composites by
// draw order and blend mode, which is enough here and keeps the whole file
// under 400 lines.

import {
  m4, v3, clamp, lerp, smoothstep, remap,
  compileProgram, uploadMesh, sphere, disc, merge, translateMesh,
} from './gfx.js';
import { buildStarship, buildPad, SS_GEOM } from './rocket.js';
import { BLACKHOLE_FRAG, FULLSCREEN_VERT, BH_STEPS } from './blackhole.js';

/* --------------------------------------------------------------- shaders */

const LIT_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNormal;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormal * aNormal);
  gl_Position = uProj * uView * world;
}`;

const LIT_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;

uniform vec3  uColor;
uniform vec3  uLightDir;
uniform vec3  uCamPos;
uniform float uAmbient;
uniform float uRim;
uniform float uEmissive;
uniform float uMetal;       // 0 = matte, 1 = bare stainless
uniform vec3  uSkyLow;      // horizon colour of the current sky
uniform vec3  uSkyHigh;     // zenith colour
uniform vec3  uEnginePos;   // where the plume is, in world space
uniform float uEngineGlow;  // 0..1
uniform float uFog;         // atmospheric blend, 0..1
uniform float uFogDist;     // distance at which fog saturates

out vec4 outColor;

// Cheap two-colour environment. Stainless steel is almost entirely a mirror,
// so what it looks like is whatever is around it: sky above, ground below.
// Sampling that instead of a fixed grey is most of why the vehicle stops
// looking like it was pasted onto the background.
vec3 envSample(vec3 dir) {
  float up = dir.y * 0.5 + 0.5;
  vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.42, 1.0, up));
  vec3 ground = uSkyLow * 0.25;
  return mix(ground, sky, smoothstep(0.40, 0.58, up));
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 l = normalize(uLightDir);

  float diff = max(dot(n, l), 0.0);
  vec3 base = uColor;

  // Ring welds. Starship is stacked from 1.8 m steel rings and the seams are
  // clearly visible on the real vehicle.
  float ring = smoothstep(0.88, 1.0, abs(fract(vWorld.y / 1.83) * 2.0 - 1.0));
  base *= 1.0 - ring * 0.10;
  // Faint vertical panelling.
  base *= 0.965 + 0.035 * sin(atan(vWorld.z, vWorld.x) * 24.0);

  // Diffuse, lifted by an ambient term that is the sky rather than a constant.
  vec3 ambient = envSample(n) * uAmbient * 1.7;
  vec3 col = base * (ambient + diff * 0.85);

  // Specular. Blinn-Phong for the key light plus a mirror sample of the
  // environment, weighted by a Schlick fresnel.
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), mix(24.0, 96.0, uMetal));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float f = mix(0.04, 1.0, fres);
  vec3 refl = envSample(reflect(-v, n));
  col = mix(col, refl, uMetal * clamp(f * 1.4 + 0.20, 0.0, 0.92));
  col += vec3(1.0) * spec * mix(0.25, 1.1, uMetal);

  // The plume is a real light source. Without this the engines fire and the
  // hull above them stays evenly lit, which reads as fake immediately.
  if (uEngineGlow > 0.001) {
    vec3 toE = uEnginePos - vWorld;
    float d = length(toE);
    float atten = uEngineGlow * 900.0 / (d * d + 90.0);
    float wrap = max(dot(n, normalize(toE)) * 0.6 + 0.4, 0.0);
    col += vec3(1.0, 0.52, 0.20) * atten * wrap;
  }

  col += base * uEmissive;
  col += envSample(reflect(-v, n)) * pow(1.0 - max(dot(n, v), 0.0), 3.0) * uRim * 0.6;

  // Aerial perspective. Distant geometry has air in front of it and must sink
  // toward the sky colour, otherwise near and far read at the same contrast
  // and the whole scene flattens.
  float dist = length(uCamPos - vWorld);
  float fog = uFog * (1.0 - exp(-dist / max(uFogDist, 1.0)));
  col = mix(col, mix(uSkyLow, uSkyHigh, 0.4), clamp(fog, 0.0, 0.92));

  outColor = vec4(max(col, 0.0), 1.0);
}`;

// Sky, stars and warp in one fullscreen pass. Which of them is visible is a
// function of altitude and warp amount, so they never need separate draws.
const SKY_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uAlt;      // 0 = pad, 1 = space
uniform float uWarp;     // 0..1
uniform mat3 uCamBasis;
uniform float uFov;
out vec4 outColor;

float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float hash31(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 ndc = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 dir = normalize(uCamBasis * vec3(ndc*uFov, -1.0));

  // Night launch. A daylight sky puts white text on pale blue and destroys the
  // contrast the whole page is built on, and night launches look better
  // anyway. Deep blue-black at the pad, true black in space.
  vec3 low  = mix(vec3(0.020,0.030,0.062), vec3(0.045,0.060,0.105), pow(1.0-uv.y, 2.0));
  vec3 high = vec3(0.003,0.005,0.014);
  vec3 sky = mix(low, high, smoothstep(0.0, 0.72, uAlt));

  // Horizon: warm sodium glow from the launch site at low altitude, cold blue
  // airglow on the limb once the curve appears.
  float horizon = exp(-pow((uv.y - 0.30) * mix(6.0, 46.0, uAlt), 2.0));
  vec3 horizonCol = mix(vec3(0.32, 0.16, 0.055), vec3(0.10, 0.26, 0.55), smoothstep(0.10, 0.55, uAlt));
  sky += horizonCol * horizon * mix(0.55, 0.80, uAlt);

  // Stars are out from the start on a night launch, and simply get sharper as
  // the air thins.
  float starMix = mix(0.42, 1.0, smoothstep(0.05, 0.6, uAlt));
  vec3 stars = vec3(0.0);
  if (starMix > 0.001) {
    for (int oct = 0; oct < 2; oct++) {
      float scale = 110.0 * pow(2.0, float(oct));
      vec3 p = dir * scale;
      vec3 cell = floor(p);
      vec3 f = fract(p) - 0.5;
      float h = hash31(cell);
      if (h > 0.977) {
        // Under warp, stars smear along their radial direction from centre.
        vec2 rad = normalize(ndc + 1e-5);
        float along = dot(f.xy, rad);
        float across = length(f.xy - rad*along);
        float len = mix(0.30, 0.03, uWarp);
        float d = mix(length(f), max(abs(along)*len*3.0, across)/max(len,0.02)*0.30, uWarp);
        stars += vec3(0.9,0.94,1.0) * smoothstep(0.34, 0.0, d) * (h-0.977)/0.023;
      }
    }
  }
  sky += stars * starMix;

  // Warp adds a forward-rushing tunnel glow and desaturates the edges.
  if (uWarp > 0.001) {
    float r = length(ndc);
    float tunnel = exp(-r*2.4) * uWarp;
    sky += vec3(0.35,0.55,1.0) * tunnel * 0.5;
    sky *= mix(1.0, 1.0 + r*1.8, uWarp*0.6);
  }

  sky += (hash21(gl_FragCoord.xy + fract(uTime))-0.5)*0.012;
  outColor = vec4(max(sky,0.0), 1.0);
}`;

// Additive plume. One instanced quad per particle; the instance vec4 carries
// position and life.
const PLUME_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aInst;   // xyz = offset, w = life 0..1
uniform mat4 uProj, uView;
uniform vec3 uRight, uUp;
uniform float uScale;
out float vLife;
void main() {
  vLife = aInst.w;
  float s = uScale * mix(0.35, 2.6, 1.0 - aInst.w);
  vec3 world = aInst.xyz + (uRight * aPos.x + uUp * aPos.y) * s;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const PLUME_FRAG = `#version 300 es
precision highp float;
in float vLife;
uniform float uIntensity;
out vec4 outColor;
void main() {
  // Soft round sprite without a texture.
  vec2 d = gl_PointCoord;  // unused, kept for clarity
  float life = clamp(vLife, 0.0, 1.0);
  vec3 hot  = vec3(1.0, 0.94, 0.80);
  vec3 mid  = vec3(1.0, 0.52, 0.14);
  vec3 cool = vec3(0.32, 0.12, 0.06);
  vec3 col = mix(hot, mid, smoothstep(0.0, 0.35, 1.0-life));
  col = mix(col, cool, smoothstep(0.35, 1.0, 1.0-life));
  float a = life * life * uIntensity;
  outColor = vec4(col * a, a);
}`;

const QUAD = {
  positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0],
  normals: new Array(18).fill(0),
  indices: [0, 1, 2, 3, 4, 5],
};

/* ----------------------------------------------------------------- scene */

const PARTICLES = { low: 220, mid: 520, high: 900 };

export function createScene(canvas, { tier = 'high' } = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: tier !== 'low', alpha: false, depth: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let programs;
  try {
    programs = {
      lit: compileProgram(gl, LIT_VERT, LIT_FRAG, 'lit'),
      sky: compileProgram(gl, FULLSCREEN_VERT, SKY_FRAG, 'sky'),
      plume: compileProgram(gl, PLUME_VERT, PLUME_FRAG, 'plume'),
      hole: compileProgram(gl, FULLSCREEN_VERT, BLACKHOLE_FRAG, 'blackhole'),
    };
  } catch (e) {
    console.error(e);
    return null;
  }

  const parts = buildStarship();
  const meshes = {
    booster: uploadMesh(gl, parts.booster),
    ship: uploadMesh(gl, parts.ship),
    pad: uploadMesh(gl, buildPad()),
    earth: uploadMesh(gl, sphere(1, 40, 64)),
  };

  const maxParticles = PARTICLES[tier] || PARTICLES.high;
  const instData = new Float32Array(maxParticles * 4);
  const plume = uploadMesh(gl, QUAD, instData);
  const emptyVao = gl.createVertexArray();

  const particles = Array.from({ length: maxParticles }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0,
  }));
  let cursor = 0;

  const state = {
    w: 0, h: 0,
    steps: BH_STEPS[tier] || BH_STEPS.high,
    maxParticles,
    holeMode: false,
  };

  function resize() {
    const cap = matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    let dpr = Math.min(devicePixelRatio || 1, cap);
    if (tier === 'low') dpr = 1;
    let budget = matchMedia('(pointer: coarse)').matches ? 1_000_000 : 2_400_000;
    // The black hole costs 300 to 500 geodesic integration steps per pixel,
    // so it is the one pass where pixel count genuinely dominates. Its image
    // is smooth, so dropping the backing store and letting the browser scale
    // it up is nearly invisible and roughly triples the frame rate. The CSS
    // size never changes, so nothing reflows.
    if (state.holeMode) budget = Math.round(budget * 0.38);
    let w = Math.round((canvas.clientWidth || innerWidth) * dpr);
    let h = Math.round((canvas.clientHeight || innerHeight) * dpr);
    const px = w * h;
    if (px > budget) {
      const k = Math.sqrt(budget / px);
      w = Math.round(w * k); h = Math.round(h * k);
    }
    if (w === state.w && h === state.h) return;
    canvas.width = w; canvas.height = h;
    state.w = w; state.h = h;
  }
  resize();

  /** Spawns plume particles at the engine plane. */
  function emit(count, origin, spread, speed, dt) {
    for (let i = 0; i < count; i += 1) {
      const p = particles[cursor];
      cursor = (cursor + 1) % maxParticles;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      p.x = origin[0] + Math.cos(a) * r;
      p.y = origin[1];
      p.z = origin[2] + Math.sin(a) * r;
      p.vx = Math.cos(a) * r * 0.9;
      p.vy = -speed * (0.6 + Math.random() * 0.7);
      p.vz = Math.sin(a) * r * 0.9;
      p.life = 1;
    }
    void dt;
  }

  function stepParticles(dt) {
    let n = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.15;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.985; p.vz *= 0.985;
      p.vy *= 0.99;
      instData[n * 4] = p.x;
      instData[n * 4 + 1] = p.y;
      instData[n * 4 + 2] = p.z;
      instData[n * 4 + 3] = p.life;
      n += 1;
      if (n >= maxParticles) break;
    }
    return n;
  }

  const drawMesh = (mesh, model, color, opts = {}) => {
    const { uniforms } = programs.lit;
    gl.uniformMatrix4fv(uniforms.uModel, false, model);
    gl.uniformMatrix3fv(uniforms.uNormal, false, m4.normalMatrix(model));
    gl.uniform3fv(uniforms.uColor, color);
    gl.uniform1f(uniforms.uEmissive, opts.emissive || 0);
    gl.uniform1f(uniforms.uRim, opts.rim ?? 0.5);
    gl.uniform1f(uniforms.uMetal, opts.metal ?? 0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
  };

  /**
   * @param {object} f flight state from the director
   */
  function render(f, dt, time) {
    // Hysteresis on the two thresholds so scrubbing across the boundary does
    // not reallocate the drawing buffer on alternate frames.
    if (!state.holeMode && f.hole > 0.55) state.holeMode = true;
    else if (state.holeMode && f.hole < 0.35) state.holeMode = false;

    // Closed loop on the black hole's step count.
    //
    // The cost of this pass is dominated by integration steps per pixel, and
    // the right number depends entirely on the GPU in front of it: a desktop
    // card and a software rasteriser are two orders of magnitude apart. Rather
    // than pick a number and hope, measure the frame and converge. Adjusts at
    // most a few steps a frame so the image never visibly pops.
    if (state.holeMode && dt > 0) {
      const ms = dt * 1000;
      const ceiling = BH_STEPS[tier] || BH_STEPS.high;
      // The floor is 70, not 24. Below roughly 60 steps the rays that should
      // fall through the horizon escape instead, the shadow fills with stars,
      // and the black hole stops being a black hole. Resolution degrades
      // gracefully; correctness does not, so pixels give way first.
      const FLOOR = 70;
      if (ms > 34 && state.steps > FLOOR) state.steps -= Math.min(8, state.steps - FLOOR);
      else if (ms < 15 && state.steps < ceiling) state.steps += 2;
    }

    resize();
    gl.viewport(0, 0, state.w, state.h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = state.w / Math.max(1, state.h);
    const proj = m4.perspective(f.fov, aspect, 0.25, 6000);
    const view = m4.lookAt(f.camPos, f.camTarget, [0, 1, 0]);

    // Camera basis for the fullscreen passes.
    const fwd = v3.normalize(v3.sub(f.camTarget, f.camPos));
    const right = v3.normalize(v3.cross([0, 1, 0], fwd));
    const up = v3.cross(fwd, right);
    const basis = new Float32Array([
      right[0], right[1], right[2],
      up[0], up[1], up[2],
      -fwd[0], -fwd[1], -fwd[2],
    ]);

    // --- background --------------------------------------------------------
    gl.depthMask(false);
    if (f.hole > 0.001) {
      // The hole lives in its own coordinate frame, so it needs its own
      // camera basis. Reusing the vehicle camera's orientation here points a
      // correctly positioned camera in completely the wrong direction, and
      // the hole simply is not on screen.
      const hFwd = v3.normalize(v3.sub([0, 0, 0], f.holeCam));
      const hRight = v3.normalize(v3.cross([0, 1, 0], hFwd));
      const hUp = v3.cross(hFwd, hRight);
      const holeBasis = new Float32Array([
        hRight[0], hRight[1], hRight[2],
        hUp[0], hUp[1], hUp[2],
        -hFwd[0], -hFwd[1], -hFwd[2],
      ]);

      const { program, uniforms } = programs.hole;
      gl.useProgram(program);
      gl.bindVertexArray(emptyVao);
      gl.uniform2f(uniforms.u_res, state.w, state.h);
      gl.uniform1f(uniforms.u_time, time * 0.001);
      gl.uniform3fv(uniforms.u_camPos, f.holeCam);
      gl.uniformMatrix3fv(uniforms.u_camBasis, false, holeBasis);
      gl.uniform1f(uniforms.u_fov, 0.85);
      gl.uniform1i(uniforms.u_steps, state.steps);
      gl.uniform1f(uniforms.u_diskInner, 3.0);
      gl.uniform1f(uniforms.u_diskOuter, 11.5);
      gl.uniform1f(uniforms.u_intensity, f.hole);
      gl.uniform1f(uniforms.u_diskTilt, 0.20);
      gl.uniform1f(uniforms.u_flare, f.flare || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      const { program, uniforms } = programs.sky;
      gl.useProgram(program);
      gl.bindVertexArray(emptyVao);
      gl.uniform2f(uniforms.uRes, state.w, state.h);
      gl.uniform1f(uniforms.uTime, time * 0.001);
      gl.uniform1f(uniforms.uAlt, f.skyAlt);
      gl.uniform1f(uniforms.uWarp, f.warp);
      gl.uniformMatrix3fv(uniforms.uCamBasis, false, basis);
      gl.uniform1f(uniforms.uFov, 0.9);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // --- solids ------------------------------------------------------------
    if (f.showVehicle || f.showEarth) {
      const { program, uniforms } = programs.lit;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uProj, false, proj);
      gl.uniformMatrix4fv(uniforms.uView, false, view);
      gl.uniform3fv(uniforms.uLightDir, f.lightDir);
      gl.uniform3fv(uniforms.uCamPos, f.camPos);
      gl.uniform1f(uniforms.uAmbient, f.ambient);
      // The sky the vehicle is standing in, so its reflections and its fog
      // are the same colour as the background behind it.
      gl.uniform3fv(uniforms.uSkyLow, f.skyLow);
      gl.uniform3fv(uniforms.uSkyHigh, f.skyHigh);
      gl.uniform1f(uniforms.uFog, f.fog);
      gl.uniform1f(uniforms.uFogDist, f.fogDist);
      gl.uniform3fv(uniforms.uEnginePos, f.enginePos);
      gl.uniform1f(uniforms.uEngineGlow, f.thrust * f.engineLight);

      if (f.showEarth) {
        const s = f.earthRadius;
        drawMesh(meshes.earth, m4.compose(f.earthPos, [0, time * 0.00002, 0], [s, s, s]),
          [0.09, 0.24, 0.50], { rim: 2.4, metal: 0 });
      }

      if (f.showPad) {
        // Sunk below the engine bells so the plume fires above the deck
        // rather than through it, which is what a flame trench does.
        drawMesh(meshes.pad, m4.compose([0, f.padY - 9, 0], [0, 0, 0], [1, 1, 1]),
          [0.075, 0.082, 0.10], { rim: 0.15, metal: 0.15 });
      }

      if (f.showVehicle) {
        // Bare stainless steel. High metal weight so it takes its colour from
        // the sky rather than from a baked albedo.
        const STEEL = [0.62, 0.65, 0.70];
        if (f.boosterVisible) {
          drawMesh(meshes.booster, m4.compose(f.boosterPos, f.boosterRot, [1, 1, 1]),
            STEEL, { rim: 0.5, metal: 0.86 });
        }
        drawMesh(meshes.ship, m4.compose(f.shipPos, f.shipRot, [1, 1, 1]),
          STEEL, { rim: 0.5, metal: 0.9 });
      }
    }

    // --- plume -------------------------------------------------------------
    if (f.thrust > 0.01 && f.showVehicle) {
      // 33 engines make a far wider plume than 6, so the spread and rate scale
      // with which stage is actually burning.
      const booster = f.thrustStage === 1;
      const rate = Math.min(72, Math.round(f.thrust * (booster ? 46 : 16) * Math.min(dt, 0.05) * 60));
      emit(rate, f.enginePos, booster ? 4.2 : 2.4, booster ? 62 : 34, dt);
    }
    const live = stepParticles(Math.min(dt, 0.05));
    if (live > 0 && f.showVehicle) {
      const { program, uniforms } = programs.plume;
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, plume.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, live * 4);
      gl.uniformMatrix4fv(uniforms.uProj, false, proj);
      gl.uniformMatrix4fv(uniforms.uView, false, view);
      gl.uniform3fv(uniforms.uRight, right);
      gl.uniform3fv(uniforms.uUp, up);
      gl.uniform1f(uniforms.uScale, f.thrustStage === 1 ? 3.4 : 2.0);
      gl.uniform1f(uniforms.uIntensity, clamp(f.thrust, 0, 1) * 0.85);
      gl.bindVertexArray(plume.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, plume.count, plume.type, 0, live);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  return {
    render,
    resize,
    setTier(t) {
      state.steps = BH_STEPS[t] || BH_STEPS.high;
    },
    stats() {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        backing: `${state.w}x${state.h}`,
        pixels: state.w * state.h,
        bhSteps: state.steps,
        particles: maxParticles,
      };
    },
  };
}

export { clamp, lerp, smoothstep, remap };
