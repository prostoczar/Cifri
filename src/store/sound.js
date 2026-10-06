// Sound engine — ported verbatim from the reference prototype. Single shared AudioContext,
// created once and unlocked on the first tap anywhere (the standard fix for sound not
// reliably playing on iPhones before a user gesture).
let _actx = null;

function getAudioCtx() {
  if (!_actx) {
    try {
      _actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  if (_actx.state === 'suspended') {
    try {
      _actx.resume();
    } catch (e) {
      /* ignore */
    }
  }
  return _actx;
}

let audioUnlockAttached = false;
export function attachAudioUnlock() {
  if (audioUnlockAttached) return;
  audioUnlockAttached = true;
  function unlockAudioOnce() {
    getAudioCtx();
    document.removeEventListener('pointerdown', unlockAudioOnce);
  }
  document.addEventListener('pointerdown', unlockAudioOnce, { once: true });
}

export function tick(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.value = 900;
    g.gain.setValueAtTime(0.1, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
    o.start();
    o.stop(ac.currentTime + 0.1);
  } catch (e) {
    /* ignore */
  }
}

export function buzz(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.value = 200;
    g.gain.setValueAtTime(0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    o.start();
    o.stop(ac.currentTime + 0.18);
  } catch (e) {
    /* ignore */
  }
}

export function clickSound(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const dur = 0.02;
    const bufSize = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2200;
    filt.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(ac.destination);
    src.start();
    src.stop(ac.currentTime + dur);
  } catch (e) {
    /* ignore */
  }
}

export function urgentTick(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.type = 'square';
    o.frequency.value = 1000;
    g.gain.setValueAtTime(0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
    o.start();
    o.stop(ac.currentTime + 0.09);
  } catch (e) {
    /* ignore */
  }
}

export function cdTone(soundOn, n) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    if (n === 'go') {
      o.type = 'square';
      o.frequency.setValueAtTime(880, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.15);
      g.gain.setValueAtTime(0.12, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
      o.start();
      o.stop(ac.currentTime + 0.22);
    } else {
      o.type = 'sine';
      o.frequency.value = 620;
      g.gain.setValueAtTime(0.09, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
      o.start();
      o.stop(ac.currentTime + 0.09);
    }
  } catch (e) {
    /* ignore */
  }
}

// General click sound — fires on tap of any tappable button/card/chip/toggle app-wide.
let clickListenerAttached = false;
export function attachGlobalClickSound(getSoundOn) {
  if (clickListenerAttached) return;
  clickListenerAttached = true;
  document.addEventListener(
    'click',
    function (e) {
      const el =
        e.target && e.target.closest
          ? e.target.closest(
              'button, [data-click-sound], .tog, .chip, .dc, .sc, .mb, .nb, .br-rtgl, .br-ctab, .scbtn, .totd-card'
            )
          : null;
      if (el) clickSound(getSoundOn());
    },
    true
  );
}

// ── Finish screen sounds ──────────────────────────────────────────────────────────────────────
//
// The sound half of docs/finish-animation-spec.md ("Sound, haptics, and web vs phone"). Same
// engine and the same rules as everything above: the one shared AudioContext — so the iPhone
// silent switch treats them exactly as it treats the game's own ticks — the `soundOn` setting
// checked first, and nothing allowed to throw into the game.
//
// "No louder than the existing tick": tick peaks at a gain of 0.1. Every sound here peaks at or
// below that, and the chords split it between their notes rather than adding up past it.
//
// WHEN each plays is FinishScreen's business, not this file's: it schedules them on the same
// timers as the steps they belong to, which is what lets a skip cancel the ones not yet played.

// One enveloped oscillator note. Private: the sounds above are each written out in full, but
// these nine are built from a handful of the same shapes, and repeating the boilerplate nine
// times would hide what actually differs between them.
function note(ac, { type = 'sine', freq, freqTo, at = 0, dur, gain }) {
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.connect(g);
  g.connect(ac.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  // A 5 ms attack rather than starting at full gain, which clicks on most phone speakers.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.start(t0);
  o.stop(t0 + dur);
  return o;
}

// Filtered noise with a moving filter — the "air" in a whoosh. `swell` puts the peak in the
// middle rather than at the start, for something that rises rather than strikes.
function sweep(ac, { dur, filter, from, to, gain, swell = false }) {
  const t0 = ac.currentTime;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + (swell ? dur * 0.6 : 0.03));
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

/** The finish line: two quick rising tones, about 80 ms each. */
export function finishBell(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 660, dur: 0.08, gain: 0.09 });
    note(ac, { freq: 880, at: 0.08, dur: 0.09, gain: 0.09 });
  } catch {
    /* ignore */
  }
}

