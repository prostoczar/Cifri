// Tricks library — 47 tricks across 7 groups, each with its own question generator, plus the full
// Russian translation table. Originally extracted verbatim from the reference prototype (lines
// 2306-2689), copied programmatically rather than retyped.
//
// ── THE GENERATORS HAVE DELIBERATELY DIVERGED (v16 item 8, 22 August 2026) ───────────────────
//
// The explanations, steps, names and Russian translations are still the prototype's. The `gen()`
// ranges are not, and must not be reverted to it.
//
// The 14 August 2026 audit found that 14 of the 47 could not produce twenty distinct questions —
// Rule of 70 had 7, Multiply by 11 had 8, Cube a number had 8 — so both the 20-question Test and
// the 20-question practice run served the same handful over and over. The Test padded itself by
// repeating, silently. Measured again before the change: 14 tricks under 20, 20 under 60.
//
// Every generator was widened to the FULL range its own stated method covers, and no further.
// That last clause is the rule the ranges were chosen by, and the reason some stayed small:
//   * Multiply by 11 goes 10-99, not into three digits, because its explain says "for two-digit
//     numbers" and three-digit ×11 is a longer rule than the one that card teaches.
//   * The two squaring tricks take no negative numbers: (−35)² is 35² wearing a minus sign, the
//     same question with the same answer. Cube does take them — an odd power keeps the sign, so
//     (−4)³ = −64 falls straight out of the method as written.
//   * Rule of 70 takes no negative rates: a negative growth rate has no doubling time, so the
//     question would have no answer rather than a hard one.
//   * ×25 and ÷25 stay on multiples of 4 and 25, because an answer ending .25 or .75 is a
//     rounding question rather than the trick.
//
// FOUR REMAIN INHERENTLY NARROW, and widening cannot fix them — they are bounded by the method
// rather than by a chosen range:
//   Rule of 70 (22)            one division, 70 ÷ rate, and only rates dividing 70 cleanly are
//                              fair questions. Both directions of the relationship are now asked,
//                              which is what got it past 20 at all.
//   Squares ending in 5 (29)   there are only so many numbers ending in 5 worth squaring mentally.
//                              Extending past two digits also meant correcting the explain from
//                              "the leading digit" to "the part in front of the 5" — the method
//                              always worked for 105, but the wording did not describe it.
//   Fraction to decimal (31)   a recall card. Its pool is a LIST of fractions worth memorising,
//                              not a range; it was doubled from 14 by adding the halves, tenths,
//                              twelfths, sixteenths and twentieths from the same mental table.
//   Cube a number (33)         cubes stay mental only up to about 20, in either sign.
//
// scripts/check-trick-variety.mjs measures all of this on every `npm run check` and fails if any
// trick drops back below a distinct 20-question Test. It reports the narrow four every run so
// they stay a known fact rather than a rediscovery.
//
// The only other edits to the prototype's text are turning the `var` declarations into module
// exports and importing the rn/fn helpers the generators call.
import { rn, fn } from './questionEngine.js';
import { t as translate } from '../i18n_data.js';

// Note: the Subtraction "Same-change rule" generator declares an `add` variable it never reads.
// That is the reference's own dead code, kept so this file stays a verbatim copy.

// Ten of the generators below call t(key, params) — the reference's global translator, which
// read the active language off a module-level `settings`. Rather than edit those generator
// bodies (and risk changing the questions they produce), this shim reproduces that global:
// setTricksLang() is called before a trick is generated, and t() closes over it.
let currentLang = 'en';
export function setTricksLang(lang) {
  currentLang = lang || 'en';
}
function t(key, params) {
  return translate(currentLang, key, params);
}

