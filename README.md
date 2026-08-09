# ubhayaab.github.io

The landing page. No framework, no build step, no bundler, one dependency-free
runtime. Everything it displays is measured rather than asserted.

**Live: [ubhayaab.github.io](https://ubhayaab.github.io)**

## The flight

Scrolling the page flies a Super Heavy and Starship from the pad to orbit and
on to a black hole. It is not a keyframe track. The altitude, velocity, mass and
dynamic pressure in the telemetry readout come out of integrating the
equations of motion, and the scroll bar is scrubbing that simulation.

| Phase | Section | What happens |
|---|---|---|
| PAD | hero | Booster standing, ship lowers onto it and mates |
| IGNITION | the machine | 33 Raptors light, plume builds and lights the hull |
| ASCENT | the machine | Gravity turn, max Q, atmosphere thins, stars sharpen |
| MECO / SEP | work | Engines cut at T+156 s, booster separates and flips for boostback |
| ORBIT | rhythm | Ship burns to insertion pitched near horizontal, Earth curve below |
| WARP | arcade | Star streaks winding up and blueshifting into a flare |
| GARGANTUA | receipts, contact | The ship arrives, decelerates and settles into orbit around a black hole |

**The ascent is simulated.** `js/flight/physics.js` integrates a 2D gravity
turn with RK4: 74.4 MN at sea level across 33 Raptors, 327 s Isp, 3,400 t of
propellant, an exponential atmosphere and drag. Guidance throttles through
max Q and limits dynamic pressure, and the ship flies a simplified
linear-tangent law rather than a gravity turn, because following the velocity
vector up there just throws the vehicle higher and it never reaches orbit.

Starship rather than Falcon 9 for one specific reason: **no fairing**. On a
Falcon the fairing jettisons and the second stage carries a payload you never
see, so a cargo bay opens and nothing comes out. The ship is the payload, so
the object that reaches orbit and flies on is a single coherent vehicle.

The booster also does not burn to depletion. It stages holding 620 t back for
boostback and landing, which is exactly why it hot stages at ~1,600 m/s where
a Falcon 9 is doing 2,300. Without that reserve the simulated booster
overperforms by nearly a kilometre a second and arrives at staging almost
twice as high as the real one.

`node tools/validate-physics.mjs` checks the result against published flight
milestones and currently passes 10/10:

| | simulated | real flight test |
|---|---|---|
| hot stage | T+160 s, 66.1 km, 1,602 m/s | T+~2:40, ~68 km, ~1,550 m/s |
| max Q | T+52 s, 32.6 kPa | ~T+55 s, ~32 kPa |
| SECO | T+467 s, 7,681 m/s | ~T+8:35, ~7,200 m/s |
| liftoff mass / TWR | 5,020 t, 1.51 | ~5,000 t, ~1.5 |

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

Integration steps per pixel are set by the quality tier (56 / 110 / 190) and then converged against measured frame time, with a hard floor of 70: below about 60 steps the rays that should fall through the horizon escape instead, the shadow fills with stars, and it stops being a black hole. Resolution gives way before correctness does.

## What is in here

| Path | What |
|---|---|
| `index.html` | The whole page. Real `<h1>` text is the LCP element, so nothing WebGL sits on the critical path. |
| `js/flight/physics.js` | The ascent integrator and orbital mechanics. No rendering. |
| `js/flight/blackhole.js` | The Schwarzschild geodesic raymarcher. |
| `js/flight/gfx.js` | mat4/vec3, procedural mesh builders, GL helpers. About 9 KB, in place of three.js. |
| `js/flight/rocket.js` | Super Heavy and Starship at real proportions: 121 m, 9 m core, 33 Raptors, 4 flaps, ogive nose. |
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
