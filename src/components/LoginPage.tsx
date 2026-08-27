import React, { useState } from 'react';
import { Logo } from './ui/Logo';
import { LoginAppPreview } from './LoginAppPreview';
import {
  User, LayoutDashboard, Radar, BellRing, Coins, Calculator, LineChart,
  Wallet, Sparkles, ShieldCheck, Receipt, Building2, TrendingUp, PieChart,
  Activity, CloudUpload, Smartphone, CheckCircle2, ArrowRight, Target,
  Mail, Lock, Loader2, AlertCircle, Star, Upload, FolderOpen, History, LayoutGrid,
  CandlestickChart
} from 'lucide-react';
import { signUp, signIn, isAuthConfigured } from '../services/auth';

interface LoginPageProps {
  onGuestLogin: () => void;
  onGoogleLogin: () => void;
  onAuthSuccess?: () => void; // called after a successful email login/signup
}

/* ---------- email/password auth (Supabase) ---------- */

const EmailAuth: React.FC<{ onAuthSuccess?: () => void; onGoogleLogin: () => void; onGuestLogin: () => void }> = ({ onAuthSuccess, onGoogleLogin, onGuestLogin }) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'signup-done'>('idle');
  const [msg, setMsg] = useState('');

  const inputCls = "w-full pl-10 pr-3 py-3 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:text-white transition-all";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthConfigured()) { setStatus('error'); setMsg('Login is not configured yet. Please contact the owner.'); return; }
    if (!email.trim() || !password) { setStatus('error'); setMsg('Enter your email and password.'); return; }
    if (tab === 'signup' && !name.trim()) { setStatus('error'); setMsg('Please enter your name.'); return; }
    if (tab === 'signup' && password.length < 6) { setStatus('error'); setMsg('Password must be at least 6 characters.'); return; }

    setStatus('loading'); setMsg('');
    try {
      if (tab === 'signup') {
        await signUp(name.trim(), email.trim(), password);
        setStatus('signup-done');
        setMsg("Account created! We've emailed the owner to approve you. You'll be notified when it's active.");
      } else {
        await signIn(email.trim(), password);
        onAuthSuccess?.(); // App re-checks session + approval and routes accordingly
      }
    } catch (err: any) {
      setStatus('error');
      setMsg(err?.message || 'Something went wrong. Please try again.');
    }
  };

  if (status === 'signup-done') {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl shadow-lg p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={26} />
        </div>
        <h3 className="text-xl font-display font-black tracking-tight mb-2">Request sent</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">{msg}</p>
        <button onClick={() => { setStatus('idle'); setTab('login'); setPassword(''); }} className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline">Back to log in</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-3xl shadow-lg p-7">
      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-6">
        {(['login', 'signup'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatus('idle'); setMsg(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {t === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === 'signup' && (
          <div className="relative">
            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={name} onChange={e => { setName(e.target.value); setStatus('idle'); }} placeholder="Your name" className={inputCls} />
          </div>
        )}
        <div className="relative">
          <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setStatus('idle'); }} placeholder="Email" className={inputCls} />
        </div>
        <div className="relative">
          <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setStatus('idle'); }} placeholder="Password" className={inputCls} />
        </div>

        {status === 'error' && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 flex items-start gap-2 text-rose-600 dark:text-rose-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="text-sm font-medium">{msg}</span>
          </div>
        )}

        <button type="submit" disabled={status === 'loading'} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
          {status === 'loading' ? <><Loader2 size={18} className="animate-spin" /> Please wait…</> : (tab === 'login' ? 'Log in' : 'Create account')}
        </button>
      </form>

      <p className="text-[11px] text-slate-400 text-center mt-4 leading-snug">
        {tab === 'signup'
          ? 'New accounts get a 15-day free trial after a quick owner approval.'
          : "Signed up but can't get in yet? Your account may still be pending approval."}
      </p>

      {/* Google + Guest, inside the same card */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      <button
        onClick={onGoogleLogin}
        className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:shadow-md text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl transition-all"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
        Sign in with Google
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">Recommended</span>
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-1.5">Syncs securely to your own Google Drive across devices.</p>

      <button
        onClick={onGuestLogin}
        className="w-full flex items-center justify-center gap-2 mt-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <User size={16} /> Continue as Guest
        <span className="text-[11px] font-medium text-slate-400">· local only, no sync</span>
      </button>
    </div>
  );
};

