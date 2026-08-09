// Procedural Web Audio. Zero audio files, about 1 KB of code.
//
// Off by default and it stays off until an explicit click, because a page that
// makes noise on load is a page people close. The AudioContext is not even
// constructed until then, so there is no autoplay warning in the console.

let ctx = null;
let master = null;
let on = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  return ctx;
}

/**
 * @param {number} freq
 * @param {number} dur seconds
 * @param {'sine'|'square'|'triangle'|'sawtooth'} type
 * @param {number} vol
 */
function tone(freq, dur = 0.08, type = 'sine', vol = 0.22) {
  if (!on || !ensure()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2600;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  // Exponential ramps only. A linear gain change to zero clicks audibly, and
  // on a hover sound that click is all anyone hears.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filt); filt.connect(g); g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const audio = {
  get enabled() { return on; },
  toggle() {
    on = !on;
    if (on) {
      ensure();
      if (ctx?.state === 'suspended') ctx.resume();
      master?.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.25);
      this.chime();
    } else if (master && ctx) {
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    }
    return on;
  },
  blip() { tone(880, 0.05, 'triangle', 0.16); },
  tick() { tone(1480, 0.022, 'square', 0.07); },
  good() { tone(660, 0.09, 'sine', 0.2); setTimeout(() => tone(990, 0.11, 'sine', 0.18), 55); },
  bad() { tone(150, 0.19, 'sawtooth', 0.16); },
  chime() {
    [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'sine', 0.14), i * 70));
  },
};
