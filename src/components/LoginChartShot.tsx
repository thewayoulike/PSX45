import React from 'react';

/** Price 85–165 mapped to SVG y (top = high price). */
const PY = (p: number) => 8 + ((165 - p) / 80) * 132;

type Candle = { x: number; o: number; h: number; l: number; c: number; vol: number };

const CANDLES: Candle[] = [
  { x: 14, o: 98, h: 100, l: 95, c: 97, vol: 28 },
  { x: 22, o: 97, h: 99, l: 94, c: 96, vol: 32 },
  { x: 30, o: 96, h: 101, l: 95, c: 100, vol: 45 },
  { x: 38, o: 100, h: 104, l: 99, c: 103, vol: 38 },
  { x: 46, o: 103, h: 106, l: 101, c: 102, vol: 42 },
  { x: 54, o: 102, h: 105, l: 99, c: 104, vol: 55 },
  { x: 62, o: 104, h: 108, l: 103, c: 107, vol: 48 },
  { x: 70, o: 107, h: 110, l: 105, c: 106, vol: 40 },
  { x: 78, o: 106, h: 109, l: 102, c: 103, vol: 52 },
  { x: 86, o: 103, h: 107, l: 100, c: 105, vol: 44 },
  { x: 94, o: 105, h: 112, l: 104, c: 111, vol: 62 },
  { x: 102, o: 111, h: 115, l: 109, c: 114, vol: 58 },
  { x: 110, o: 114, h: 118, l: 112, c: 113, vol: 46 },
  { x: 118, o: 113, h: 117, l: 110, c: 111, vol: 50 },
  { x: 126, o: 111, h: 116, l: 108, c: 115, vol: 54 },
  { x: 134, o: 115, h: 122, l: 114, c: 121, vol: 68 },
  { x: 142, o: 121, h: 128, l: 120, c: 127, vol: 72 },
  { x: 150, o: 127, h: 132, l: 125, c: 130, vol: 65 },
  { x: 158, o: 130, h: 138, l: 129, c: 136, vol: 80 },
  { x: 166, o: 136, h: 142, l: 133, c: 141, vol: 74 },
  { x: 174, o: 141, h: 148, l: 139, c: 146, vol: 88 },
  { x: 182, o: 146, h: 152, l: 144, c: 151, vol: 92 },
  { x: 190, o: 151, h: 156, l: 149, c: 154, vol: 85 },
  { x: 198, o: 154, h: 158, l: 151, c: 152, vol: 70 },
  { x: 206, o: 152, h: 155, l: 148, c: 150, vol: 58 },
  { x: 214, o: 150, h: 154, l: 147, c: 153, vol: 52 },
  { x: 222, o: 153, h: 157, l: 151, c: 156, vol: 60 },
  { x: 230, o: 156, h: 160, l: 154, c: 158, vol: 55 },
  { x: 238, o: 158, h: 162, l: 156, c: 160, vol: 48 },
  { x: 246, o: 160, h: 163, l: 157, c: 161, vol: 42 },
  { x: 254, o: 161, h: 164, l: 158, c: 162, vol: 38 },
  { x: 262, o: 162, h: 165, l: 159, c: 163, vol: 35 },
  { x: 270, o: 163, h: 165, l: 160, c: 161, vol: 40 },
  { x: 278, o: 161, h: 163, l: 157, c: 158, vol: 45 },
  { x: 286, o: 158, h: 160, l: 154, c: 155, vol: 50 },
  { x: 294, o: 155, h: 158, l: 152, c: 154, vol: 44 },
  { x: 302, o: 154, h: 156, l: 150, c: 152, vol: 42 },
  { x: 310, o: 152, h: 154, l: 149, c: 151, vol: 36 },
  { x: 318, o: 151, h: 153, l: 148, c: 152, vol: 32 },
];

const ma = (vals: number[], period: number, i: number) => {
  if (i < period - 1) return null;
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += vals[j];
  return s / period;
};

const closes = CANDLES.map((c) => c.c);
const ma20 = CANDLES.map((_, i) => ma(closes, 5, i));
const ma50 = CANDLES.map((_, i) => ma(closes, 10, i));
const ma100 = CANDLES.map((_, i) => ma(closes, 18, i));

const maPath = (data: (number | null)[]) => {
  const pts: string[] = [];
  data.forEach((v, i) => {
    if (v == null) return;
    pts.push(`${CANDLES[i].x},${PY(v).toFixed(2)}`);
  });
  return pts.length > 1 ? pts.join(' ') : '';
};

