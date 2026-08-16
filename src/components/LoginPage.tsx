import React, { useState } from 'react';
import { Logo } from './ui/Logo';
import {
  User, LayoutDashboard, Radar, BellRing, Coins, Calculator, LineChart,
  Wallet, Sparkles, ShieldCheck, Receipt, Building2, TrendingUp, PieChart,
  Activity, CloudUpload, Smartphone, CheckCircle2, ArrowRight, Target,
  Mail, Lock, Loader2, AlertCircle
} from 'lucide-react';
import { signUp, signIn, isAuthConfigured } from '../services/auth';

interface LoginPageProps {
  onGuestLogin: () => void;
  onGoogleLogin: () => void;
  onAuthSuccess?: () => void; // called after a successful email login/signup
}

/* ---------- email/password auth (Supabase) ---------- */

const EmailAuth: React.FC<{ onAuthSuccess?: () => void }> = ({ onAuthSuccess }) => {
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
          ? 'New accounts need owner approval before first login.'
          : "Signed up but can't get in yet? Your account may still be pending approval."}
      </p>
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
}> = ({ Icon, title, children, tint }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 border ${tint}`}>
      <Icon size={20} />
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
            Live prices, true FIFO cost basis, realized P&amp;L with CGT, dividend tracking,
            technical buy/sell signals and price alerts — in one fast, private web app.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <button
              onClick={onGoogleLogin}
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

          <div className="flex flex-wrap gap-2 justify-center">
            <Pill>Live PSX Prices</Pill>
            <Pill>Buy / Sell Signals</Pill>
            <Pill>Price Alerts</Pill>
            <Pill>Dividend Scanner</Pill>
            <Pill>Realized P&amp;L + CGT</Pill>
            <Pill>vs KSE-100 &amp; KMI-30</Pill>
            <Pill>Drive Sync</Pill>
          </div>
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
            <Feature Icon={LayoutDashboard} title="Live Dashboard" tint="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">
              Net worth, today's P&amp;L, total return and a portfolio health score — with KSE-100, KMI-30 and USD/PKR live at the top.
            </Feature>

            <Feature Icon={Radar} title="Market Signal Scanner" tint="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20">
              Scan the whole market, KSE-100 or KMI-30 for buy and sell signals using SMA, EMA, RSI and MACD — with buy range, stop loss and take-profit levels.
            </Feature>

            <Feature Icon={BellRing} title="Price Alerts" tint="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20">
              Set above/below targets and get a push notification the moment a stock hits your price — even when the app is closed.
            </Feature>

            <Feature Icon={Coins} title="Dividend Tracking" tint="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20">
              Scan for dividends you're eligible for and never miss income. Correct face-value math for Rs. 10, 5, 3.5 and 1 stocks, with WHT handled.
            </Feature>

            <Feature Icon={Receipt} title="Realized P&amp;L &amp; CGT" tint="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20">
              True FIFO lot matching with same-day trade squaring. Profit factor, expectancy, win rate, monthly heatmap and net-of-CGT figures.
            </Feature>

            <Feature Icon={TrendingUp} title="Benchmark vs Index" tint="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-100 dark:border-teal-500/20">
              See whether you're beating KSE-100 and KMI-30 today, this week or this month — with a daily return chart.
            </Feature>

            <Feature Icon={PieChart} title="Allocation &amp; Insights" tint="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20">
              Sector and stock allocation, concentration warnings, fee drag, cash drag and ranked insights that tell you what actually matters.
            </Feature>

            <Feature Icon={Building2} title="Multi-Broker Support" tint="bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-100 dark:border-cyan-500/20">
              Per-broker commission slabs, sales tax and CDC charges baked into your cost basis. Transfer stock between brokers cleanly.
            </Feature>

            <Feature Icon={CloudUpload} title="Google Drive Sync" tint="bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-500/20">
              Your portfolio syncs to your own Google Drive, so you can pick up on any device — or stay fully offline in Guest Mode.
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
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
                <Check>Real broker charges</Check>
                <Check>Break-even price</Check>
                <Check>Profit at target</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center mb-4">
                <Target size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">Stock Analyzer</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Drill into any ticker you hold, lifetime.</p>
              <ul className="space-y-2">
                <Check>Lifetime return per stock</Check>
                <Check>Open vs closed split</Check>
                <Check>Full transaction history</Check>
              </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center mb-4">
                <Sparkles size={20} />
              </div>
              <h3 className="font-display font-black text-lg tracking-tight mb-2">PSX AI Assistant</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Ask questions about your portfolio — it looks up live data before answering.</p>
              <ul className="space-y-2">
                <Check>Reads your real holdings</Check>
                <Check>Live prices &amp; technicals</Check>
                <Check>Bring your own API key</Check>
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
              <Check><strong className="text-slate-700 dark:text-slate-200">XIRR &amp; ROI</strong> — money-weighted returns, with and without dividends.</Check>
            </ul>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800/70 p-6 shadow-lg">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sample Holding</div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-display font-black text-2xl">MACTER</span>
              <span className="text-2xl font-display font-black tabular-nums text-rose-500">−32.15%</span>
            </div>
            <div className="text-xs text-slate-400 mb-5">143 shares · Avg cost Rs. 410.65</div>
            <div className="space-y-3 pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Open position</span>
                <span className="font-bold tabular-nums text-rose-500">−18,877</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Realized (day trade)</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+922</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Dividends received</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+170</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm font-bold">Lifetime return</span>
                <span className="font-display font-black tabular-nums text-rose-500">−17.24%</span>
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
            sub="No accounts on our servers, no tracking, no ads. Your portfolio belongs to you."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Feature Icon={ShieldCheck} title="No Middleman" tint="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20">
              Data lives in your browser or your own Google Drive — never on a server we own.
            </Feature>
            <Feature Icon={User} title="Guest Mode" tint="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
              Start instantly with zero sign-up. Everything stays on this device.
            </Feature>
            <Feature Icon={Smartphone} title="Installable App" tint="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-500/20">
              Add to your home screen and it works like a native app, offline included.
            </Feature>
            <Feature Icon={Wallet} title="Free to Use" tint="bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20">
              No subscription, no paywalled features, no hidden limits.
            </Feature>
          </div>
        </div>
      </section>

      {/* ================= START / SIGN IN ================= */}
      <section id="start" className="px-5 py-20 bg-white/60 dark:bg-slate-900/20 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-3xl mx-auto">
          <SectionHead eyebrow="Get Started" title="Log in or create an account" sub="New accounts need a quick owner approval. Prefer no account? Use Guest Mode below." />

          {/* Email / password auth */}
          <EmailAuth onAuthSuccess={onAuthSuccess} />

          <div className="flex items-center gap-3 my-8 max-w-md mx-auto">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">or</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          </div>

          <div className="flex flex-col md:flex-row gap-5 justify-center">
            {/* Google */}
            <button
              onClick={onGoogleLogin}
              className="group relative bg-white dark:bg-slate-900 border-2 border-emerald-500/30 dark:border-emerald-500/30 p-8 rounded-3xl shadow-lg hover:shadow-xl hover:border-emerald-500/60 transition-all hover:-translate-y-1 w-full md:w-80 flex flex-col items-center text-center"
            >
              <span className="absolute -top-3 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md">Recommended</span>
              <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-100 dark:border-slate-700/50 group-hover:scale-110 transition-transform duration-300">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10 drop-shadow-sm" alt="Google" />
              </div>
              <h3 className="text-xl font-display font-black mb-2 tracking-tight">Sign in with Google</h3>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Sync your portfolio securely across all your devices using your own Drive.
              </p>
            </button>

            {/* Guest */}
            <button
              onClick={onGuestLogin}
              className="group bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 p-8 rounded-3xl shadow-sm hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all hover:-translate-y-1 w-full md:w-80 flex flex-col items-center text-center"
            >
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700/50 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all duration-300 group-hover:scale-110 shadow-sm">
                <User size={36} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-display font-black mb-2 tracking-tight">Guest Mode</h3>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Start using it immediately. Data is stored locally on this device.
              </p>
            </button>
          </div>
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
