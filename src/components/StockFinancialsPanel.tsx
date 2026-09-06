import React from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import type { CompanyInfoData, FundamentalsData } from '../services/financials';
import {
  equitySnapshotFromSections,
  formatCompactPkAmount,
  parsePercentValue,
} from '../utils/companyInfoParse';

interface StockStatsLite {
  ticker: string;
  ownedQty: number;
  dividendCount: number;
  dividendYieldOnCost: number;
  netDividends: number;
}

interface Props {
  companyInfo: CompanyInfoData | null;
  displayFinancials: FundamentalsData['annual'] | null;
  financialPeriod: 'Annual' | 'Quarterly';
  onPeriodChange: (p: 'Annual' | 'Quarterly') => void;
  loading: boolean;
  onRefresh: () => void;
  currentPrice: number;
  selectedStockStats: StockStatsLite | null;
  formatCurrency: (n: number) => string;
}

/** Every financial block is its own card. */
export const StockFinancialsPanel: React.FC<Props> = ({
  companyInfo,
  displayFinancials,
  financialPeriod,
  onPeriodChange,
  loading,
  onRefresh,
  currentPrice,
  selectedStockStats,
  formatCurrency,
}) => {
  const equitySnap = equitySnapshotFromSections(companyInfo?.fundamentals || []);
  const companyYieldPct = parsePercentValue(companyInfo?.latestDividend?.dividendYield);

  const annualRatios =
    companyInfo?.statements?.annual?.ratios?.length
      ? companyInfo.statements.annual.ratios
      : displayFinancials?.ratios?.length
        ? displayFinancials.ratios
        : [];

  const showKeyRatios = annualRatios.length > 0;

  const hasAny =
    !!displayFinancials?.financials?.length ||
    showKeyRatios ||
    !!companyInfo?.latestDividend ||
    (companyInfo?.dividendHistory?.length ?? 0) > 0 ||
    (companyInfo?.reports?.length ?? 0) > 0 ||
    (companyInfo?.statements?.annual?.financials?.length ?? 0) > 0;

  const periodToggle = (
    <div className="flex items-center gap-2">
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => onPeriodChange('Annual')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            financialPeriod === 'Annual'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Annual
        </button>
        <button
          type="button"
          onClick={() => onPeriodChange('Quarterly')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            financialPeriod === 'Quarterly'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Quarterly
        </button>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <FileText size={20} />
          </div>
          <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">
            Company Financials
          </h3>
        </div>
      </div>

      {loading && (
        <Card className="!p-12 flex items-center justify-center gap-3 text-slate-400 font-medium text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading financials…
        </Card>
      )}

      {!loading && !hasAny && (
        <Card className="!p-12 text-center text-slate-400 font-medium text-sm">
          No {financialPeriod.toLowerCase()} data available for this company.
        </Card>
      )}

      {!loading && (equitySnap.marketCapRaw || companyInfo?.latestDividend || companyInfo?.statements?.annual?.financials?.[0]) && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Snapshot</h4>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {(
              [
                [
                  'Price',
                  currentPrice > 0
                    ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '—',
                ],
                ['Mkt cap', formatCompactPkAmount(equitySnap.marketCapRaw, { unitIsThousands: true })],
                ['Yield', companyInfo?.latestDividend?.dividendYield || '—'],
                [
                  'EPS (latest)',
                  companyInfo?.statements?.annual?.financials?.[0]?.eps ||
                    displayFinancials?.financials?.[0]?.eps ||
                    '—',
                ],
                ['Free float', equitySnap.freeFloatPct || '—'],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {label}
                </div>
                <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && companyInfo?.latestDividend && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Latest Dividend
            </h4>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {(
              [
                ['Cash', companyInfo.latestDividend.cashAmount || companyInfo.dividendHistory?.[0]?.cashAmount || '—'],
                ['Yield', companyInfo.latestDividend.dividendYield],
                ['Annual', companyInfo.latestDividend.annualDividend],
                ['Ex-date', companyInfo.latestDividend.exDividendDate],
                ['Frequency', companyInfo.latestDividend.payoutFrequency],
                ['Payout ratio', companyInfo.latestDividend.payoutRatio],
                ['Growth', companyInfo.latestDividend.dividendGrowth],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {label}
                </div>
                <div
                  className={`mt-1 text-sm font-bold font-mono tabular-nums ${
                    label === 'Cash'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {value || '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading &&
        selectedStockStats &&
        (selectedStockStats.dividendCount > 0 || selectedStockStats.ownedQty > 0) && (
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
              <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Your dividends vs company
              </h4>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Yield on cost
                  </div>
                  <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {selectedStockStats.dividendYieldOnCost.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Company yield
                  </div>
                  <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {companyYieldPct != null ? `${companyYieldPct.toFixed(2)}%` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Net received
                  </div>
                  <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(selectedStockStats.netDividends)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Payouts
                  </div>
                  <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {selectedStockStats.dividendCount}
                  </div>
                </div>
              </div>
              {companyYieldPct != null && (
                <p className="mt-3 text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                  Your yield on cost is{' '}
                  <span className="font-bold tabular-nums">
                    {selectedStockStats.dividendYieldOnCost - companyYieldPct >= 0 ? '+' : ''}
                    {(selectedStockStats.dividendYieldOnCost - companyYieldPct).toFixed(2)}pp
                  </span>{' '}
                  vs the company’s trailing yield.
                </p>
              )}
            </div>
          </Card>
        )}

      {!loading && companyInfo && companyInfo.dividendHistory.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Dividend History
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Ex-dividend date</th>
                  <th className="px-5 py-3.5 text-right">Cash amount</th>
                  <th className="px-5 py-3.5">Record date</th>
                  <th className="px-5 py-3.5">Pay date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                {companyInfo.dividendHistory.map((row, i) => (
                  <tr
                    key={`${row.exDividendDate}-${i}`}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      i === 0 ? 'bg-emerald-50/40 dark:bg-emerald-500/5' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium">{row.exDividendDate}</td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {row.cashAmount}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{row.recordDate}</td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{row.payDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading &&
        companyInfo?.statements?.annual?.financials &&
        companyInfo.statements.annual.financials.length > 0 && (
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40">
              <h4 className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                Trends (annual, latest first)
              </h4>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50/40 dark:bg-transparent">
              {(
                [
                  ['Sales', 'sales'],
                  ['Profit after tax', 'profitAfterTax'],
                  ['EPS', 'eps'],
                ] as const
              ).map(([label, key]) => {
                const latest = companyInfo.statements!.annual.financials[0]?.[key];
                return (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                      {label}
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {latest || '—'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {companyInfo.statements!.annual.financials.map((f, i) => (
                        <span
                          key={`${label}-${f.year}-${i}`}
                          className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-sky-100 dark:border-slate-700"
                        >
                          {f.year}: {f[key]}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

      {!loading && displayFinancials && displayFinancials.financials.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              {financialPeriod} Results (000&apos;s)
            </h4>
            {periodToggle}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Metric</th>
                  {displayFinancials.financials.map((f) => (
                    <th key={f.year} className="px-5 py-3.5 text-right">
                      {f.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">Sales</td>
                  {displayFinancials.financials.map((f) => (
                    <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {f.sales}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">Total Income</td>
                  {displayFinancials.financials.map((f) => (
                    <td key={f.year} className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {f.totalIncome}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">Profit After Tax</td>
                  {displayFinancials.financials.map((f) => (
                    <td
                      key={f.year}
                      className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400"
                    >
                      {f.profitAfterTax}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">EPS</td>
                  {displayFinancials.financials.map((f) => (
                    <td
                      key={f.year}
                      className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-400"
                    >
                      {f.eps}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* When Results card is empty but user still needs the period toggle */}
      {!loading && !(displayFinancials && displayFinancials.financials.length > 0) && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              {financialPeriod} Results
            </h4>
            {periodToggle}
          </div>
          <div className="px-5 pb-5 text-sm text-slate-400">No {financialPeriod.toLowerCase()} results for this symbol.</div>
        </Card>
      )}

      {!loading && showKeyRatios && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Key Ratios
            </h4>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Annual
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Ratio</th>
                  {annualRatios.map((r) => (
                    <th key={r.year} className="px-5 py-3.5 text-right">
                      {r.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                {annualRatios.some((r) => r.grossProfitMargin && r.grossProfitMargin !== '-') && (
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-bold">Gross Profit Margin (%)</td>
                    {annualRatios.map((r) => (
                      <td key={r.year} className="px-5 py-3.5 text-right font-mono tabular-nums">
                        {r.grossProfitMargin || '—'}
                      </td>
                    ))}
                  </tr>
                )}
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">Net Profit Margin (%)</td>
                  {annualRatios.map((r) => (
                    <td key={r.year} className="px-5 py-3.5 text-right font-mono tabular-nums">
                      {r.netProfitMargin}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">EPS Growth (%)</td>
                  {annualRatios.map((r) => (
                    <td
                      key={r.year}
                      className={`px-5 py-3.5 text-right font-mono tabular-nums font-bold ${
                        r.epsGrowth.includes('(')
                          ? 'text-rose-500 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {r.epsGrowth}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 font-bold">PEG</td>
                  {annualRatios.map((r) => (
                    <td key={r.year} className="px-5 py-3.5 text-right font-mono tabular-nums">
                      {r.peg}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && (companyInfo?.reports?.length ?? 0) > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Filings</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Period ended</th>
                  <th className="px-5 py-3.5">Posted</th>
                  <th className="px-5 py-3.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                {companyInfo!.reports!.map((r, i) => (
                  <tr
                    key={`${r.reportType}-${r.periodEnded}-${i}`}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium">{r.reportType}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {r.periodEnded}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{r.postingDate}</td>
                    <td className="px-5 py-3.5 text-right">
                      {r.pdfLink ? (
                        <a
                          href={r.pdfLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Open <ExternalLink size={12} />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