export const TRICKS = [
  {group:'Addition',symbol:'+',items:[
    {name:'Break & add',
     explain:'Split one number into its tens and units, then add each part separately. This is the universal addition method — works for any two numbers.',
     steps:['54 + 37 = ?','54 + 30 = 84','84 + 7 = 91'],
     final:'91',
     gen:function(){var a=rn(20,80),b=rn(11,59);return{q:fn(a)+' + '+fn(b)+' = ?',ans:a+b};}},
    {name:'Left-to-right addition',
     explain:'Add the biggest parts first — hundreds, then tens, then units. You always have a rough answer early and just keep refining it.',
     steps:['346 + 278 = ?','300 + 200 = 500','40 + 70 = 110 → 610','6 + 8 = 14 → 624'],
     final:'624',
     gen:function(){var a=rn(100,499),b=rn(100,499);return{q:fn(a)+' + '+fn(b)+' = ?',ans:a+b};}},
    {name:'Round & adjust',
     explain:'Round one number up to the nearest 10, add it, then subtract the extra you added.',
     steps:['47 + 38 = ?','47 + 40 = 87','87 − 2 = 85'],
     final:'85',
     gen:function(){var a=rn(20,90),b=rn(2,9)*10+rn(6,9);return{q:fn(a)+' + '+fn(b)+' = ?',ans:a+b};}},
    {name:'Make 10 first',
     explain:'When two numbers add to 10, group them first — then add the rest. Much faster!',
     steps:['7 + 6 + 3 = ?','(7 + 3) + 6 = ?','10 + 6 = 16'],
     final:'16',
     gen:function(){var a=rn(1,9),b=10-a,c=rn(2,19),o=rn(1,3);var parts=o===1?[a,c,b]:o===2?[a,b,c]:[c,a,b];return{q:parts[0]+' + '+parts[1]+' + '+parts[2]+' = ?',ans:a+b+c};}},
    {name:'Doubles + adjust',
     explain:'When two numbers are close to each other, double the midpoint and adjust. Much faster than adding directly.',
     steps:['23 + 25 = ?','Numbers close → double 24','24 × 2 = 48'],
     final:'48',
     gen:function(){var base=rn(10,60),d=rn(1,4),a=base-d,b=base+d;return{q:fn(a)+' + '+fn(b)+' = ?',ans:a+b};}}
  ]},
  {group:'Subtraction',symbol:'−',items:[
    {name:'Break & subtract',
     explain:'Split the number being subtracted into its tens and units. Subtract each part separately. This is the universal subtraction method.',
     steps:['75 − 43 = ?','75 − 40 = 35','35 − 3 = 32'],
     final:'32',
     gen:function(){var t=rn(2,7)*10,u=rn(1,9),a=rn(t+u+10,99);return{q:fn(a)+' − '+fn(t+u)+' = ?',ans:a-t-u};}},
    {name:'Round & adjust',
     explain:'Round the number being subtracted up to the nearest 10, subtract it, then add back the extra.',
     steps:['83 − 29 = ?','83 − 30 = 53','53 + 1 = 54'],
     final:'54',
     gen:function(){var b=rn(2,8)*10+rn(6,9),a=b+rn(10,40);return{q:fn(a)+' − '+fn(b)+' = ?',ans:a-b};}},
    {name:'Count up',
     explain:'Instead of subtracting, count up from the smaller number to the larger. Great when the gap is small.',
     steps:['73 − 68 = ?','68 → 70 = +2','70 → 73 = +3','2 + 3 = 5'],
     final:'5',
     gen:function(){var b=rn(20,80),d=rn(2,9),a=b+d;return{q:fn(a)+' − '+fn(b)+' = ?',ans:d};}},
    {name:'Same-change rule',
     explain:'Add the same number to both sides to make one of them a round number. The difference stays exactly the same.',
     steps:['83 − 57 = ?','Add 3 to both sides','86 − 60 = 26'],
     final:'26',
     gen:function(){var b=rn(2,8)*10+rn(2,8),add=10-(b%10),a=b+rn(15,50);return{q:fn(a)+' − '+fn(b)+' = ?',ans:a-b};}},
    {name:'Complements',
     explain:'Find how far the smaller number is from the next round hundred. Subtract past the round hundred, then add the gap back.',
     steps:['537 − 289 = ?','289 → 300: gap = 11','537 − 300 = 237','237 + 11 = 248'],
     final:'248',
     gen:function(){var base=rn(2,8)*100,gap=rn(1,49),b=base-gap,extra=rn(10,120),a=base+extra;return{q:fn(a)+' − '+fn(b)+' = ?',ans:a-b};}}
  ]},
  {group:'Multiplication',symbol:'×',items:[
    {name:'Break & add (split multiplier)',
     explain:'Split one number into two parts, multiply each part separately, then add the results together. This is the universal multiplication method — works for any two numbers.',
     steps:['45 × 36 = ?','36 = 30 + 6','45 × 30 = 1350','45 × 6 = 270','1350 + 270 = 1620'],
     final:'1620',
     gen:function(){var a=rn(11,60),t=rn(1,9)*10,u=rn(1,9),b=t+u;return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};}},
    {name:'Break & subtract (near round number)',
     explain:'When one number is just below a round ten, multiply by the round number then subtract the small overshoot.',
     steps:['45 × 29 = ?','29 = 30 − 1','45 × 30 = 1350','1350 − 45 = 1305'],
     final:'1305',
     gen:function(){
       var a=rn(11,60);
       var roundTens=rn(2,9)*10;
       var gap=rn(1,4);
       var b=roundTens-gap;
       return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};
     }},
    {name:'Multiply by 5',
     explain:'Multiply by 10 (just add a zero), then halve the result. Because 5 = 10 ÷ 2.',
     steps:['36 × 5 = ?','36 × 10 = 360','360 ÷ 2 = 180'],
     final:'180',
     gen:function(){var a=rn(11,149)*(rn(1,5)===1?-1:1);return{q:fn(a)+' × 5 = ?',ans:a*5};}},
    {name:'Multiply by 9',
     explain:'Multiply by 10 then subtract the original number once. Because 9 = 10 − 1.',
     steps:['7 × 9 = ?','7 × 10 = 70','70 − 7 = 63'],
     final:'63',
     gen:function(){var a=rn(3,99)*(rn(1,6)===1?-1:1);return{q:fn(a)+' × 9 = ?',ans:a*9};}},
    {name:'Multiply by 11',
     explain:'For two-digit numbers: write the first digit, then the sum of both digits, then the last digit.',
     steps:['32 × 11 = ?','First digit: 3','Middle: 3 + 2 = 5','Last digit: 2','352'],
     final:'352',
     gen:function(){var a=rn(10,99);return{q:fn(a)+' × 11 = ?',ans:a*11};}},
    {name:'Multiply by 25',
     explain:'Multiply by 100, then divide by 4 (halve twice). Because 25 = 100 ÷ 4.',
     steps:['36 × 25 = ?','36 × 100 = 3600','3600 ÷ 4 = 900'],
     final:'900',
     gen:function(){var a=rn(2,100)*4*(rn(1,6)===1?-1:1);return{q:fn(a)+' × 25 = ?',ans:a*25};}},
    {name:'Multiply by 99',
     explain:'Multiply by 100, then subtract the original number once. Because 99 = 100 − 1.',
     steps:['7 × 99 = ?','7 × 100 = 700','700 − 7 = 693'],
     final:'693',
     gen:function(){var a=rn(3,99);return{q:fn(a)+' × 99 = ?',ans:a*99};}},
    {name:'Double & halve',
     explain:'Halve one number and double the other — the product never changes. Keep going until one number becomes easy.',
     steps:['16 × 25 = ?','8 × 50','4 × 100 = 400'],
     final:'400',
     gen:function(){var a=rn(2,20)*4,b=rn(2,20)*5;return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};}},
    {name:'Multiply using factors',
     explain:'Break one number into two smaller factors. Multiply by each factor one at a time — much easier than one big step.',
     steps:['43 × 28 = ?','28 = 7 × 4','43 × 7 = 301','301 × 4 = 1204'],
     final:'1204',
     gen:function(){
       var factorPairs=[[2,6],[2,8],[2,9],[3,4],[3,6],[3,7],[3,8],[4,6],[4,7],[4,8],[2,12],[3,9],[4,9]];
       var pair=factorPairs[rn(0,factorPairs.length-1)];
       var b=pair[0]*pair[1];
       var a=rn(11,60);
       return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};
     }},
    {name:'Scale & shift zeros',
     explain:'Strip zeros off both numbers, multiply the core digits, then add all the zeros back. Works at any scale.',
     steps:['50 × 160 = ?','Core: 5 × 16 = 80','Removed 2 zeros total','80 × 100 = 8000'],
     final:'8000',
     gen:function(){
       var scales=[10,100,1000];
       var sa=scales[rn(0,1)],sb=scales[rn(0,1)];
       var a=rn(2,9)*sa,b=rn(2,9)*sb;
       return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};
     }},
    {name:'Squares ending in 5',
     explain:'For any number ending in 5: multiply the part in front of the 5 by itself plus 1, then append 25.',
     steps:['35 × 35 = ?','Leading digit: 3','3 × (3+1) = 3 × 4 = 12','Append 25 → 1225'],
     final:'1225',
     gen:function(){var n=rn(1,29),a=n*10+5;return{q:fn(a)+' × '+fn(a)+' = ?',ans:a*a};}},
    {name:'Square any 2-digit number',
     explain:'Find the nearest round ten and calculate the gap. Multiply (number + gap) × (number − gap), then add gap squared.',
     steps:['37² = ?','Nearest ten = 40, gap = 3','(40) × (34) = 1360','+ 3² = 9 → 1369'],
     final:'1369',
     gen:function(){var n=rn(11,99);while(n%10===0||n%10===5){n=rn(11,99);}return{q:fn(n)+' × '+fn(n)+' = ?',ans:n*n};}},
    {name:'Close-together method',
     explain:'When two numbers are close to the same round ten, use that ten as a base. Multiply base × far end, then add the two gaps multiplied together.',
     steps:['23 × 26 = ?','Base = 20, gaps = 3 and 6','20 × 29 = 580','3 × 6 = 18','580 + 18 = 598'],
     final:'598',
     gen:function(){var base=rn(2,9)*10,g1=rn(1,9),g2=rn(1,9),a=base+g1,b=base+g2;return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};}},
    {name:'Cube a number',
     explain:'Raise a number to the power of 3. Multiply it by itself to get the square, then multiply by the original once more.',
     steps:['7³ = ?','7 × 7 = 49','49 × 7 = 343'],
     final:'343',
     gen:function(){var n=rn(1,3)===1?-rn(2,15):rn(2,20);return{q:fn(n)+'³ = ?',ans:n*n*n};}}
  ]},
  {group:'Division',symbol:'÷',items:[
    {name:'Break & divide (chunking)',
     explain:'Break the dividend into chunks that are easy to divide separately. Add the partial results together.',
     steps:['168 ÷ 7 = ?','140 ÷ 7 = 20','28 ÷ 7 = 4','20 + 4 = 24'],
     final:'24',
     gen:function(){
       var divisors=[3,4,6,7,8,9];
       var d=divisors[rn(0,divisors.length-1)];
       var q=rn(11,120),a=d*q;
       return{q:fn(a)+' ÷ '+fn(d)+' = ?',ans:q};
     }},
    {name:'Simplify before dividing',
     explain:'Divide both numbers by the same common factor first. Smaller numbers are much easier to work with.',
     steps:['180 ÷ 15 = ?','Both divisible by 5','36 ÷ 3 = 12'],
     final:'12',
     gen:function(){
       var factors=[2,3,4,5,6];
       var f=factors[rn(0,factors.length-1)];
       var q=rn(2,12),b=rn(2,8)*f,a=q*b;
       return{q:fn(a)+' ÷ '+fn(b)+' = ?',ans:a/b};
     }},
    {name:'Divide by 5',
     explain:'Divide by 10 (shift decimal left), then multiply by 2. Because ÷5 = ÷10 × 2.',
     steps:['240 ÷ 5 = ?','240 ÷ 10 = 24','24 × 2 = 48'],
     final:'48',
     gen:function(){var a=rn(2,120)*5*(rn(1,6)===1?-1:1);return{q:fn(a)+' ÷ 5 = ?',ans:a/5};}},
    {name:'Halving chain (÷ 4)',
     explain:'To divide by 4, simply halve the number twice in a row.',
     steps:['96 ÷ 4 = ?','96 ÷ 2 = 48','48 ÷ 2 = 24'],
     final:'24',
     gen:function(){var a=rn(2,120)*4;return{q:fn(a)+' ÷ 4 = ?',ans:a/4};}},
    {name:'Halving chain (÷ 8)',
     explain:'To divide by 8, halve the number three times in a row.',
     steps:['480 ÷ 8 = ?','480 ÷ 2 = 240','240 ÷ 2 = 120','120 ÷ 2 = 60'],
     final:'60',
     gen:function(){var a=rn(2,100)*8;return{q:fn(a)+' ÷ 8 = ?',ans:a/8};}},
    {name:'Divide by 9',
     explain:'A number is divisible by 9 if its digits sum to 9 or a multiple of 9. Then divide using known multiples.',
     steps:['153 ÷ 9 = ?','1+5+3 = 9 ✓','153 ÷ 9 = 17'],
     final:'17',
     gen:function(){var m=rn(2,100),a=m*9;return{q:fn(a)+' ÷ 9 = ?',ans:a/9};}},
    {name:'Divide by 25',
     explain:'Multiply by 4, then divide by 100. Because ÷25 = ×4 ÷100.',
     steps:['575 ÷ 25 = ?','575 × 4 = 2300','2300 ÷ 100 = 23'],
     final:'23',
     gen:function(){var a=rn(2,120)*25*(rn(1,6)===1?-1:1);return{q:fn(a)+' ÷ 25 = ?',ans:a/25};}},
    {name:'Fraction to decimal',
     explain:'Common fractions have fixed decimal values worth memorising. No calculation needed — just recall.',
     steps:['3/8 = ?','Know: 1/8 = 0.125','3 × 0.125 = 0.375'],
     final:'0.375',
     gen:function(){
       var fracs=[
         {q:'1/2',a:0.5},
         {q:'1/4',a:0.25},{q:'3/4',a:0.75},
         {q:'1/5',a:0.2},{q:'2/5',a:0.4},{q:'3/5',a:0.6},{q:'4/5',a:0.8},
         {q:'1/8',a:0.125},{q:'3/8',a:0.375},{q:'5/8',a:0.625},{q:'7/8',a:0.875},
         {q:'1/3',a:0.333},{q:'2/3',a:0.667},
         {q:'1/6',a:0.167},{q:'5/6',a:0.833},
         {q:'1/10',a:0.1},{q:'3/10',a:0.3},{q:'7/10',a:0.7},{q:'9/10',a:0.9},
         {q:'1/16',a:0.0625},{q:'3/16',a:0.1875},{q:'5/16',a:0.3125},{q:'7/16',a:0.4375},
         {q:'1/12',a:0.083},{q:'5/12',a:0.417},{q:'7/12',a:0.583},{q:'11/12',a:0.917},
         {q:'1/20',a:0.05},{q:'3/20',a:0.15},{q:'7/20',a:0.35},{q:'9/20',a:0.45}
       ];
       var f=fracs[rn(0,fracs.length-1)];
       return{q:t('as_decimal_q',{frac:f.q}),ans:f.a};
     }}
  ]},
  {group:'Percentage',symbol:'%',items:[
    {name:'10% base trick',
     explain:'Move the decimal point one place to the left to find 10%. This is the foundation for almost every percentage calculation.',
     steps:['10% of 370 = ?','Shift decimal left once','37.0 = 37'],
     final:'37',
     gen:function(){
       var useDec=Math.random()>0.5;
       var a=useDec?parseFloat((rn(10,99)+rn(1,9)/10).toFixed(1)):rn(1,30)*10;
       var ans=parseFloat((a*0.1).toFixed(2));
       return{q:'10% '+t('word_of')+' '+fn(a)+' = ?',ans:ans};
     }},
    {name:'Build any % from 10% + 1%',
     explain:'Find 10% (shift decimal) and 1% (shift decimal twice). Then combine them to build any percentage you need.',
     steps:['7% of 450 = ?','1% of 450 = 4.5','4.5 × 7 = 31.5'],
     final:'31.5',
     gen:function(){var pcts=[3,4,6,7,8,9,11,12,13,14,16,17,18,19,23,27,32,45];var p=pcts[rn(0,pcts.length-1)];var a=rn(2,60)*10;return{q:fn(p)+'% '+t('word_of')+' '+fn(a)+' = ?',ans:parseFloat((a*p/100).toFixed(1))};}},
    {name:'5% shortcut',
     explain:'Find 10% first, then halve it.',
     steps:['5% of 340 = ?','10% of 340 = 34','34 ÷ 2 = 17'],
     final:'17',
     gen:function(){var a=rn(2,250)*2;return{q:'5% '+t('word_of')+' '+fn(a)+' = ?',ans:parseFloat((a*0.05).toFixed(1))};}},
    {name:'15% shortcut',
     explain:'Find 10%, find 5% (half of 10%), then add them together.',
     steps:['15% of 60 = ?','10% = 6','5% = 3','6 + 3 = 9'],
     final:'9',
     gen:function(){var a=rn(2,200)*2;return{q:'15% '+t('word_of')+' '+fn(a)+' = ?',ans:parseFloat((a*0.15).toFixed(1))};}},
    {name:'20% shortcut',
     explain:'Find 10%, then double it.',
     steps:['20% of 350 = ?','10% of 350 = 35','35 × 2 = 70'],
     final:'70',
     gen:function(){var a=rn(10,500);return{q:'20% '+t('word_of')+' '+fn(a)+' = ?',ans:parseFloat((a*0.2).toFixed(1))};}},
    {name:'25% and 75%',
     explain:'25% = divide by 4. 75% = divide by 4 then multiply by 3.',
     steps:['75% of 800 = ?','800 ÷ 4 = 200','200 × 3 = 600'],
     final:'600',
     gen:function(){
       var maxMult=rn(2,150);
       var b=maxMult*4;
       var p=Math.random()<.5?25:75;
       return{q:fn(p)+'% '+t('word_of')+' '+fn(b)+' = ?',ans:parseFloat((p*b/100).toFixed(1))};
     }},
    {name:'Swap the numbers',
     explain:'X% of Y equals Y% of X. Always pick whichever direction is easier.',
     steps:['4% of 75 = ?','Swap: 75% of 4','75% of 4 = 3'],
     final:'3',
     gen:function(){var ps=[5,10,20,25,50],p=ps[rn(0,ps.length-1)],b=rn(2,60)*(100/p);return{q:fn(p)+'% '+t('word_of')+' '+fn(b)+' = ?',ans:parseFloat((p*b/100).toFixed(1))};}},
    {name:'Rule of 70',
     explain:'To estimate how long it takes money (or anything) to double at a steady growth rate: divide 70 by the rate.',
     steps:['Double at 7% in how many years?','70 ÷ 7 = 10','Answer: 10 years'],
     final:'10',
     gen:function(){
       var rates=[1,2,4,5,7,10,14,20,25,28,35];
       var r=rates[rn(0,rates.length-1)];
       if(rn(1,2)===1)return{q:t('rule_of_70_q',{r:r}),ans:70/r};
       var years=70/r;
       return{q:t('rule_of_70_inv_q',{y:fn(years)}),ans:r};
     }}
  ]},
  {group:'Verification',symbol:'✓',items:[
    {name:'Estimate first',
     explain:'Before calculating, round all numbers and do a rough check. If your exact answer is far from the estimate, you have made an error somewhere.',
     steps:['293 × 48 = ?','Round: 300 × 50 = 15,000','Exact should be near 15,000','293 × 48 = 14,064 ✓'],
     final:'14064',
     gen:function(){
       var a=rn(11,49),b=rn(11,49);
       return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};
     }},
    {name:'Casting out nines',
     explain:'Check any addition or multiplication without recalculating. Reduce each number to its digit sum (keep adding digits until single digit). If the operation holds on those digit sums, your answer is almost certainly correct.',
     steps:['Check: 67 + 83 = 150','67 → 6+7=13 → 4','83 → 8+3=11 → 2','4 + 2 = 6','150 → 1+5+0 = 6 ✓'],
     final:'6',
     gen:function(){
       function dsum(n){n=Math.abs(n);while(n>=10){var s=0;while(n>0){s+=n%10;n=Math.floor(n/10);}n=s;}return n;}
       var a=rn(10,99),b=rn(10,99),total=a+b;
       return{q:t('digit_sum_check_q',{a:fn(a),b:fn(b),total:fn(total)}),ans:dsum(total)};
     }}
  ]},
  {group:'Advanced',symbol:'★',items:[
    {name:'Every multiplier is a hidden percentage',
     explain:'Any number that is a clean fraction of 10, 100 or 1000 can be treated as a percentage instead. Scale up to the round number, apply the percentage, done. Works for 5, 25, 50, 125, 250, 500 and more.',
     steps:['48 × 125 = ?','125 = 1000 ÷ 8','48 × 1000 = 48,000','48,000 ÷ 8 = 6000'],
     final:'6000',
     gen:function(){
       var aliquots=[
         {m:5,scale:10,div:2},{m:25,scale:100,div:4},
         {m:50,scale:100,div:2},{m:125,scale:1000,div:8},
         {m:250,scale:1000,div:4},{m:500,scale:1000,div:2},
         {m:20,scale:100,div:5},{m:12.5,scale:100,div:8}
       ];
       var al=aliquots[rn(0,aliquots.length-1)];
       var a=rn(2,60)*al.div;
       return{q:fn(a)+' × '+al.m+' = ?',ans:a*al.m};
     }},
    {name:'Multiply 3-digit × 1-digit',
     explain:'Break the 3-digit number into hundreds + tens + units. Multiply each part separately, then add.',
     steps:['213 × 7 = ?','200 × 7 = 1400','10 × 7 = 70','3 × 7 = 21','1491'],
     final:'1491',
     gen:function(){var a=rn(101,499),b=rn(2,9);return{q:fn(a)+' × '+b+' = ?',ans:a*b};}},
    {name:'Multiply near 100',
     explain:'When both numbers are close to 100, note each gap from 100. Cross-subtract one gap from the other number. Multiply both gaps for the last two digits.',
     steps:['97 × 96 = ?','Gaps: 3 and 4','97 − 4 = 93','3 × 4 = 12','9312'],
     final:'9312',
     gen:function(){var g1=rn(1,12)*(rn(1,2)===1?-1:1),g2=rn(1,12)*(rn(1,2)===1?-1:1),a=100-g1,b=100-g2;return{q:fn(a)+' × '+fn(b)+' = ?',ans:a*b};}},
    {name:'Square a 3-digit number',
     explain:'Find the gap to the nearest hundred. Use the formula (n+gap)×(n−gap) then add gap squared. Same principle as squaring 2-digit numbers, just bigger.',
     steps:['193² = ?','Nearest hundred = 200, gap = 7','200 × 186 = 37,200','7² = 49','37,249'],
     final:'37249',
     gen:function(){
       var hundreds=rn(1,9)*100;
       var gap=rn(1,25);
       var n=Math.random()>0.5?hundreds-gap:hundreds+gap;
       if(n<100||n>999)n=hundreds-gap;
       return{q:fn(n)+' × '+fn(n)+' = ?',ans:n*n};
     }},
    {name:'Aliquot parts (fractions of 100)',
     explain:'Numbers like 12.5, 33.33 and 16.67 are exact fractions of 100. Multiply by 100 then divide by the denominator instead of multiplying directly.',
     steps:['48 × 12.5 = ?','12.5 = 100 ÷ 8','48 × 100 = 4800','4800 ÷ 8 = 600'],
     final:'600',
     gen:function(){
       var aliquots=[{m:12.5,d:8},{m:20,d:5},{m:25,d:4},{m:50,d:2}];
       var al=aliquots[rn(0,aliquots.length-1)];
       var a=rn(2,60)*al.d;
       return{q:fn(a)+' × '+al.m+' = ?',ans:a*al.m};
     }}
  ]}
];

