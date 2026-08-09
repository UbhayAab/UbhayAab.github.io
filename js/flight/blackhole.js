// Schwarzschild black hole, raymarched.
//
// Light paths are integrated, not faked. For a photon in Schwarzschild
// spacetime the Binet equation
//
//     d2u/dphi2 + u = 3 M u^2,        u = 1/r
//
// has an exact Cartesian equivalent for the affine-parameterised trajectory
//
//     d2r/dlambda2 = -3 M h^2 r / |r|^5,     h = |r x dr/dlambda|
//
// Working in units where the Schwarzschild radius r_s = 1 puts M = 0.5, so the
// coefficient is -1.5. In those units:
//
//     event horizon     r = 1
//     photon sphere     r = 1.5      (3M)
//     ISCO              r = 3        (6M)
//     critical impact   b = 2.598    (3*sqrt(3)*M)
//
// Because the paths are real, the lensing is real: the accretion disk behind
// the hole is bent up over the top and down under the bottom, the far side of
// the disk appears above and below the near side, and the photon ring appears
// on its own as light that looped the hole before escaping. None of that is
// drawn, it falls out of the integration.
//
// The disk is shaded with a Novikov-Thorne-flavoured temperature profile
// T ~ r^(-3/4), relativistic Doppler beaming from its Keplerian orbit, and
// gravitational redshift. The approaching side really is brighter and bluer.

export const BLACKHOLE_FRAG = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_camPos;
uniform mat3  u_camBasis;
uniform float u_fov;
uniform int   u_steps;        // integration steps, set by the quality tier
uniform float u_diskInner;
uniform float u_diskOuter;
uniform float u_intensity;    // 0..1 fade in as the hole is approached
uniform float u_diskTilt;

out vec4 outColor;

const float PI = 3.14159265359;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Sparse star field sampled on a direction. Cell-based so stars are points
// rather than noise, with a few bright ones and a faint galactic band.
vec3 starField(vec3 dir) {
  vec3 col = vec3(0.0);
  for (int oct = 0; oct < 3; oct++) {
    float scale = 90.0 * pow(2.0, float(oct));
    vec3 p = dir * scale;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash31(cell);
    if (h > 0.972) {
      float d = length(f - (vec3(hash31(cell + 1.7), hash31(cell + 3.1), hash31(cell + 5.3)) - 0.5) * 0.6);
      float bright = smoothstep(0.34, 0.0, d) * (h - 0.972) / 0.028;
      // Slight colour spread so the field is not uniformly white.
      vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.68), hash31(cell + 9.1));
      col += tint * bright * (1.4 - 0.35 * float(oct));
    }
  }
  // Galactic band: a narrow dusty stripe. The amplitude has to be tiny
  // because the 1/2.2 gamma at the end lifts it hard: 0.055 linear comes out
  // as 0.26 on screen, which turns the whole sky grey.
  float band = exp(-pow(dir.y * 6.5, 2.0));
  col += vec3(0.004, 0.005, 0.011) * band;
  return col;
}

// Blackbody-ish ramp. Not a Planck integral, but monotonic and correctly
// ordered from deep red through orange and white to blue.
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c;
  c = mix(vec3(0.62, 0.09, 0.02), vec3(1.0, 0.42, 0.05), smoothstep(0.0, 0.32, t));
  c = mix(c, vec3(1.0, 0.82, 0.42), smoothstep(0.28, 0.6, t));
  c = mix(c, vec3(1.0, 0.98, 0.94), smoothstep(0.55, 0.82, t));
  c = mix(c, vec3(0.76, 0.86, 1.0), smoothstep(0.8, 1.0, t));
  return c;
}

