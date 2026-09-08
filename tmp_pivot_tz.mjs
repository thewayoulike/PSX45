const res = await fetch("http://localhost:3000/api/proxy?ohlc=OGDC");
const { bars } = await res.json();
function pkParts(t) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  const [y,m,d] = s.split("-").map(Number);
  return { y, m, d, key: y + "-" + (m-1) };
}
function collect(bars, usePk) {
  const periods = [];
  const keyFn = usePk ? (t) => pkParts(t).key : (t) => { const d = new Date(t); return d.getUTCFullYear() + "-" + d.getUTCMonth(); };
  let key = keyFn(bars[0].time), st = bars[0].time, en = bars[0].time, hi = bars[0].high, lo = bars[0].low, op = bars[0].open, cl = bars[0].close;
  const flush = () => periods.push({ key, hi, lo, cl, op });
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], k = keyFn(b.time);
    if (k !== key) { flush(); key = k; st = b.time; en = b.time; hi = b.high; lo = b.low; op = b.open; cl = b.close; }
    else { en = b.time; hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); cl = b.close; }
  }
  flush();
  return periods;
}
const utc = collect(bars, false);
const pk = collect(bars, true);
const u = utc.at(-2), p = pk.at(-2);
console.log("UTC prev", u);
console.log("PK prev", p);
console.log("same HLC?", u.hi===p.hi && u.lo===p.lo && u.cl===p.cl);
