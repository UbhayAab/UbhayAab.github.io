# ubhayaab.github.io

The landing page. No framework, no build step, no bundler, one dependency-free
runtime. Everything it displays is measured rather than asserted.

**Live: [ubhayaab.github.io](https://ubhayaab.github.io)**

## What is in here

| Path | What |
|---|---|
| `index.html` | The whole page. Real `<h1>` text is the LCP element, so the shader never sits on the critical path. |
| `js/gl.js` | Hand-rolled raw WebGL2. One fullscreen triangle, one domain-warped fbm shader, about 6 KB. No three.js. The palette phase is modulated by the real commit-hour histogram, so the colour rhythm across the screen is a working day. |
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