// Turbulent structure in the disk so it reads as gas rather than a gradient.
float diskTexture(vec2 q, float r) {
  float a = atan(q.y, q.x);
  // Shear: inner material orbits faster, so the pattern winds up.
  float wind = a + u_time * 0.22 / pow(max(r, 0.6), 1.5) * 6.0;
  float n = 0.0;
  float amp = 0.5;
  vec2 p = vec2(wind * 1.6, r * 2.4);
  for (int i = 0; i < 4; i++) {
    n += amp * (hash21(floor(p)) * 0.6 + 0.4 * hash21(floor(p * 1.7) + 11.0));
    p *= 2.03;
    amp *= 0.5;
  }
  return 0.55 + 0.75 * n;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  vec3 dirWorld = normalize(u_camBasis * vec3(uv * u_fov, -1.0));

  // Integrate directly in the disk's frame. Rotating the ray once here rather
  // than rotating two points per step removes two mat3 multiplies from the
  // innermost loop, and the disk is then simply the plane y = 0.
  float ct = cos(u_diskTilt), st = sin(u_diskTilt);
  mat3 toDisk = mat3(1.0, 0.0, 0.0, 0.0, ct, -st, 0.0, st, ct);
  vec3 dir = toDisk * dirWorld;
  vec3 pos = toDisk * u_camPos;
  vec3 camDisk = pos;

  // Conserved specific angular momentum of this photon.
  vec3 hvec = cross(pos, dir);
  float h2 = dot(hvec, hvec);

  // Impact parameter. Rays passing far from the hole barely bend, so they do
  // not need anything like the full step budget. The critical value is
  // 3*sqrt(3)*M = 2.598; everything past about five times that is nearly
  // straight. This is where most of the screen is, and skipping it is the
  // difference between 0.5 fps and a usable frame.
  float b = sqrt(h2);
  int budget = int(mix(float(u_steps), 22.0, smoothstep(4.0, 15.0, b)));

  vec3 colour = vec3(0.0);
  float transmit = 1.0;
  bool captured = false;

  for (int i = 0; i < 320; i++) {
    if (i >= budget) break;

    float r2 = dot(pos, pos);
    float r = sqrt(r2);

    if (r < 1.0) { captured = true; break; }
    // Escaped and heading away: the remaining path is a straight line.
    if (r > 42.0 && dot(pos, dir) > 0.0) break;

    // Step scales with distance: fine near the photon sphere where paths bend
    // hardest, coarse far away where they are almost straight.
    // Named ds rather than step because step() is a GLSL builtin, and midVel
    // rather than half because half is a reserved word.
    float ds = clamp(0.055 * r, 0.012, 0.85);

    vec3 prev = pos;

    // Velocity Verlet on the geodesic. Cheaper than RK4 and stable here
    // because the acceleration depends only on position.
    //
    // 1/r^5 via inversesqrt is a hardware instruction; pow(dot(p,p), 2.5) is
    // not, and calling it twice per step cost about 1.8 seconds a frame.
    vec3 acc = -1.5 * h2 * pos * (inversesqrt(r2) / (r2 * r2));
    vec3 midVel = dir + acc * (ds * 0.5);
    pos += midVel * ds;
    float q2 = dot(pos, pos);
    vec3 acc2 = -1.5 * h2 * pos * (inversesqrt(q2) / (q2 * q2));
    dir = normalize(midVel + acc2 * (ds * 0.5));

    // Disk crossing. Already in the disk frame, so this is just a sign change
    // in y.
    if (prev.y * pos.y < 0.0 && transmit > 0.002) {
      float k = prev.y / (prev.y - pos.y);
      vec3 hit = mix(prev, pos, k);
      float hr = length(hit);

      if (hr > u_diskInner && hr < u_diskOuter) {
        // Temperature profile of a thin accretion disk.
        float tNorm = pow(u_diskInner / hr, 0.75);

        // Keplerian orbit, units where M = 0.5.
        float v = sqrt(0.5 / hr);
        vec3 orbit = normalize(cross(vec3(0.0, 1.0, 0.0), hit));
        vec3 toCam = normalize(camDisk - hit);

        // Relativistic Doppler factor. This is what makes one side of the
        // disk visibly brighter, which is the detail people recognise.
        float gamma = 1.0 / sqrt(max(1.0 - v * v, 1e-4));
        float mu = dot(orbit, toCam);
        float doppler = 1.0 / (gamma * max(1.0 - v * mu, 1e-3));

        // Gravitational redshift climbing out of the well.
        float grav = sqrt(max(1.0 - 1.0 / hr, 0.02));

        float shift = doppler * grav;
        // Specific intensity beams as the fourth power of the shift.
        float beam = pow(clamp(shift, 0.05, 4.0), 4.0);

        float tex = diskTexture(hit.xz, hr);
        // Soft edges so the disk does not end in a hard ring.
        float edge = smoothstep(u_diskInner, u_diskInner * 1.28, hr)
                   * smoothstep(u_diskOuter, u_diskOuter * 0.62, hr);

        vec3 emit = blackbody(clamp(tNorm * shift * 0.92, 0.0, 1.0));
        float density = edge * tex;
        colour += transmit * emit * beam * density * 0.55;
        transmit *= clamp(1.0 - density * 0.62, 0.0, 1.0);
      }
    }
  }

  if (!captured) {
    // Rotate the escaped direction back to world space for the star lookup.
    colour += starField(transpose(toDisk) * dir) * transmit;
  }

  // The photon ring: light that orbited near r = 1.5 and escaped, producing a
  // thin bright circle at the critical impact parameter. It emerges from the
  // integration, this only lifts it slightly so it survives tone mapping.
  float ring = exp(-pow((b - 2.598) * 9.0, 2.0));
  colour += vec3(1.0, 0.86, 0.62) * ring * 0.28 * (captured ? 1.0 : 0.55);

  // Tone map and fade in.
  colour *= u_intensity;
  colour = colour / (1.0 + colour * 0.72);
  colour = pow(max(colour, 0.0), vec3(0.4545));

  // Faint grain to break up banding in the large dark areas. Applied after
  // gamma, so it stays subtle instead of being lifted with everything else.
  colour += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.010;

  outColor = vec4(max(colour, 0.0), 1.0);
}`;

export const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Integration steps per quality tier, for rays near the critical impact
 * parameter. Rays further out get scaled down to as few as 22 inside the
 * shader, which is where most of the screen is.
 *
 * This is the single dominant cost in the scene: measure before changing it.
 * tools/perf.mjs reports frame time per phase.
 */
export const BH_STEPS = { low: 56, mid: 110, high: 190 };