/** The phrase popping in: a short soft blip. */
export function phrasePop(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 520, freqTo: 780, dur: 0.07, gain: 0.06 });
  } catch {
    /* ignore */
  }
}

/**
 * The ring filling: up to ten ticks, rising in pitch with the fill, the last one landing as the
 * count does. `fill` is 0..1 (how much of the ring this run fills); `durMs` is the fill's length.
 *
 * Scheduled on the audio clock rather than ten timers, so the ticks stay evenly placed even on a
 * busy frame. Placed where the score's own ease-out-cubic count crosses each tenth, so they come
 * quickly at first and spread out as the number slows, like a gauge settling. Returns a function that silences
 * any tick not yet played — what a skip calls.
 */
export function fillTicks(soundOn, fill, durMs) {
  if (!soundOn) return () => {};
  const ac = getAudioCtx();
  if (!ac) return () => {};
  const voices = [];
  try {
    const n = Math.max(1, Math.min(10, Math.round(10 * Math.max(0, Math.min(1, fill)))));
    for (let i = 1; i <= n; i++) {
      // Inverse of 1 - (1 - p)^3: the moment the count reaches i/n of its final value.
      const p = 1 - Math.cbrt(1 - i / n);
      voices.push(note(ac, { freq: 500 + 500 * fill * (i / n), at: (p * durMs) / 1000, dur: 0.05, gain: 0.05 }));
    }
  } catch {
    /* ignore */
  }
  return () => {
    for (const o of voices) {
      try { o.stop(); } catch { /* already finished */ }
    }
  };
}

/** The ring landing: a low, soft "tock". */
export function ringLand(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 190, freqTo: 120, dur: 0.12, gain: 0.1 });
  } catch {
    /* ignore */
  }
}

/** The flame catching: a short airy whoosh rising in pitch, about 300 ms. */
export function ignite(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    sweep(ac, { dur: 0.3, filter: 'bandpass', from: 400, to: 2600, gain: 0.06, swell: true });
  } catch {
    /* ignore */
  }
}

/** A new best: a fast rising four-note arpeggio — the biggest sound in the sequence. */
export function bestShimmer(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    // G major, climbing an octave. Each note is quiet enough that the overlap stays under 0.1.
    [784, 988, 1175, 1568].forEach((freq, i) => {
      note(ac, { type: 'triangle', freq, at: i * 0.07, dur: 0.22, gain: 0.06 });
    });
  } catch {
    /* ignore */
  }
}

/** The flame lit: a two-note chord after a first game, three brighter notes when both are done. */
export function flameLit(soundOn, bothDone) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    const chord = bothDone ? [659, 784, 1047] : [523, 784];
    const each = 0.09 / chord.length;
    chord.forEach((freq) => note(ac, { freq, dur: 0.35, gain: each }));
  } catch {
    /* ignore */
  }
}

/** The yellow flood: a soft rising swell, about 500 ms. */
export function floodSwell(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    sweep(ac, { dur: 0.5, filter: 'lowpass', from: 300, to: 1800, gain: 0.05, swell: true });
  } catch {
    /* ignore */
  }
}

/** Continue, into results: a soft low swoosh, about 250 ms. */
export function toResults(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    sweep(ac, { dur: 0.25, filter: 'lowpass', from: 900, to: 250, gain: 0.05 });
  } catch {
    /* ignore */
  }
}

// ── Launch and celebration sounds ─────────────────────────────────────────────────────────────
//
// docs/launch-celebrations-spec.md. The same engine, the same `soundOn` gate and the same ceiling
// as the Finish screen's sounds above: nothing peaks above the tick's 0.1, and chords split that
// between their notes. WHEN each plays belongs to the screen that schedules it.

/**
 * The logo's dot lighting at the end of the launch animation: a short bright chime over a soft
 * whoosh. Usually silent on the web — a browser keeps sound locked until the first tap.
 */