const Pill: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <span
    className={`px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold whitespace-nowrap ${
      active
        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
        : 'text-slate-500 dark:text-slate-400'
    }`}
  >
    {label}
  </span>
);

const DrawBtn: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <span
    className={`inline-flex items-center px-1.5 sm:px-2 py-1 rounded-lg text-[9px] font-bold ${
      active ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'
    }`}
  >
    {label}
  </span>
);

export const ChartShot: React.FC = () => (
  <div className="relative w-full mt-4 text-left">
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
      <div className="h-9 flex items-center gap-1.5 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] text-slate-400 font-mono">psx-tracker.com/charts</span>
      </div>

      <div className="p-3 sm:p-4 bg-slate-50 dark:bg-[#0a0a0a] space-y-2">
        {/* header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display font-black text-sm sm:text-base text-slate-900 dark:text-white">OGDC</span>
          <span className="text-[10px] font-bold text-slate-400">Candles · Daily</span>
          <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">Rs. 152.40</span>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">+2.14%</span>
          <span className="text-[10px] font-bold text-slate-400">· 3M</span>
        </div>

        {/* toolbar row 1 */}
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <Pill label="Candles" active />
          <Pill label="Line" />
          <Pill label="BB + RSI" />
          <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5 self-center" />
          <Pill label="Day" active />
          <Pill label="Week" />
          <Pill label="Month" />
          <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5 self-center" />
          <Pill label="1M" />
          <Pill label="3M" active />
          <Pill label="6M" />
          <Pill label="1Y" />
          <Pill label="ALL" />
        </div>

        {/* toolbar row 2 — draw tools */}
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 items-center">
          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 px-1 hidden sm:inline">Draw</span>
          <DrawBtn label="Pan" active />
          <DrawBtn label="Cross" />
          <DrawBtn label="Trend" />
          <DrawBtn label="Fib" />
          <DrawBtn label="H-Line" />
          <DrawBtn label="V-Line" />
          <DrawBtn label="Box" />
          <DrawBtn label="Select" />
          <span className="ml-auto text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-2 py-1 rounded-lg">
            Indicators 22/27
          </span>
          <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-2 py-1 rounded-lg">
            Momentum 1/4
          </span>
        </div>

        {/* panels */}
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
          <span>Panels</span>
          <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/25">
            Volume ●
          </span>
          <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/25">
            RSI ●
          </span>
        </div>

        {/* chart canvas */}
        <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-[#fafafa] dark:bg-[#0d1117] overflow-hidden">
          <svg viewBox="0 0 360 248" className="w-full h-auto block" aria-label="OGDC candlestick chart preview">
            <defs>
              <linearGradient id="bbFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#38bdf8" stopOpacity="0.12" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0.04" />
              </linearGradient>
            </defs>

            {/* grid */}
            {[100, 120, 140, 160].map((p) => (
              <g key={p}>
                <line x1="8" y1={PY(p)} x2="332" y2={PY(p)} stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-slate-800" strokeDasharray="3 3" />
                <text x="336" y={PY(p) + 3} fill="#94a3b8" fontSize="7" fontWeight="600">{p}</text>
              </g>
            ))}

            {/* bollinger band fill */}
            <path
              d={`M${CANDLES.map((c, i) => {
                const mid = c.c;
                const upper = mid + 6 + Math.sin(i * 0.4) * 2;
                return `${i === 0 ? 'M' : 'L'}${c.x},${PY(upper)}`;
              }).join(' ')} ${[...CANDLES].reverse().map((c, ri) => {
                const i = CANDLES.length - 1 - ri;
                const mid = c.c;
                const lower = mid - 6 - Math.sin(i * 0.4) * 2;
                return `L${c.x},${PY(lower)}`;
              }).join(' ')} Z`}
              fill="url(#bbFill)"
            />
            <polyline
              points={CANDLES.map((c, i) => `${c.x},${PY(c.c + 6 + Math.sin(i * 0.4) * 2)}`).join(' ')}
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="0.6"
              strokeDasharray="2 2"
            />
            <polyline
              points={CANDLES.map((c, i) => `${c.x},${PY(c.c - 6 - Math.sin(i * 0.4) * 2)}`).join(' ')}
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="0.6"
              strokeDasharray="2 2"
            />

            {/* moving averages */}
            <polyline points={maPath(ma100)} fill="none" stroke="#f97316" strokeWidth="1" opacity="0.9" />
            <polyline points={maPath(ma50)} fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.85" />
            <polyline points={maPath(ma20)} fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.85" />
            <polyline
              points={CANDLES.map((c) => `${c.x},${PY(c.c + 2)}`).join(' ')}
              fill="none"
              stroke="#111827"
              strokeWidth="0.8"
              opacity="0.7"
            />

            {/* fib / S&R levels */}
            {[
              { p: 158, label: 'R1 158.20', color: '#fb923c' },
              { p: 132, label: '0.618', color: '#a78bfa' },
              { p: 108, label: 'S1 108.40', color: '#fb923c' },
            ].map((lv) => (
              <g key={lv.label}>
                <line x1="8" y1={PY(lv.p)} x2="332" y2={PY(lv.p)} stroke={lv.color} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.85" />
                <text x="334" y={PY(lv.p) + 2.5} fill={lv.color} fontSize="6" fontWeight="700">{lv.label}</text>
              </g>
            ))}

            {/* trend line */}
            <line x1="72" y1={PY(104)} x2="310" y2={PY(158)} stroke="#8b5cf6" strokeWidth="1.2" opacity="0.85" />

            {/* candles */}
            {CANDLES.map((c) => {
              const up = c.c >= c.o;
              const color = up ? '#10b981' : '#ef4444';
              const top = PY(Math.max(c.o, c.c));
              const bot = PY(Math.min(c.o, c.c));
              const h = Math.max(1.5, bot - top);
              return (
                <g key={c.x}>
                  <line x1={c.x} y1={PY(c.h)} x2={c.x} y2={PY(c.l)} stroke={color} strokeWidth="0.9" />
                  <rect x={c.x - 2.5} y={top} width="5" height={h} fill={color} rx="0.4" />
                </g>
              );
            })}

            {/* volume panel */}
            <line x1="8" y1="148" x2="332" y2="148" stroke="#cbd5e1" strokeWidth="0.5" className="dark:stroke-slate-700" />
            <text x="8" y="146" fill="#94a3b8" fontSize="6" fontWeight="700">VOL</text>
            {CANDLES.map((c) => {
              const up = c.c >= c.o;
              const h = (c.vol / 100) * 28;
              return (
                <rect
                  key={`v${c.x}`}
                  x={c.x - 2}
                  y={148 - h}
                  width="4"
                  height={h}
                  fill={up ? '#10b98188' : '#ef444488'}
                  rx="0.3"
                />
              );
            })}

            {/* RSI panel */}
            <line x1="8" y1="188" x2="332" y2="188" stroke="#cbd5e1" strokeWidth="0.5" className="dark:stroke-slate-700" />
            <line x1="8" y1="168" x2="332" y2="168" stroke="#fecaca" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.6" />
            <line x1="8" y1="208" x2="332" y2="208" stroke="#bbf7d0" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.6" />
            <text x="8" y="166" fill="#94a3b8" fontSize="6" fontWeight="700">RSI</text>
            <polyline
              points={CANDLES.map((c, i) => `${c.x},${188 - 18 + Math.sin(i * 0.55) * 14 + Math.cos(i * 0.2) * 6}`).join(' ')}
              fill="none"
              stroke="#22c55e"
              strokeWidth="1"
            />
            <polyline
              points={CANDLES.map((c, i) => `${c.x},${188 - 12 + Math.sin(i * 0.45 + 1) * 10 + Math.cos(i * 0.25) * 5}`).join(' ')}
              fill="none"
              stroke="#ef4444"
              strokeWidth="1"
            />

            {/* crosshair */}
            <line x1="254" y1="8" x2="254" y2="148" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
            <line x1="8" y1={PY(152.4)} x2="332" y2={PY(152.4)} stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.7" />
            <rect x="248" y={PY(152.4) - 6} width="28" height="10" rx="2" fill="#10b981" opacity="0.95" />
            <text x="250" y={PY(152.4) + 2.5} fill="white" fontSize="6" fontWeight="700">152.40</text>
          </svg>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">500+ PSX tickers</span>
          <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">Draw tools &amp; Fib</span>
          <span className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">Price-axis zoom</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white">22 Awais indicators</span>
        </div>
      </div>
    </div>
  </div>
);
