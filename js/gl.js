// Hand-rolled raw WebGL2. No three.js, no ogl, no shader library.
//
// The whole scene is one fullscreen triangle and one fragment shader, so
// importing 600 KB of scene graph to draw a quad would be the opposite of the
// point. Total cost here is about 6 KB.
//
// The signature detail: the palette phase is modulated by the real commit-hour
// histogram, so the colour rhythm across the screen is literally his working
// day. It is subtle on purpose. You are not supposed to notice it, you are
// supposed to find it in the source.

const VERT = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID. No buffers, no attributes.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision PRECISION float;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;
uniform float u_scroll;
uniform float u_amp;
uniform float u_hours[24];

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), u.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Inigo Quilez cosine palette, tuned to the site tokens: near-black ground,
// ember accent, one cool blue in the shoulder.
vec3 palette(float t) {
  vec3 a = vec3(0.06, 0.06, 0.09);
  vec3 b = vec3(0.34, 0.22, 0.20);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.00, 0.16, 0.42);
  return a + b * cos(6.28318 * (c * t + d));
}

// Smooth read of the 24-bucket commit histogram across the x axis.
float hourAt(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  float t = fract(f);
  float lo = u_hours[i];
  float hi = u_hours[min(i + 1, 23)];
  return mix(lo, hi, t * t * (3.0 - 2.0 * t));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

  float t = u_time * 0.035;

  // Domain warp: fbm of fbm. Two levels is where it stops looking like noise
  // and starts looking like weather.
  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 + vec2(5.2, 1.3) - t));
  vec2 m = (u_mouse - 0.5) * 0.55 * u_amp;
  vec2 r = vec2(
    fbm(p * 1.9 + 3.4 * q + m + vec2(1.7, 9.2) + 0.22 * t),
    fbm(p * 1.9 + 3.4 * q + m + vec2(8.3, 2.8) - 0.19 * t));

  float f = fbm(p * 1.4 + 3.0 * r);

  // Here is the histogram. It shifts the palette phase along x, so the bands
  // of colour follow the hours he actually commits in.
  float day = hourAt(uv.x);
  vec3 col = palette(f * 0.9 + day * 0.16 + u_scroll * 0.10 + 0.06);

  // Lift where the warp is strongest, which reads as light coming through.
  col += vec3(0.36, 0.15, 0.03) * pow(clamp(dot(r, r), 0.0, 1.0), 1.35) * (0.55 + 0.85 * day);
  col = mix(col, vec3(0.02, 0.03, 0.05), 0.42);

  // Vignette and grain, three instructions rather than a post pass.
  float vig = smoothstep(1.30, 0.24, length(uv - 0.5) * 1.45);
  col *= 0.32 + 0.68 * vig;
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.028;

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
  }
  return s;
}

/**
 * @returns {null | {draw(t:number):void, resize():void, setTier(t:string):void, stats():object}}
 */
export function initGL(canvas, { hours = [], tier = 'high' } = {}) {
  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
  } catch { gl = null; }
  // No WebGL2, or the GPU is blacklisted. The CSS poster gradient on #gl stays
  // visible and the page is unaffected.
  if (!gl) return null;

  const mobile = matchMedia('(pointer: coarse)').matches;
  let quality = tier;

  const build = (q) => {
    const src = FRAG
      .replace('PRECISION', mobile ? 'mediump' : 'highp')
      .replace('OCTAVES', q === 'low' ? '3' : q === 'mid' ? '4' : '5');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, src));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
    }
    return prog;
  };

  let prog;
  try { prog = build(quality); } catch { return null; }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  let U = {};
  const locate = () => {
    U = {
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      mouse: gl.getUniformLocation(prog, 'u_mouse'),
      scroll: gl.getUniformLocation(prog, 'u_scroll'),
      amp: gl.getUniformLocation(prog, 'u_amp'),
      hours: gl.getUniformLocation(prog, 'u_hours'),
    };
  };
  locate();

  // Normalised histogram, padded to 24 so the uniform array is always full.
  const hist = new Float32Array(24);
  const peak = Math.max(1, ...hours);
  for (let i = 0; i < 24; i += 1) hist[i] = (hours[i] || 0) / peak;

  // Fill-rate governor. Backing store shrinks under budget; the CSS size stays
  // 100% so nothing reflows.
  const budget = () => (mobile ? 1_000_000 : 2_200_000);
  const state = { mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5, scroll: 0, amp: 1, w: 0, h: 0, dpr: 1 };

  function resize() {
    const cap = mobile ? 1.5 : 2;
    let dpr = Math.min(devicePixelRatio || 1, cap);
    if (quality === 'low') dpr = 1;
    const cssW = canvas.clientWidth || innerWidth;
    const cssH = canvas.clientHeight || innerHeight;
    let w = Math.round(cssW * dpr);
    let h = Math.round(cssH * dpr);
    const px = w * h;
    if (px > budget()) {
      const k = Math.sqrt(budget() / px);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    if (w === state.w && h === state.h) return;
    canvas.width = w; canvas.height = h;
    state.w = w; state.h = h; state.dpr = dpr;
    gl.viewport(0, 0, w, h);
  }
  resize();

  addEventListener('pointermove', (e) => {
    state.tx = e.clientX / innerWidth;
    state.ty = 1 - e.clientY / innerHeight;
  }, { passive: true });

  return {
    resize,
    setTier(t) {
      if (t === quality) return;
      quality = t;
      try {
        const next = build(quality);
        gl.deleteProgram(prog);
        prog = next;
        locate();
        state.w = 0;
        resize();
      } catch { /* keep the old program */ }
    },
    setAmp(v) { state.amp = v; },
    setScroll(v) { state.scroll = v; },
    draw(timeMs) {
      // Pointer is lerped on the CPU so the shader gets a smooth value without
      // any easing maths in the fragment stage.
      state.mx += (state.tx - state.mx) * 0.07;
      state.my += (state.ty - state.my) * 0.07;

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(U.res, state.w, state.h);
      gl.uniform1f(U.time, timeMs * 0.001);
      gl.uniform2f(U.mouse, state.mx, state.my);
      gl.uniform1f(U.scroll, state.scroll);
      gl.uniform1f(U.amp, state.amp);
      gl.uniform1fv(U.hours, hist);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    stats() {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        backing: `${state.w}x${state.h}`,
        pixels: state.w * state.h,
        quality,
      };
    },
  };
}
