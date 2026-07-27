// Local-time date-key helpers — ported verbatim from the reference prototype so day
// boundaries match the local-midnight countdown timer, not UTC.
export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
export function dateToKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
export function dayKey() {
  return dateToKey(new Date());
}
export function yesterday() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return dateToKey(d);
}
export function addDaysStr(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  d.setDate(d.getDate() + n);
  return dateToKey(d);
}
export function dateStrToDate(dateStr) {
  var p = dateStr.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
export function msToMidnight() {
  var now = new Date();
  var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return mid.getTime() - now.getTime();
}
export function fmtChCountdown(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return 'Next challenge in ' + h + 'h ' + m + 'm ' + sec + 's';
}
export function daysBetweenKeys(a, b) {
  var da = dateStrToDate(a),
    dbb = dateStrToDate(b);
  return Math.round((dbb.getTime() - da.getTime()) / 86400000);
}
