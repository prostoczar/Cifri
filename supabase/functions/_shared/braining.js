// The brain-age scale, shared by the server and the app.
//
// Only this much of Braining needed to move. The rest of src/store/braining.js — the Sharper
// Every Day tiers, the time formatting, the history readers — is about a player's own progress
// and stays where it is.
//
// This part moved because brain age is a RECORDED COMPETITIVE VALUE. The server writes it into
// verified_daily_results, so the server has to compute it, and a scale that existed in two
// copies would eventually award two different ages for the same time.

export const BR_SCALE = [
  { maxSec: 180, age: 20, label: 'Under 3 min', color: '#3d7020' },
  { maxSec: 210, age: 22, label: '3 – 3m 30s', color: '#4a8a28' },
  { maxSec: 240, age: 25, label: '3m 30s – 4 min', color: '#5a9e35' },
  { maxSec: 270, age: 28, label: '4 – 4m 30s', color: '#0f9d6c' },
  { maxSec: 300, age: 32, label: '4m 30s – 5 min', color: '#9bc878' },
  { maxSec: 330, age: 36, label: '5 – 5m 30s', color: '#b8c060' },
  { maxSec: 360, age: 40, label: '5m 30s – 6 min', color: '#c8a840' },
  { maxSec: 420, age: 46, label: '6 – 7 min', color: '#c07a30' },
  { maxSec: 480, age: 53, label: '7 – 8 min', color: '#d05a20' },
  { maxSec: 540, age: 62, label: '8 – 9 min', color: '#c0654a' },
  { maxSec: 600, age: 72, label: '9 – 10 min', color: '#a03828' },
  { maxSec: 99999, age: 80, label: 'Over 10 min', color: '#8a3a25' },
];

export function brAge(sec) {
  for (let i = 0; i < BR_SCALE.length; i++) {
    if (sec <= BR_SCALE[i].maxSec) return BR_SCALE[i].age;
  }
  return 80;
}
