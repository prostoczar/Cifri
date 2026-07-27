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
