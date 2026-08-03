// A seedable random number generator, so a question set can be described by one number.
//
// WHY THIS EXISTS AT ALL
//
// The server has to know what it asked, and the client has to draw exactly that. The obvious
// way — server generates the questions and ships the text — turns out to be the wrong one,
// because the text is not the same on every device: `fn()` formats decimals with the device's
// own locale, so a question that reads "12.5 + 3" here reads "12,5 + 3" on a Russian phone.
// Generating it server-side would settle that argument on the server's behalf and quietly
// change what some players see.
//
// So the server sends a SEED instead. Both sides run the identical generator over the identical
// random sequence and arrive at the identical questions — the server keeping the answers, the
// client rendering the text in its own locale. Nothing about display moves, and the payload is
// one number rather than eighty questions, which is most of why the prefetch feels instant.
//
// The generator must therefore be completely deterministic given the seed: every Math.random()
// in the ported code is replaced by a call to the function this file returns. A single stray
// Math.random() would desynchronise the two sides silently, which is what check:parity exists
// to catch.

// mulberry32. Chosen for being short enough to read in one sitting and to reimplement identically
// anywhere — not for cryptographic strength, which is not what it is for. The seed itself is
// generated with real randomness on the server; this only has to spread one seed into a sequence
// that looks nothing like the next seed's.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A seed with genuine entropy behind it, for the server to mint.
//
// Deliberately NOT derived from the time, the user id, or the day. Any of those would make one
// player's seed guessable from another's, and a guessable seed is a question set that can be
// generated — and solved — before it is played.
export function randomSeed() {
  // Both Deno and modern browsers have this; there is no fallback on purpose, because a
  // non-random seed here would be a silent security failure rather than a loud one.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}
