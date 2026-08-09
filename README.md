# ubhayaab.github.io

The landing page. No framework, no build step, no bundler, one dependency-free
runtime. Everything it displays is measured rather than asserted.

**Live: [ubhayaab.github.io](https://ubhayaab.github.io)**

## The flight

Scrolling the page flies a Falcon 9 from the pad to orbit and then on to a
black hole. It is not a keyframe track. The altitude, velocity, mass and
dynamic pressure in the telemetry readout come out of integrating the
equations of motion, and the scroll bar is scrubbing that simulation.

| Phase | Section | What happens |
|---|---|---|
| PAD | hero | Booster standing, upper stage and fairing mate onto it |
| IGNITION | the machine | Nine Merlins light, plume builds |
| ASCENT | the machine | Gravity turn, max Q, atmosphere thins, stars sharpen |
| MECO / SEP | work | Engines cut at T+156 s, booster separates and flips for boostback |
| ORBIT | rhythm | Second stage burns to insertion, Earth curve below |
| WARP | arcade | Star streaks |
| GARGANTUA | receipts, contact | Orbit around a black hole |

**The ascent is simulated.** `js/flight/physics.js` integrates a 2D gravity
turn with RK4 using real Block 5 numbers: 7,607 kN at sea level, 282 s Isp,
411 t of propellant, an exponential atmosphere and drag. Guidance throttles
through max Q and limits dynamic pressure, and the second stage flies a
simplified linear-tangent law rather than a gravity turn, because following
the velocity vector up there just throws the vehicle higher and it never
reaches orbit.

`node tools/validate-physics.mjs` checks the result against published flight
milestones and currently passes 9/9:

| | simulated | real Falcon 9 |
|---|---|---|
| MECO | T+156 s, 67.3 km, 2,463 m/s | T+152 s, ~67 km, ~2,300 m/s |
| max Q | T+56 s, 25.5 kPa | ~T+72 s, ~33 kPa |
| SECO | T+530 s, 7,780 m/s | ~T+525 s, ~7,700 m/s |
| stage 1 delta-v | 4,033 m/s | ~4,000 m/s |

`--sweep` searches the pitch kick angle against the real MECO state rather
than letting anybody pick a number that looks about right.

**The black hole is a real Schwarzschild raymarch.** Photon paths are
integrated per pixel from the Cartesian form of the Binet equation,

```
d2r/dlambda2 = -3 M h^2 r / |r|^5,     h = |r x dr/dlambda|
```

in units where the horizon sits at r = 1. The lensing is therefore not drawn:
the far side of the accretion disk bends up over the top of the hole and down
under the bottom because that is where those photons actually go, and the
photon ring appears at the critical impact parameter b = 3*sqrt(3)*M because
light that grazed r = 1.5 looped and escaped. The disk carries a
`T ~ r^(-3/4)` temperature profile, relativistic Doppler beaming from its
Keplerian orbit, and gravitational redshift, which is why one side is visibly
brighter and bluer than the other.

Integration steps per pixel are set by the quality tier: 90 / 170 / 280.

## What is in here

| Path | What |
|---|---|
| `index.html` | The whole page. Real `<h1>` text is the LCP element, so nothing WebGL sits on the critical path. |
| `js/flight/physics.js` | The ascent integrator and orbital mechanics. No rendering. |
| `js/flight/blackhole.js` | The Schwarzschild geodesic raymarcher. |
| `js/flight/gfx.js` | mat4/vec3, procedural mesh builders, GL helpers. About 9 KB, in place of three.js. |
| `js/flight/rocket.js` | Falcon 9 geometry at real proportions, split into parts that separate. |
| `js/flight/scene.js` | The renderer: sky, warp, hole, earth, solids, plume. |
| `js/flight/director.js` | Scroll to phase, camera, telemetry. |
| `tools/flight-test.html` | Scrubbable harness for the whole flight. `?p=0.42` pins a phase. |
| `tools/bh-test.html` | The black hole in isolation. `?dist=24&tilt=0.2`. |
| `js/boot.js` | Single `requestAnimationFrame` loop driving the shader, the quality probe and whichever game is open. There is never a second ticker. |
| `js/arcade.js` | Game registry and lazy loader. Games are dynamically imported on first play. |
| `js/games/*.js` | Five games, one file each. |
| `js/terminal.js` | Press <kbd>`</kbd> anywhere. Real command parser over the same data the page renders. |
| `js/audio.js` | Procedural Web Audio. Zero audio files, off by default. |
| `build.mjs` | Pulls generated data out of the profile repo into `data/site-data.js`. |
| `tools/test-games.mjs` | Launches every game in a real browser, plays keystrokes, fails on any console error. |

## The games

Each one is a real problem from the work, shrunk to ninety seconds.

- **QUANT** is a per-tensor quantisation knapsack under a hard 8 GB budget. The
  tensor shapes are a real 8B Llama-class model and the bits-per-weight column is
  the llama.cpp quantisation table. Par is the shipped `Q4_K_M` recipe, which
  quietly upcasts `attn_v` and `ffn_down` to `Q6_K` because those two tensors are
  24% of the parameters and most of the damage.
- **TOKENIZE** asks you to place token boundaries. Ground truth is the
  pre-tokenizer regex that GPT-2, GPT-4 and Llama-3 all run before BPE, so every
  boundary is guaranteed real without shipping a merges table. The lesson is that
  the leading space belongs to the following word.
- **PAGEFAULT** is paged-attention bin packing. Deliberately not Tetris: rows
  never clear, and you lose to fragmentation rather than height.
- **BANDIT** is the ad-spend explore/exploit problem, scored against greedy and
  against real Thompson sampling on the identical seed.
- **SCRAPER** is rate-limit control against a hidden token bucket where latency
  is the only early warning.

## Running it

```bash
node build.mjs      # regenerate data/site-data.js from the profile repo
node serve.mjs      # http://127.0.0.1:4199
npm i -D playwright && npx playwright install chromium
npm test            # drive every game in a real browser
```

## Deliberate constraints

- **No CDN, no import map, no runtime dependency.** An unversioned CDN specifier
  can break a live page with no deploy. There is nothing here to break.
- **Scroll reveals are opt-in via a `.js` class** set by an inline script. If
  scripting fails, the page is a plain readable document rather than six screens
  of invisible text.
- **Three-state motion control**, defaulted from `prefers-reduced-motion`, and
  reachable from the second tab stop.
- **The system cursor is never hidden.** Windows does not scale CSS cursors with
  the OS pointer-size setting, so replacing it removes the pointer for anyone who
  enlarged it.
- **`100svh`, never `dvh`.** On mobile Safari `dvh` fires a resize storm against
  a WebGL canvas every time the URL bar moves.
- **<kbd>Ctrl</kbd>+<kbd>P</kbd> prints a one-page CV.** A print stylesheet
  collapses the whole page to typography, drops the canvas and the arcade, and
  expands link targets.