export const GROUP_NAMES_RU = {Addition:'Сложение',Subtraction:'Вычитание',Multiplication:'Умножение',Division:'Деление',Percentage:'Проценты',Verification:'Проверка',Advanced:'Продвинутое'};

export const TRICKS_RU = {
'Addition::Break & add':{name:'Разложить и сложить',explain:'Разложите одно число на десятки и единицы, затем сложите каждую часть отдельно. Это универсальный способ сложения — работает для любых двух чисел.',steps:['54 + 37 = ?','54 + 30 = 84','84 + 7 = 91']},
'Addition::Left-to-right addition':{name:'Сложение слева направо',explain:'Складывайте сначала самые крупные разряды — сотни, затем десятки, затем единицы. У вас всегда есть примерный ответ заранее, вы просто его уточняете.',steps:['346 + 278 = ?','300 + 200 = 500','40 + 70 = 110 → 610','6 + 8 = 14 → 624']},
'Addition::Round & adjust':{name:'Округлить и скорректировать',explain:'Округлите одно число вверх до ближайшего десятка, сложите, затем вычтите то, что добавили лишнего.',steps:['47 + 38 = ?','47 + 40 = 87','87 − 2 = 85']},
'Addition::Make 10 first':{name:'Сначала сделать 10',explain:'Если два числа в сумме дают 10, сгруппируйте их первыми — затем добавьте остальное. Значительно быстрее!',steps:['7 + 6 + 3 = ?','(7 + 3) + 6 = ?','10 + 6 = 16']},
'Addition::Doubles + adjust':{name:'Удвоение с коррекцией',explain:'Если два числа близки друг к другу, удвойте среднее значение и скорректируйте. Гораздо быстрее прямого сложения.',steps:['23 + 25 = ?','Числа близки → удвоить 24','24 × 2 = 48']},
'Subtraction::Break & subtract':{name:'Разложить и вычесть',explain:'Разложите вычитаемое число на десятки и единицы. Вычитайте каждую часть отдельно. Это универсальный способ вычитания.',steps:['75 − 43 = ?','75 − 40 = 35','35 − 3 = 32']},
'Subtraction::Round & adjust':{name:'Округлить и скорректировать',explain:'Округлите вычитаемое число вверх до ближайшего десятка, вычтите, затем добавьте обратно лишнее.',steps:['83 − 29 = ?','83 − 30 = 53','53 + 1 = 54']},
'Subtraction::Count up':{name:'Счёт вперёд',explain:'Вместо вычитания считайте вперёд от меньшего числа к большему. Отлично работает, когда разница небольшая.',steps:['73 − 68 = ?','68 → 70 = +2','70 → 73 = +3','2 + 3 = 5']},
'Subtraction::Same-change rule':{name:'Правило одинакового изменения',explain:'Прибавьте одно и то же число к обеим сторонам, чтобы сделать одно из них круглым числом. Разница останется точно такой же.',steps:['83 − 57 = ?','Добавить 3 к обеим сторонам','86 − 60 = 26']},
'Subtraction::Complements':{name:'Дополнения',explain:'Найдите, насколько меньшее число не дотягивает до следующей круглой сотни. Вычтите за круглую сотню, затем добавьте разницу обратно.',steps:['537 − 289 = ?','289 → 300: разница = 11','537 − 300 = 237','237 + 11 = 248']},
'Multiplication::Break & add (split multiplier)':{name:'Разложить и сложить (разбить множитель)',explain:'Разложите одно число на две части, умножьте каждую часть отдельно, затем сложите результаты. Это универсальный способ умножения — работает для любых двух чисел.',steps:['45 × 36 = ?','36 = 30 + 6','45 × 30 = 1350','45 × 6 = 270','1350 + 270 = 1620']},
'Multiplication::Break & subtract (near round number)':{name:'Разложить и вычесть (около круглого числа)',explain:'Когда одно число чуть меньше круглого десятка, умножьте на круглое число, затем вычтите небольшой излишек.',steps:['45 × 29 = ?','29 = 30 − 1','45 × 30 = 1350','1350 − 45 = 1305']},
'Multiplication::Multiply by 5':{name:'Умножение на 5',explain:'Умножьте на 10 (просто добавьте ноль), затем разделите результат пополам. Потому что 5 = 10 ÷ 2.',steps:['36 × 5 = ?','36 × 10 = 360','360 ÷ 2 = 180']},
'Multiplication::Multiply by 9':{name:'Умножение на 9',explain:'Умножьте на 10, затем вычтите исходное число один раз. Потому что 9 = 10 − 1.',steps:['7 × 9 = ?','7 × 10 = 70','70 − 7 = 63']},
'Multiplication::Multiply by 11':{name:'Умножение на 11',explain:'Для двузначных чисел: запишите первую цифру, затем сумму обеих цифр, затем последнюю цифру.',steps:['32 × 11 = ?','Первая цифра: 3','Середина: 3 + 2 = 5','Последняя цифра: 2','352']},
'Multiplication::Multiply by 25':{name:'Умножение на 25',explain:'Умножьте на 100, затем разделите на 4 (дважды пополам). Потому что 25 = 100 ÷ 4.',steps:['36 × 25 = ?','36 × 100 = 3600','3600 ÷ 4 = 900']},
'Multiplication::Multiply by 99':{name:'Умножение на 99',explain:'Умножьте на 100, затем вычтите исходное число один раз. Потому что 99 = 100 − 1.',steps:['7 × 99 = ?','7 × 100 = 700','700 − 7 = 693']},
'Multiplication::Double & halve':{name:'Удвоить и уполовинить',explain:'Уполовиньте одно число и удвойте другое — произведение не меняется. Продолжайте, пока одно из чисел не станет удобным.',steps:['16 × 25 = ?','8 × 50','4 × 100 = 400']},
'Multiplication::Multiply using factors':{name:'Умножение через множители',explain:'Разложите одно число на два меньших множителя. Умножайте на каждый множитель по очереди — гораздо проще одного большого шага.',steps:['43 × 28 = ?','28 = 7 × 4','43 × 7 = 301','301 × 4 = 1204']},
'Multiplication::Scale & shift zeros':{name:'Масштабирование и перенос нулей',explain:'Уберите нули у обоих чисел, перемножьте основные цифры, затем добавьте все нули обратно. Работает при любом масштабе.',steps:['50 × 160 = ?','Основа: 5 × 16 = 80','Убрано 2 нуля всего','80 × 100 = 8000']},
'Multiplication::Squares ending in 5':{name:'Квадраты чисел, оканчивающихся на 5',explain:'Для любого числа, оканчивающегося на 5: умножьте часть перед пятёркой на неё же плюс 1, затем допишите 25.',steps:['35 × 35 = ?','Первая цифра: 3','3 × (3+1) = 3 × 4 = 12','Дописать 25 → 1225']},
'Multiplication::Square any 2-digit number':{name:'Возведение в квадрат любого двузначного числа',explain:'Найдите ближайший круглый десяток и вычислите разницу. Умножьте (число + разница) × (число − разница), затем добавьте разницу в квадрате.',steps:['37² = ?','Ближайший десяток = 40, разница = 3','(40) × (34) = 1360','+ 3² = 9 → 1369']},
'Multiplication::Close-together method':{name:'Метод близких чисел',explain:'Когда два числа близки к одному и тому же круглому десятку, используйте этот десяток как базу. Умножьте базу × дальнее число, затем добавьте произведение двух разниц.',steps:['23 × 26 = ?','База = 20, разницы = 3 и 6','20 × 29 = 580','3 × 6 = 18','580 + 18 = 598']},
'Multiplication::Cube a number':{name:'Возведение числа в куб',explain:'Возведите число в третью степень. Умножьте его само на себя, чтобы получить квадрат, затем умножьте на исходное число ещё раз.',steps:['7³ = ?','7 × 7 = 49','49 × 7 = 343']},
'Division::Break & divide (chunking)':{name:'Разложить и разделить (по частям)',explain:'Разбейте делимое на части, которые легко делить по отдельности. Сложите частичные результаты.',steps:['168 ÷ 7 = ?','140 ÷ 7 = 20','28 ÷ 7 = 4','20 + 4 = 24']},
'Division::Simplify before dividing':{name:'Упростить перед делением',explain:'Сначала разделите оба числа на один и тот же общий множитель. С меньшими числами работать намного проще.',steps:['180 ÷ 15 = ?','Оба делятся на 5','36 ÷ 3 = 12']},
'Division::Divide by 5':{name:'Деление на 5',explain:'Разделите на 10 (перенесите запятую влево), затем умножьте на 2. Потому что ÷5 = ÷10 × 2.',steps:['240 ÷ 5 = ?','240 ÷ 10 = 24','24 × 2 = 48']},
'Division::Halving chain (÷ 4)':{name:'Цепочка деления пополам (÷ 4)',explain:'Чтобы разделить на 4, просто дважды подряд разделите число пополам.',steps:['96 ÷ 4 = ?','96 ÷ 2 = 48','48 ÷ 2 = 24']},
'Division::Halving chain (÷ 8)':{name:'Цепочка деления пополам (÷ 8)',explain:'Чтобы разделить на 8, разделите число пополам три раза подряд.',steps:['480 ÷ 8 = ?','480 ÷ 2 = 240','240 ÷ 2 = 120','120 ÷ 2 = 60']},
'Division::Divide by 9':{name:'Деление на 9',explain:'Число делится на 9, если сумма его цифр равна 9 или кратна 9. Затем делите, используя известные кратные.',steps:['153 ÷ 9 = ?','1+5+3 = 9 ✓','153 ÷ 9 = 17']},
'Division::Divide by 25':{name:'Деление на 25',explain:'Умножьте на 4, затем разделите на 100. Потому что ÷25 = ×4 ÷100.',steps:['575 ÷ 25 = ?','575 × 4 = 2300','2300 ÷ 100 = 23']},
'Division::Fraction to decimal':{name:'Дробь в десятичную',explain:'У распространённых дробей есть фиксированные десятичные значения, которые стоит запомнить. Вычислять не нужно — просто вспомните.',steps:['3/8 = ?','Помните: 1/8 = 0.125','3 × 0.125 = 0.375']},
'Percentage::10% base trick':{name:'Базовый приём 10%',explain:'Сдвиньте запятую на один разряд влево, чтобы найти 10%. Это основа почти для любого расчёта процентов.',steps:['10% от 370 = ?','Сдвинуть запятую влево на один разряд','37.0 = 37']},
'Percentage::Build any % from 10% + 1%':{name:'Построить любой % из 10% + 1%',explain:'Найдите 10% (сдвиг запятой) и 1% (сдвиг запятой дважды). Затем скомбинируйте их, чтобы получить нужный процент.',steps:['7% от 450 = ?','1% от 450 = 4.5','4.5 × 7 = 31.5']},
'Percentage::5% shortcut':{name:'Приём для 5%',explain:'Сначала найдите 10%, затем разделите пополам.',steps:['5% от 340 = ?','10% от 340 = 34','34 ÷ 2 = 17']},
'Percentage::15% shortcut':{name:'Приём для 15%',explain:'Найдите 10%, найдите 5% (половина от 10%), затем сложите их вместе.',steps:['15% от 60 = ?','10% = 6','5% = 3','6 + 3 = 9']},
'Percentage::20% shortcut':{name:'Приём для 20%',explain:'Найдите 10%, затем удвойте.',steps:['20% от 350 = ?','10% от 350 = 35','35 × 2 = 70']},
'Percentage::25% and 75%':{name:'25% и 75%',explain:'25% = разделить на 4. 75% = разделить на 4, затем умножить на 3.',steps:['75% от 800 = ?','800 ÷ 4 = 200','200 × 3 = 600']},
'Percentage::Swap the numbers':{name:'Поменять числа местами',explain:'X% от Y равно Y% от X. Всегда выбирайте то направление, которое проще.',steps:['4% от 75 = ?','Поменять: 75% от 4','75% от 4 = 3']},
'Percentage::Rule of 70':{name:'Правило 70',explain:'Чтобы оценить, за сколько времени деньги (или что угодно) удвоятся при постоянном темпе роста: разделите 70 на этот темп в процентах.',steps:['Удвоение при 7% — за сколько лет?','70 ÷ 7 = 10','Ответ: 10 лет']},
'Verification::Estimate first':{name:'Сначала оценить',explain:'Перед вычислением округлите все числа и сделайте грубую прикидку. Если точный ответ сильно отличается от прикидки — где-то ошибка.',steps:['293 × 48 = ?','Округление: 300 × 50 = 15 000','Точный ответ должен быть близко к 15 000','293 × 48 = 14 064 ✓']},
'Verification::Casting out nines':{name:'Метод отбрасывания девяток',explain:'Проверьте любое сложение или умножение без пересчёта. Сведите каждое число к сумме его цифр (складывайте цифры, пока не останется одна). Если операция верна для этих сумм цифр — ответ почти наверняка правильный.',steps:['Проверка: 67 + 83 = 150','67 → 6+7=13 → 4','83 → 8+3=11 → 2','4 + 2 = 6','150 → 1+5+0 = 6 ✓']},
'Advanced::Every multiplier is a hidden percentage':{name:'Любой множитель — это скрытый процент',explain:'Любое число, являющееся простой дробью от 10, 100 или 1000, можно рассматривать как процент. Увеличьте до круглого числа, примените процент — готово. Работает для 5, 25, 50, 125, 250, 500 и других.',steps:['48 × 125 = ?','125 = 1000 ÷ 8','48 × 1000 = 48 000','48 000 ÷ 8 = 6000']},
'Advanced::Multiply 3-digit × 1-digit':{name:'Умножение трёхзначного на однозначное',explain:'Разложите трёхзначное число на сотни + десятки + единицы. Умножьте каждую часть отдельно, затем сложите.',steps:['213 × 7 = ?','200 × 7 = 1400','10 × 7 = 70','3 × 7 = 21','1491']},
'Advanced::Multiply near 100':{name:'Умножение чисел около 100',explain:'Когда оба числа близки к 100, отметьте разницу каждого от 100. Вычтите одну разницу из другого числа крест-накрест. Перемножьте обе разницы для последних двух цифр.',steps:['97 × 96 = ?','Разницы: 3 и 4','97 − 4 = 93','3 × 4 = 12','9312']},
'Advanced::Square a 3-digit number':{name:'Возведение в квадрат трёхзначного числа',explain:'Найдите разницу до ближайшей сотни. Используйте формулу (n+разница)×(n−разница), затем добавьте разницу в квадрате. Тот же принцип, что и для двузначных чисел, только крупнее.',steps:['193² = ?','Ближайшая сотня = 200, разница = 7','200 × 186 = 37 200','7² = 49','37 249']},
'Advanced::Aliquot parts (fractions of 100)':{name:'Аликвотные части (доли от 100)',explain:'Числа вроде 12.5, 33.33 и 16.67 — это точные доли от 100. Умножьте на 100, затем разделите на знаменатель вместо прямого умножения.',steps:['48 × 12.5 = ?','12.5 = 100 ÷ 8','48 × 100 = 4800','4800 ÷ 8 = 600']}
};