export function launchSpark(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    sweep(ac, { dur: 0.32, filter: 'bandpass', from: 700, to: 3200, gain: 0.04, swell: true });
    note(ac, { type: 'triangle', freq: 1319, at: 0.02, dur: 0.22, gain: 0.05 });
    note(ac, { type: 'sine', freq: 1976, at: 0.07, dur: 0.26, gain: 0.04 });
  } catch {
    /* ignore */
  }
}

/** "New achievement!" popping in: a short two-note chime. */
export function ceremonyChime(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { type: 'triangle', freq: 880, dur: 0.12, gain: 0.06 });
    note(ac, { type: 'triangle', freq: 1175, at: 0.09, dur: 0.16, gain: 0.06 });
  } catch {
    /* ignore */
  }
}

/**
 * The fanfare at an achievement's stamp (and a streak ceremony's tier moment), growing with the
 * tier: a short rising chime; a longer one; plus a whoosh; plus a low boom and an octave-up chord;
 * plus a deep sub-boom and a sparkling run on top. The layers are kept quiet enough that even the
 * legendary pile-up stays around the tick's loudness rather than above it.
 */
export function achievementFanfare(soundOn, tier) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  const rank = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(tier);
  try {
    const run = rank === 0 ? [784, 1047] : [659, 784, 988, 1319];
    const g = rank >= 3 ? 0.035 : 0.05;
    run.forEach((freq, i) => note(ac, { type: 'triangle', freq, at: i * 0.07, dur: 0.24, gain: g }));
    if (rank >= 2) sweep(ac, { dur: 0.4, filter: 'bandpass', from: 500, to: 3000, gain: 0.035, swell: true });
    if (rank >= 3) {
      note(ac, { freq: 130, freqTo: 55, dur: 0.45, gain: 0.05 });
      [1319, 1568, 1976].forEach((freq) => note(ac, { freq, at: 0.3, dur: 0.5, gain: 0.02 }));
    }
    if (rank >= 4) {
      note(ac, { freq: 62, freqTo: 38, dur: 0.7, gain: 0.05 });
      [1568, 1760, 1976, 2349, 2637, 3136].forEach((freq, i) => {
        note(ac, { type: 'triangle', freq, at: 0.45 + i * 0.045, dur: 0.14, gain: 0.02 });
      });
    }
  } catch {
    /* ignore */
  }
}

/** A reward landing in its place: a soft high ping. */
export function rewardPing(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 2093, dur: 0.18, gain: 0.045 });
  } catch {
    /* ignore */
  }
}

/**
 * One dot of a streak ceremony's ring filling: a soft note, `i` of 16, rising one octave from the
 * first dot to the last.
 */
export function dotNote(soundOn, i) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 523 * Math.pow(2, i / 15), dur: 0.09, gain: 0.04 });
  } catch {
    /* ignore */
  }
}

/** A streak cooling into embers: a short, sad, descending tune. */
export function streakCool(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    [659, 587, 523, 392].forEach((freq, i) => note(ac, { freq, at: i * 0.22, dur: i === 3 ? 0.6 : 0.26, gain: 0.05 }));
  } catch {
    /* ignore */
  }
}

/** A streak relit by a restore: a whoosh, a rising four-note chime, and a low warm note under it. */
export function streakRelight(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    sweep(ac, { dur: 0.35, filter: 'bandpass', from: 400, to: 2800, gain: 0.04, swell: true });
    [523, 659, 784, 1047].forEach((freq, i) => note(ac, { type: 'triangle', freq, at: 0.12 + i * 0.08, dur: 0.24, gain: 0.04 }));
    note(ac, { freq: 196, at: 0.12, dur: 0.6, gain: 0.04 });
  } catch {
    /* ignore */
  }
}

/** Starting a streak afresh: a soft two-note tone. */
export function freshTone(soundOn) {
  if (!soundOn) return;
  const ac = getAudioCtx();
  if (!ac) return;
  try {
    note(ac, { freq: 440, dur: 0.22, gain: 0.05 });
    note(ac, { freq: 587, at: 0.18, dur: 0.32, gain: 0.05 });
  } catch {
    /* ignore */
  }
}