/* ---------- small building blocks ---------- */

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-3 py-1.5 rounded-full bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 text-[11px] font-bold text-slate-600 dark:text-slate-300 backdrop-blur-sm shadow-sm whitespace-nowrap">
    {children}
  </span>
);

const Feature: React.FC<{
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
  tint: string;
  badge?: string;
  highlight?: boolean;
}> = ({ Icon, title, children, tint, badge, highlight }) => (
  <div className={`rounded-2xl border p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${
    highlight
      ? 'bg-gradient-to-br from-teal-50 via-white to-emerald-50 dark:from-teal-500/15 dark:via-slate-900 dark:to-emerald-500/10 border-teal-300/80 dark:border-teal-500/40 ring-1 ring-teal-200/60 dark:ring-teal-500/20'
      : 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800/70'
  }`}>
    <div className="flex items-start justify-between gap-2 mb-4">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${tint}`}>
        <Icon size={20} />
      </div>
      {badge && (
        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-teal-600 text-white shadow-sm shadow-teal-600/30">
          {badge}
        </span>
      )}
    </div>
    <h3 className="text-base font-display font-black text-slate-900 dark:text-white mb-1.5 tracking-tight">{title}</h3>
    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{children}</p>
  </div>
);

const Check: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2.5">
    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
    <span className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{children}</span>
  </li>
);

const SectionHead: React.FC<{ eyebrow: string; title: string; sub?: string }> = ({ eyebrow, title, sub }) => (
  <div className="text-center max-w-2xl mx-auto mb-12">
    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-3">{eyebrow}</div>
    <h2 className="text-3xl md:text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight mb-3">{title}</h2>
    {sub && <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{sub}</p>}
  </div>
);

/* ---------- page ---------- */

export const LoginPage: React.FC<LoginPageProps> = ({ onGuestLogin, onGoogleLogin, onAuthSuccess }) => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] font-sans text-slate-900 dark:text-white selection:bg-emerald-200 dark:selection:bg-emerald-900 overflow-x-hidden">

      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="scale-[0.55] -ml-4 -my-4"><Logo /></div>
            <span className="font-display font-black tracking-tight text-lg">PSX Tracker</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-bold text-slate-500 dark:text-slate-400">
            <button onClick={() => scrollTo('features')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollTo('tools')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Tools</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</button>
            <button onClick={() => scrollTo('privacy')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy</button>
          </nav>
          <button
            onClick={() => scrollTo('start')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:-translate-y-0.5"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative px-5 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] bg-emerald-400/10 dark:bg-emerald-600/10 rounded-full blur-[130px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-teal-400/10 dark:bg-teal-600/10 rounded-full blur-[130px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-black uppercase tracking-widest mb-7">
            <Activity size={13} /> Built for Pakistan Stock Exchange
          </div>

          <h1 className="text-4xl md:text-6xl font-display font-black tracking-tight leading-[1.1] mb-6">
            Track your PSX portfolio<br className="hidden md:block" /> like a professional
          </h1>

          <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto mb-9">
            Live PSX prices, true FIFO cost basis, realized P&amp;L with CGT, dividends,
            and market tools — plus full <span className="font-bold text-teal-700 dark:text-teal-400">mutual fund tracking</span> with MUFAP NAVs and daily P&amp;L,
            and <span className="font-bold text-emerald-700 dark:text-emerald-400">TradingView-style charts</span> for 500+ tickers.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <button
              onClick={() => scrollTo('start')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              Start Free <ArrowRight size={18} />
            </button>
            <button
              onClick={() => scrollTo('features')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-bold px-7 py-3.5 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              Explore Features
            </button>
          </div>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-12">✓ 15-day free trial · no card required</p>

          <div className="flex flex-wrap gap-2 justify-center mb-8">
            <Pill>Live PSX Prices</Pill>
            <span className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-black tracking-wide shadow-md shadow-emerald-600/25 whitespace-nowrap">
              ★ PSX Charts · New
            </span>
            <span className="px-3 py-1.5 rounded-full bg-teal-600 text-white text-[11px] font-black tracking-wide shadow-md shadow-teal-600/25 whitespace-nowrap">
              ★ Mutual Funds · Extra
            </span>
            <Pill>Holdings &amp; History</Pill>
            <Pill>Watchlist</Pill>
            <Pill>Market Signals</Pill>
            <Pill>Price Alerts</Pill>
            <Pill>Dividend Scanner</Pill>
            <Pill>Board Meetings</Pill>
            <Pill>Realized P&amp;L + CGT</Pill>
            <Pill>Fair Value Calc</Pill>
            <Pill>Trading Simulator</Pill>
            <Pill>vs KSE-100 &amp; KMI-30</Pill>
            <Pill>Trade Import</Pill>
            <Pill>Drive Sync</Pill>
            <Pill>Guest Mode</Pill>
          </div>

          <div className="max-w-2xl mx-auto rounded-2xl border border-teal-200/80 dark:border-teal-500/30 bg-gradient-to-r from-teal-50/90 to-emerald-50/80 dark:from-teal-500/10 dark:to-emerald-500/10 px-5 py-4 text-left shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-600/30">
                <Wallet size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-display font-black text-slate-900 dark:text-white tracking-tight">Mutual Fund Portfolios</span>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-600 text-white">Extra Feature</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Track open-end funds alongside stocks — MUFAP NAV sync, units &amp; cost basis, and true day-over-day fund P&amp;L from today vs yesterday NAV.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto mt-10">
          <LoginAppPreview />
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="px-5 py-20 bg-white/60 dark:bg-slate-900/20 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            eyebrow="Everything You Need"
            title="A complete PSX toolkit"
            sub="From daily tracking to trade planning — every number computed properly, not estimated."
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Feature
              Icon={Wallet}
              title="Mutual Fund Tracking"
              tint="bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30"
              badge="Extra"
              highlight
            >
              Dedicated fund portfolios with MUFAP NAV sync, units &amp; average cost, and daily P&amp;L from today vs yesterday NAV — not just stock tracking.
            </Feature>

            <Feature
              Icon={CandlestickChart}
              title="PSX Charts Explorer"
              tint="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
              badge="New"
              highlight
            >
              Full-screen candlesticks for 500+ tickers — trend lines, Fib retracement, price-axis zoom, and your open + realized P&amp;L overlaid on the chart.
            </Feature>

            <Feature Icon={LayoutDashboard} title="Live Dashboard" tint="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">
              Net worth, today's P&amp;L, total return and a portfolio health score — with KSE-100, KMI-30 and USD/PKR at the top. Layout is customizable.
            </Feature>

            <Feature Icon={FolderOpen} title="Holdings &amp; History" tint="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700">
              Full open positions with avg cost, and a complete ledger of buys, sells, dividends, cash, fees and portfolio transfers.
            </Feature>

            <Feature Icon={Radar} title="Market Signals" tint="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20">
              Scan the market, KSE-100 or KMI-30 for buy/sell signals using SMA, EMA, RSI and MACD — with buy range, stop loss and take-profit.
            </Feature>

            <Feature Icon={Star} title="Watchlist" tint="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20">
              Follow names you don't hold yet. Live PSX quotes, day change, and a one-tap jump into the stock profile.
            </Feature>

            <Feature Icon={BellRing} title="Price Alerts" tint="bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-500/20">
              Signed-in users can set above/below targets and get a push when the price hits — even if the app is closed. Guest Mode cannot save alerts.
            </Feature>

            <Feature Icon={Coins} title="Dividend Tracking" tint="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20">
              Scan for dividends you're eligible for. Face-value math for Rs. 10, 5, 3.5 and 1 stocks, with WHT handled. Upcoming payouts on the dashboard.
            </Feature>

            <Feature Icon={Receipt} title="Realized P&amp;L &amp; CGT" tint="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20">
              FIFO lot matching with same-day trade squaring. Profit factor, expectancy, win rate, monthly heatmap and net-of-CGT figures.
            </Feature>

            <Feature Icon={TrendingUp} title="Benchmark vs Index" tint="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-100 dark:border-teal-500/20">
              See whether you're beating KSE-100 and KMI-30 today, this week or this month — plus a 30-day daily return chart.
            </Feature>

            <Feature Icon={PieChart} title="Allocation &amp; Insights" tint="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20">
              Sector and stock allocation, concentration, fee drag, cash drag, and ranked best/worst holdings and sold trades.
            </Feature>

            <Feature Icon={Building2} title="Brokers &amp; Portfolios" tint="bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-100 dark:border-cyan-500/20">
              Per-broker commission slabs, SST and CDC in your cost basis. Multiple portfolios, with transfers at the first broker's buy cost.
            </Feature>

            <Feature Icon={Upload} title="Trade Import" tint="bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-100 dark:border-lime-500/20">
              Add trades by hand, Excel/CSV, screenshot OCR, Gemini scan, or Gmail attachments from your broker.
            </Feature>

            <Feature Icon={CloudUpload} title="Google Drive Sync" tint="bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/20">
              Portfolio data syncs to your own Google Drive (and a Sheet). Guest Mode stays on this device only.
            </Feature>
          </div>
        </div>
      </section>

      {/* ================= TOOLS ================= */}
      <section id="tools" className="px-5 py-20">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            eyebrow="Advanced Tools"
            title="Plan before you trade"
            sub="Research, value and rehearse your decisions without risking a rupee."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="bg-gradient-to-br from-emerald-50/90 to-white dark:from-emerald-500/10 dark:to-slate-900 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/30 p-6 shadow-sm ring-1 ring-emerald-500/10">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white border border-emerald-500/30 flex items-center justify-center mb-4 shadow-md shadow-emerald-600/20">
                <CandlestickChart size={20} />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-display font-black text-lg tracking-tight">Charts Explorer</h3>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-600 text-white">New</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Research any PSX stock with candlesticks, volume, and draw tools — with your portfolio P&amp;L in view.</p>
              <ul className="space-y-2">
                <Check>500+ tickers · Day / Week / Month</Check>
                <Check>Fib, trend lines &amp; price-axis zoom</Check>
                <Check>Open + realized P&amp;L on chart</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mb-4">
                <Calculator size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Fair Value Calculator</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Estimate what a stock is actually worth before you buy.</p>
              <ul className="space-y-2">
                <Check>Fundamentals from PSX</Check>
                <Check>EPS &amp; book value based</Check>
                <Check>Upside vs market price</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center mb-4">
                <LineChart size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Trading Simulator</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Test a trade with real commission maths before committing.</p>
              <ul className="space-y-2">
                <Check>Your broker's charges</Check>
                <Check>Break-even price</Check>
                <Check>Profit at target</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center mb-4">
                <Target size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Stock &amp; Sector Profile</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Drill into any ticker or sector you hold.</p>
              <ul className="space-y-2">
                <Check>Lifetime return per stock</Check>
                <Check>Open vs closed split</Check>
                <Check>Sector roll-up</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center mb-4">
                <Sparkles size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">PSX Assistant</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Ask about your portfolio — it looks up live data before answering.</p>
              <ul className="space-y-2">
                <Check>Reads your real holdings</Check>
                <Check>Live prices &amp; technicals</Check>
                <Check>Your own Gemini API key</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20 flex items-center justify-center mb-4">
                <History size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Transaction History</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Every cash and trade event in one searchable list.</p>
              <ul className="space-y-2">
                <Check>Buy, sell, dividend, CGT</Check>
                <Check>Deposits &amp; withdrawals</Check>
                <Check>Export to Excel / CSV</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/20 flex items-center justify-center mb-4">
                <LayoutGrid size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Dashboard Layout</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Show, hide and resize cards for desktop and mobile.</p>
              <ul className="space-y-2">
                <Check>Drag-and-drop grid</Check>
                <Check>Separate mobile layout</Check>
                <Check>Top movers &amp; board meetings</Check>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================= ACCURACY ================= */}
      <section className="px-5 py-20 bg-white/60 dark:bg-slate-900/20 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-3">Accuracy First</div>
            <h2 className="text-3xl md:text-4xl font-display font-black tracking-tight mb-4">Numbers you can actually trust</h2>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Most trackers approximate. This one models the details that change your real return —
              because a wrong cost basis quietly ruins every number after it.
            </p>
            <ul className="space-y-3">
              <Check><strong className="text-slate-700 dark:text-slate-200">FIFO lot matching</strong> — sells match your oldest lots, the way CGT is actually assessed.</Check>
              <Check><strong className="text-slate-700 dark:text-slate-200">Day trades squared off</strong> — same-day buy/sell nets out instead of polluting your average cost.</Check>
              <Check><strong className="text-slate-700 dark:text-slate-200">Fees in cost basis</strong> — commission, sales tax and CDC included per share.</Check>
              <Check><strong className="text-slate-700 dark:text-slate-200">Face-value dividends</strong> — Rs. 10, 5, 3.5 and 1 stocks calculated correctly.</Check>
              <Check><strong className="text-slate-700 dark:text-slate-200">XIRR &amp; ROI</strong> — money-weighted return and total return vs peak capital invested.</Check>
            </ul>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-lg">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sample Holding</div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-display font-black text-2xl">LUCK</span>
              <span className="text-2xl font-display font-black tabular-nums text-emerald-600 dark:text-emerald-400">+17.95%</span>
            </div>
            <div className="text-xs text-slate-400 mb-5">150 shares · Now Rs. 920.00 · Avg cost Rs. 780.00</div>
            <div className="space-y-3 pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Open position</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+Rs. 21,000.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Realized (day trade)</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+Rs. 2,480.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Dividends received</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+Rs. 3,750.00</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold">Lifetime return</span>
                <span className="font-display font-black tabular-nums text-emerald-600 dark:text-emerald-400">+23.26%</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 leading-snug">
              Open, closed and dividend performance kept separate — so one number never hides another.
            </p>
          </div>
        </div>
      </section>

      {/* ================= PRIVACY ================= */}
      <section id="privacy" className="px-5 py-20">
        <div className="max-w-5xl mx-auto">
          <SectionHead
            eyebrow="Your Data, Your Control"
            title="Private by design"
            sub="Your trades stay with you. We don't run ads or sell portfolio data."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Feature Icon={ShieldCheck} title="Your portfolio, your store" tint="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">
              Holdings sync to your Google Drive (or stay in this browser in Guest Mode). We don't keep a copy of your trades on our servers.
            </Feature>
            <Feature Icon={User} title="Guest Mode" tint="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
              Start instantly with zero sign-up. Everything stays on this device. Sign in if you want Drive sync and price alerts.
            </Feature>
            <Feature Icon={Smartphone} title="Installable App" tint="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20">
              Add to your home screen and it works like a native app, including offline viewing.
            </Feature>
            <Feature Icon={Wallet} title="15-Day Free Trial" tint="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20">
              Try the full tracker free for 15 days after approval. Then monthly, yearly, or lifetime.
            </Feature>
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="px-5 py-20 bg-white/60 dark:bg-slate-900/20 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-5xl mx-auto">
          <SectionHead
            eyebrow="Pricing"
            title="Simple, honest pricing"
            sub="Start with a 15-day free trial — no card needed. Then pick a plan: the longer you commit, the less you pay per month."
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { label: '1 Month', pm: '500', total: '500', save: null as string | null, best: false },
              { label: '3 Months', pm: '400', total: '1,200', save: '20% off', best: false },
              { label: '1 Year', pm: '350', total: '4,200', save: '30% off', best: true },
            ].map(p => (
              <div key={p.label} className={`relative rounded-3xl border p-6 text-center shadow-sm ${p.best ? 'border-emerald-400 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5 shadow-lg' : 'border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900'}`}>
                {p.best && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md">Best value</span>}
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{p.label}</div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-display font-black text-slate-900 dark:text-white tracking-tight">Rs. {p.pm}</span>
                  <span className="text-sm font-bold text-slate-400">/mo</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">Rs. {p.total} billed</div>
                {p.save
                  ? <div className="mt-3 inline-block text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">Save {p.save}</div>
                  : <div className="mt-3 inline-block text-[11px] font-bold text-slate-400 px-2.5 py-1">Pay monthly</div>}
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-8 max-w-2xl mx-auto leading-relaxed">
            Lifetime access is available too. Pay via Naya Pay, bank transfer, or Jazz Cash, email the receipt — your account is activated as soon as it's confirmed.
          </p>
        </div>
      </section>

      {/* ================= START / SIGN IN ================= */}
      <section id="start" className="px-5 py-20 bg-white/60 dark:bg-slate-900/20 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-3xl mx-auto">
          <SectionHead eyebrow="Get Started" title="Start your 15-day free trial" sub="Create an account (a quick owner approval), sign in with Google, or use Guest Mode — no sign-up needed." />

          {/* Email / password + Google + Guest, all in one card */}
          <EmailAuth onAuthSuccess={onAuthSuccess} onGoogleLogin={onGoogleLogin} onGuestLogin={onGuestLogin} />
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="px-5 py-12 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5 mb-8">
            <div className="flex items-center gap-2.5">
              <div className="scale-[0.5] -ml-5 -my-5"><Logo /></div>
              <span className="font-display font-black tracking-tight">PSX Portfolio Tracker</span>
            </div>
            <p className="text-xs text-slate-400 text-center md:text-right">
              Built for Pakistan Stock Exchange investors.
            </p>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed text-center max-w-3xl mx-auto">
            For educational and informational purposes only. Nothing here is financial, investment or trading advice,
            and no content is a recommendation to buy or sell any security. Market data may be delayed or inaccurate.
            Signals and calculators are research aids, not predictions — always do your own research and consult a
            qualified financial advisor before investing.
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-6">
            © {new Date().getFullYear()} PSX Portfolio Tracker
          </p>
        </div>
      </footer>
    </div>
  );
};
