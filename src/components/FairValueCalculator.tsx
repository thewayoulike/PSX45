import React from 'react';
import { Activity, Calculator, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { Card } from './ui/Card';
import { useFreemium } from './FreemiumContext';
import { consumeDailyQuota } from '../utils/freemiumQuotas';
import { calculateFairValue, compareEstimate, validTicker, type Calculation, type InputField } from '../utils/fairValue';
import { useFairValueResearch, type ResearchCacheSetter } from './useFairValueResearch';

interface FairValueCalculatorProps {
  cache: Record<string, any>;
  onSaveCache: ResearchCacheSetter;
}

const format = (value: number) => value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString() : 'date unknown';
const inputStyle = 'w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2.5 text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const buttonStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

export const FairValueCalculator: React.FC<FairValueCalculatorProps> = ({ cache, onSaveCache }) => {
  const { isFree, quotas, requestUpgrade } = useFreemium();
  const state = useFairValueResearch(cache, onSaveCache);
  const { research, ticker, busy, message, dirty } = state;
  const { inputs, sources, reportedDividend } = research;
  const results = calculateFairValue(inputs);

  function input(field: InputField, label: string, help?: string) {
    const source = sources[field];
    return (
      <div className="min-w-0" key={field}>
        <label htmlFor={`fv-${field}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{label}</label>
        <input id={`fv-${field}`} name={field} type="number" inputMode="decimal" step="any" autoComplete="off"
          className={inputStyle} value={inputs[field]} onChange={event => state.edit(field, event.target.value)}
          aria-describedby={`fv-${field}-help`} />
        <div id={`fv-${field}-help`} className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {help && <p>{help}</p>}
          {source && <p>{source.name} · {source.name === 'Entered manually' ? 'edited' : 'retrieved'} {dateLabel(source.retrievedAt)}</p>}
        </div>
      </div>
    );
  }

  const estimates: { name: string; result: Calculation; formula: string; description: string }[] = [
    { name: 'P/E estimate', result: results.peValue, formula: 'EPS × target P/E', description: 'Use a target multiple supported by comparable earnings quality, growth, payout and risk. Current market P/E is shown separately below.' },
    { name: 'Constant-dividend estimate', result: results.dividendValue, formula: 'Annual dividend ÷ (required return / 100)', description: 'Assumes the same annual dividend continues forever, with no dividend growth. Earnings growth does not affect this estimate. A zero-dividend result is not the total value of a business.' },
    { name: 'Graham number', result: results.grahamValue, formula: '√(22.5 × EPS × book value per share)', description: 'A traditional earnings-and-assets screening reference. It does not assess earnings quality, future growth or the safety of an investment.' },
  ];
  const ratios: { name: string; result: Calculation; suffix: string; description: string }[] = [
    { name: 'Current P/E', result: results.pe, suffix: '×', description: 'Entered price ÷ EPS. Compare companies with similar earnings periods and business characteristics.' },
    { name: 'Assumed dividend yield', result: results.dividendYield, suffix: '%', description: 'Your assumed annual dividend ÷ entered price. Future dividends can change.' },
    { name: 'Liabilities / equity', result: results.liabilitiesToEquity, suffix: '×', description: 'Total liabilities ÷ equity. This includes non-debt liabilities; it is not a bankruptcy test.' },
    { name: 'PEG', result: results.peg, suffix: '×', description: 'Current P/E ÷ expected earnings growth in percentage points. Below 1 alone does not prove undervaluation.' },
    { name: 'One-year projected P/E', result: results.forwardPE, suffix: '×', description: 'Entered price ÷ [EPS × (1 + your growth / 100)]. This uses your scenario, not an analyst forecast.' },
    { name: 'Current ratio', result: results.currentRatio, suffix: '×', description: 'Current assets ÷ current liabilities. Appropriate liquidity levels depend on the business and sector.' },
    { name: 'Simplified quick ratio', result: results.quickRatio, suffix: '×', description: '(Current assets − inventory) ÷ current liabilities. Other non-liquid assets, such as prepayments, have not been excluded.' },
  ];

  return (
    <div className="space-y-5 w-full min-w-0 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-bold">Fair value calculator</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Compare estimates using company figures and your own assumptions. Results are conditional estimates, not price targets or guarantees.</p>
      </div>

      <Card title="Company figures" icon={<Calculator size={18} />}>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="fv-ticker" className="block text-sm font-semibold mb-1.5">PSX symbol</label>
            <input id="fv-ticker" name="ticker" placeholder="e.g. OGDC" value={ticker} maxLength={15} spellCheck={false} autoComplete="off" className={inputStyle}
              onChange={event => state.changeTicker(event.target.value)} />
          </div>
          <button type="button" disabled={!validTicker(ticker) || busy} className={`${buttonStyle} bg-emerald-600 text-white hover:bg-emerald-700`}
            onClick={() => state.refresh(() => {
              if (!isFree || consumeDailyQuota('fairValue', quotas.fairValuePerDay ?? 4).ok) return true;
              requestUpgrade(); return false;
            })}>
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />{busy ? 'Refreshing…' : 'Refresh company figures'}
          </button>
          <button type="button" disabled={!validTicker(ticker) || (!dirty && !research.needsReview)} onClick={state.save}
            className={`${buttonStyle} border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800`}>
            <Save size={16} />Save research
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {dirty ? 'Unsaved edits. Save research to keep them for next time.' : research.savedAt ? `Research saved ${dateLabel(research.savedAt)}. Saved figures may be out of date; refresh to check available sources.` : 'Enter figures manually, or choose a symbol and refresh.'}
          {isFree && ` Free plan: ${quotas.fairValuePerDay ?? 4} refresh attempts per day. Viewing saved research and manual calculations do not use this limit.`}
        </p>
        {ticker && !validTicker(ticker) && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Use a PSX symbol such as OGDC, without spaces.</p>}
        <div role="status" aria-live="polite" className={message ? 'mt-3 rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-sm leading-relaxed' : ''}>{message}</div>
        {research.needsReview && <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">Older saved figures have no verified dates. Re-enter your assumptions: the previous calculator could copy market P/E and reported dividends into them automatically. Refresh the figures, review them, then save.</p>}
        <p className="my-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Source dates below show when figures were retrieved, not when accounts were published or a trade occurred. The fundamentals feed does not identify its reporting period. Verify annual or TTM EPS and book value against published accounts before relying on an estimate.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {input('price', 'Share price (PKR)', 'The market quote takes priority over the feed price; either may be delayed.')}
          {input('eps', 'EPS (PKR per share)', 'Use annual or trailing 12-month earnings. Auto-filled period is unverified.')}
          {input('bookValue', 'Book value (PKR per share)', 'Use equity attributable to ordinary shareholders per share.')}
        </div>
      </Card>

      <Card title="Your valuation assumptions" icon={<SlidersHorizontal size={18} />}>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">These stay under your control. Refresh never replaces them with market multiples, feed dividends or default rates.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {input('fairPE', 'Target P/E (×)', 'Choose a justified multiple for the EPS period above. It is not the current market P/E.')}
          {input('expectedDiv', 'Annual dividend (PKR per share)', 'Enter the annual cash dividend you expect, not a percentage of face value or an interim payment.')}
          {input('requiredReturn', 'Required annual return (%)', 'Your required equity return, including the risk you assume. Must be above 0%.')}
          {input('cagr', 'Expected earnings growth (%)', 'Used only for PEG and one-year projected P/E. Enter 0 for no growth.')}
        </div>
        {reportedDividend && <p className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Feed-reported dividend: <strong>{format(reportedDividend.value)}</strong> · retrieved {dateLabel(reportedDividend.retrievedAt)}. Its units and period are unverified, so it has not been used as your annual dividend. Confirm and convert it using the company’s dividend announcement first.</p>}
      </Card>

      <section aria-label="Valuation estimates" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {estimates.map(({ name, result, formula, description }) => (
          <article key={name} className="min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-semibold text-base">{name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{formula}</p>
            <p className="my-3 text-2xl font-bold break-words tabular-nums">{result.value === null ? 'Not available' : `Rs. ${format(result.value)}`}</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{result.reason ?? compareEstimate(result.value, inputs.price)}</p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          </article>
        ))}
      </section>
      <p className="text-xs text-slate-500 dark:text-slate-400">Upside/downside is (estimate − entered price) ÷ entered price. It is not the discount to estimated value.</p>

      <Card title="Balance sheet figures" icon={<Activity size={18} />}>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Use the same reporting date and scale for all amounts (for example, all in PKR millions). The feed’s scale and reporting date are unverified. Ratios are not directly comparable across sectors, especially banks and non-financial companies.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {input('liabilities', 'Total liabilities')}
          {input('equity', 'Total equity')}
          {input('currentAssets', 'Current assets')}
          {input('currentLiabilities', 'Current liabilities')}
          {input('inventory', 'Inventory')}
        </div>
      </Card>

      <section aria-label="Financial ratios" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {ratios.map(({ name, result, suffix, description }) => (
          <article key={name} className="min-w-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold">{name}</h2>
            <p className="my-2 text-xl font-bold break-words tabular-nums">{result.value === null ? 'Not available' : `${format(result.value)}${suffix}`}</p>
            {result.reason && <p className="text-sm mb-2 text-amber-700 dark:text-amber-300">{result.reason}</p>}
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          </article>
        ))}
      </section>
      <p className="text-xs text-slate-500 dark:text-slate-400">Method references: <a className="underline" href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/pe.html" target="_blank" rel="noreferrer">NYU Stern: P/E and PEG</a> · <a className="underline" href="https://openstax.org/books/principles-finance-2e/pages/11-2-dividend-discount-models-ddms" target="_blank" rel="noreferrer">OpenStax: dividend models</a></p>
    </div>
  );
};
