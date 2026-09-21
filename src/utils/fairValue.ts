export const factFields = ['price', 'eps', 'bookValue', 'liabilities', 'equity', 'currentAssets', 'currentLiabilities', 'inventory'] as const;
export const assumptionFields = ['fairPE', 'expectedDiv', 'requiredReturn', 'cagr'] as const;
export const inputFields = [...factFields, ...assumptionFields] as const;
export type FactField = typeof factFields[number];
export type InputField = typeof inputFields[number];
export type FairValueInputs = Record<InputField, number | ''>;
export type Source = { name: 'Market quote' | 'Fundamentals feed' | 'Entered manually' | 'Older saved research'; retrievedAt: string | null };
export type Sources = Partial<Record<FactField, Source>>;
export type ReportedDividend = {
  value: number;
  retrievedAt: string;
  source: 'pyPSX annual dividend' | 'pyPSX yield estimate' | 'Sheet dividend';
  basis: string;
};
export interface Research {
  version: 2;
  inputs: FairValueInputs;
  sources: Sources;
  reportedDividend: ReportedDividend | null;
  dividendSource: ReportedDividend | null;
  dividendMode: 'source' | 'manual';
  savedAt: string | null;
  needsReview: boolean;
}
export interface FetchedResearch {
  facts: Partial<Record<FactField, number>>;
  sources: Sources;
  reportedDividend: ReportedDividend | null;
  warnings: string[];
}

export const normalizeTicker = (ticker: string) => ticker.trim().toUpperCase();
export const validTicker = (ticker: string) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker);

/** Reject missing, decorated and non-finite values instead of treating them as zero. */
export function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function emptyInputs(): FairValueInputs {
  return Object.fromEntries(inputFields.map(key => [key, ''])) as FairValueInputs;
}

export function readResearch(raw?: unknown): Research {
  const result: Research = { version: 2, inputs: emptyInputs(), sources: {}, reportedDividend: null, dividendSource: null, dividendMode: 'source', savedAt: null, needsReview: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const record = raw as Record<string, any>;
  const modern = record.version === 2;
  const values = modern ? record.inputs : record;
  for (const field of modern ? inputFields : factFields) {
    result.inputs[field] = finiteNumber(values?.[field]) ?? '';
  }
  const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  for (const field of factFields) {
    if (result.inputs[field] === '') continue;
    const source = modern ? record.sources?.[field] : null;
    const name = ['Market quote', 'Fundamentals feed', 'Entered manually'].includes(source?.name) ? source.name : 'Older saved research';
    result.sources[field] = { name, retrievedAt: date(source?.retrievedAt) };
  }
  function dividendReference(raw: any): ReportedDividend | null {
    const value = finiteNumber(raw?.value);
    const retrievedAt = date(raw?.retrievedAt);
    if (!modern || value === null || value < 0 || !retrievedAt) return null;
    const source = ['pyPSX annual dividend', 'pyPSX yield estimate', 'Sheet dividend'].includes(raw.source) ? raw.source : 'Sheet dividend';
    return { value, retrievedAt, source, basis: typeof raw.basis === 'string' ? raw.basis : 'Annual basis assumed; verify the sheet period and units.' };
  }
  result.reportedDividend = dividendReference(record.reportedDividend);
  result.dividendSource = dividendReference(record.dividendSource);
  result.dividendMode = record.dividendMode === 'manual' || (record.dividendMode !== 'source' && result.inputs.expectedDiv !== '') ? 'manual' : 'source';
  result.savedAt = modern ? date(record.savedAt) : null;
  // The old format mixed automatically copied market multiples/dividends and default rates
  // with user assumptions. They cannot safely be migrated as deliberate assumptions.
  result.needsReview = modern ? record.needsReview === true : true;
  return result;
}

export interface Calculation { value: number | null; reason?: string }
const unavailable = (reason: string): Calculation => ({ value: null, reason });
const calculated = (value: number): Calculation => Number.isFinite(value) ? { value } : unavailable('Result is outside the supported numeric range. Check the inputs.');

export function calculateFairValue(inputs: FairValueInputs) {
  const n = Object.fromEntries(inputFields.map(key => [key, finiteNumber(inputs[key])])) as Record<InputField, number | null>;
  const positive = (v: number | null): v is number => v !== null && v > 0;
  const nonNegative = (v: number | null): v is number => v !== null && v >= 0;
  const pe = positive(n.price) && positive(n.eps) ? calculated(n.price / n.eps) : unavailable('Requires positive price and EPS; P/E is not meaningful for losses or zero earnings.');
  const peValue = positive(n.eps) && positive(n.fairPE) ? calculated(n.eps * n.fairPE) : unavailable(positive(n.eps) ? 'Set your target P/E above 0 to calculate this estimate.' : 'Enter positive annual or TTM EPS. This model is not meaningful for losses or zero earnings.');
  const dividendValue = nonNegative(n.expectedDiv) && positive(n.requiredReturn) ? calculated(n.expectedDiv / (n.requiredReturn / 100)) : unavailable(nonNegative(n.expectedDiv) ? 'Dividend is available. Set your required annual return above 0% to calculate this estimate.' : 'Enter or fetch an annual dividend of zero or more.');
  const grahamValue = positive(n.eps) && positive(n.bookValue) ? calculated(Math.sqrt(22.5 * n.eps * n.bookValue)) : unavailable('Requires positive EPS and book value per share.');
  const dividendYield = nonNegative(n.expectedDiv) && positive(n.price) ? calculated(n.expectedDiv / n.price * 100) : unavailable('Enter an annual dividend of zero or more and a positive price.');
  const liabilitiesToEquity = positive(n.equity) && nonNegative(n.liabilities) ? calculated(n.liabilities / n.equity) : unavailable(n.equity !== null && n.equity <= 0 ? 'Equity is zero or negative; this ratio is not meaningful.' : 'Requires liabilities of zero or more and positive equity.');
  const peg = pe.value !== null && positive(n.cagr) ? calculated(pe.value / n.cagr) : unavailable('PEG requires positive earnings, price and expected growth above 0%.');
  const projectedEPS = positive(n.eps) && n.cagr !== null && n.cagr > -100 ? n.eps * (1 + n.cagr / 100) : null;
  const forwardPE = positive(n.price) && positive(projectedEPS) && Number.isFinite(projectedEPS) ? calculated(n.price / projectedEPS) : unavailable('Requires positive price and EPS, and expected earnings growth above −100%, within the supported numeric range.');
  const currentRatio = nonNegative(n.currentAssets) && positive(n.currentLiabilities) ? calculated(n.currentAssets / n.currentLiabilities) : unavailable('Requires current assets of zero or more and positive current liabilities.');
  const quickRatio = nonNegative(n.currentAssets) && positive(n.currentLiabilities) && nonNegative(n.inventory) && n.inventory <= n.currentAssets ? calculated((n.currentAssets - n.inventory) / n.currentLiabilities) : unavailable(n.inventory !== null && n.currentAssets !== null && n.inventory > n.currentAssets ? 'Inventory exceeds current assets. Check the reporting period and units.' : 'Requires current assets and inventory of zero or more and positive current liabilities.');
  return { pe, peValue, dividendValue, grahamValue, dividendYield, liabilitiesToEquity, peg, forwardPE, currentRatio, quickRatio };
}

export function compareEstimate(estimate: number | null, priceInput: unknown): string {
  const price = finiteNumber(priceInput);
  if (estimate === null || !Number.isFinite(estimate) || estimate < 0 || price === null || price <= 0) return 'Enter a positive price to compare an available estimate.';
  const percent = (estimate / price - 1) * 100;
  if (!Number.isFinite(percent)) return 'Comparison is outside the supported numeric range.';
  if (Math.abs(percent) < 0.05) return 'At the entered price (within 0.05%).';
  return `${Math.abs(percent).toFixed(1)}% ${percent > 0 ? 'upside' : 'downside'} to this estimate`;
}
