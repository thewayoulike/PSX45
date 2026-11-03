// Rule-based headline mood for PSX companies: no AI, no keys. A headline is linked to a company
// by ticker, name or a known short name, then scored with finance word rules.

export type HeadlineSentiment = 'positive' | 'negative' | 'neutral';

export interface MoodCompany { symbol: string; name: string }
export interface MoodNewsItem { id: string; title: string; url: string; source: string; publishedAt?: string; indexedAt: string; region?: string }

export interface MoodHeadline {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: HeadlineSentiment;
  /** The words that decided the label, e.g. ["profit rises"]. */
  reasons: string[];
}

export interface StockMood {
  symbol: string;
  headlines: MoodHeadline[];
  positive: number;
  negative: number;
  neutral: number;
  mood: HeadlineSentiment | 'mixed';
  label: string;
}

/** Short names people use in headlines that the official name does not contain. */
export const COMPANY_ALIASES: Record<string, string[]> = {
  HUBC: ['Hubco', 'Hub Power'],
  OGDC: ['OGDCL'],
  PTC: ['PTCL'],
  KEL: ['K-Electric', 'KE'],
  SNGP: ['SNGPL', 'Sui Northern'],
  SSGC: ['SSGCL', 'Sui Southern'],
  PSMC: ['Pak Suzuki'],
  ENGROH: ['Engro Corp', 'Engro Corporation', 'Engro Holdings'],
  EFERT: ['Engro Fert'],
  ATRL: ['Attock Refinery'],
  KAPCO: ['Kot Addu'],
  MLCF: ['Maple Leaf'],
  DGKC: ['DG Khan Cement', 'DG Cement'],
  NBP: ['National Bank of Pakistan'],
  BOP: ['Bank of Punjab'],
  HBL: ['Habib Bank'],
  PSEL: ['Pearl Continental', 'PC Hotels'],
  PKGS: ['Packages Ltd', 'Packages Limited'],
  SYS: ['Systems Ltd', 'Systems Limited'],
  PEL: ['Pak Elektron'],
  MARI: ['Mari Petroleum', 'Mari Energies'],
  CNERGY: ['Cnergyico'],
};

/** Tickers that are also everyday acronyms in market news. */
const AMBIGUOUS_TICKERS = new Set(['PSX', 'KSE', 'IMF', 'SBP', 'GDP', 'CEO', 'IPO', 'FBR', 'LNG', 'LPG', 'USD', 'PKR', 'AGM', 'NEW', 'TPL', 'GAL', 'NET', 'ICL', 'EPS', 'PPP', 'ICCI', 'ISL', 'PMI', 'CPI', 'SPI']);
/** Phrases that contain a ticker but are not company news, e.g. the HBL purchasing managers' survey. */
const NOT_COMPANY_NEWS = /\bHBL\s+(?:\w+\s+)?PMI\b/gi;
/** One-word company names that are ordinary words; these need an alias or the ticker. */
const COMMON_SINGLE_NAMES = new Set(['systems', 'packages', 'international', 'national', 'general', 'united', 'standard', 'security', 'services', 'premier', 'crescent', 'pakistan', 'service', 'shield', 'synthetic', 'image', 'gateway', 'macter', 'treet']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/** "The Hub Power Company Limited" → "Hub Power"; "Pakistan State Oil Company Limited" → "Pakistan State Oil". */
export function coreName(name: string): string {
  let s = decode(name).replace(/\s+/g, ' ').trim();
  s = s.replace(/^The\s+/i, '');
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\s*\((?:Pakistan|Pak|Private|Pvt\.?)\)\s*$/i, '')
      .replace(/\s+(?:Limited|Ltd\.?|Lim|Company|Co\.?|Corporation|Corp\.?|PK|Consolidated)\s*$/i, '')
      .trim();
  }
  return s;
}

export interface CompanyMatcher { symbol: string; patterns: RegExp[] }

export function buildMatchers(companies: MoodCompany[]): CompanyMatcher[] {
  return companies.map(({ symbol, name }) => {
    const patterns: RegExp[] = [];
    if (symbol.length >= 3 && !AMBIGUOUS_TICKERS.has(symbol)) patterns.push(new RegExp(`(?<![\\w-])${escape(symbol)}(?![\\w-])`));
    const core = coreName(name);
    const words = core.split(' ').filter(Boolean);
    if (words.length >= 2 && core.length >= 6) patterns.push(new RegExp(`\\b${escape(core)}\\b`, 'i'));
    else if (words.length === 1 && core.length >= 5 && !COMMON_SINGLE_NAMES.has(core.toLowerCase())) patterns.push(new RegExp(`\\b${escape(core)}\\b`));
    for (const alias of COMPANY_ALIASES[symbol] || []) {
      // Upper-case aliases are acronyms: match the exact case.
      patterns.push(alias === alias.toUpperCase() ? new RegExp(`(?<![\\w-])${escape(alias)}(?![\\w-])`) : new RegExp(`\\b${escape(alias)}\\b`, 'i'));
    }
    return { symbol, patterns };
  }).filter((m) => m.patterns.length);
}

export function matchCompanies(title: string, matchers: CompanyMatcher[]): string[] {
  const t = decode(title).replace(NOT_COMPANY_NEWS, ' ');
  return matchers.filter((m) => m.patterns.some((p) => p.test(t))).map((m) => m.symbol);
}

// Words are matched on whole words, case-insensitively. Turning phrases ("loss narrows")
// are checked first and their words are not counted again.
const RISE = '(?:rises?|rose|up|jumps?|surges?|soars?|grows?|grew|increases?|climbs?|doubles?|triples?|higher|gains?|improves?|rebounds?|hits record|record)';
const FALL = '(?:falls?|fell|down|drops?|declines?|slumps?|plunges?|plummets?|tumbles?|lower|dips?|shrinks?|slides?|sinks?|halves|contracts?)';
const EARN = '(?:profits?|earnings|income|eps|revenues?|sales|margins?|payout|dividends?)';
const LOSS = '(?:loss|losses|deficit)';

interface Rule { re: RegExp; weight: number }
const rule = (source: string, weight: number): Rule => ({ re: new RegExp(source, 'gi'), weight });

export const PHRASE_RULES: Rule[] = [
  rule(`\\b${LOSS}\\s+(?:\\w+\\s+){0,2}(?:narrows?|narrowed|shrinks?|reduced|reduces|eases?|halves)\\b`, 2),
  rule(`\\b(?:narrower|lower|reduced|smaller)\\s+${LOSS}\\b`, 2),
  rule(`\\b(?:returns?|swings?|turns?|back)\\s+to\\s+profit\\b`, 2),
  rule(`\\b${LOSS}\\s+(?:\\w+\\s+){0,2}(?:widens?|widened|deepens?|swells?|${RISE})\\b`, -2),
  rule(`\\b(?:posts?|reports?|incurs?|books?|suffers?|records?)\\s+(?:\\w+\\s+){0,2}${LOSS}\\b`, -2),
  rule(`\\b(?:net|after-tax|quarterly|annual)\\s+${LOSS}\\b`, -2),
  rule(`\\b${EARN}\\s+(?:\\w+\\s+){0,3}${RISE}\\b`, 2),
  rule(`\\b${EARN}\\s+(?:\\w+\\s+){0,3}${FALL}\\b`, -2),
  rule(`\\b${RISE}\\s+(?:in\\s+)?${EARN}\\b`, 2),
  rule(`\\b(?:record|higher|bumper|strong)\\s+${EARN}\\b`, 2),
  rule(`\\b(?:lower|weak|weaker)\\s+${EARN}\\b`, -2),
  rule(`\\b(?:wins?|won|bags?|secures?|awarded|lands?|signs?)\\s+(?:\\w+\\s+){0,3}(?:contract|order|deal|licen[cs]e|agreement|mou|project|tender)s?\\b`, 2),
  rule(`\\b(?:cuts?|slashes?|reduces?)\\s+(?:\\w+\\s+){0,2}(?:jobs|staff|workforce|output|production)\\b`, -2),
  rule(`\\b(?:rating\\s+)?(?:upgraded?|upgrades?)\\b`, 1),
  rule(`\\b(?:rating\\s+)?(?:downgraded?|downgrades?)\\b`, -2),
];

export const WORD_RULES: Rule[] = [
  // Good for shareholders.
  rule('\\b(?:dividends?|bonus shares?|bonus issue|buy-?back|payout)\\b', 1),
  rule('\\b(?:expands?|expansion|commissions?|commissioned|inaugurates?|launch(?:es|ed)?|new plant|capacity addition|discover(?:y|ies|s)|finds? (?:gas|oil))\\b', 1),
  rule('\\b(?:starts?|started|commences?|commenced|begins?|to (?:start|commence|begin))\\s+(?:\\w+\\s+){0,3}(?:production|manufacturing|operations|exports?)\\b', 1),
  rule('\\b(?:acquires?|acquisition|stake purchase|investment|invests?)\\b', 1),
  rule('\\b(?:record|surges?|soars?|jumps?|rall(?:y|ies)|rebounds?|beats?|turnaround|recover(?:y|s)|boost(?:s|ed)?|strong|growth|grows)\\b', 1),
  // Bad for shareholders.
  rule('\\b(?:shut(?:s|down| down)?|suspends?|suspended|halts?|halted|closure|closes plant|stops? production)\\b', -2),
  rule('\\b(?:penalty|penalised|penalized|fined?|fines|sanctions?|default(?:s|ed)?|bankrupt(?:cy)?|insolven(?:t|cy)|liquidation|fraud|scam|probe|inquiry|investigation|raid(?:ed)?)\\b', -2),
  rule('\\b(?:lawsuit|sued|sues|petition against|court stays?|stay order|dispute)\\b', -1),
  rule('\\b(?:delays?|delayed|postpones?|postponed|strike|protest|outage|fire|blast|explosion|accident|losses|shortfall|unpaid dues|circular debt|layoffs?|resigns?)\\b', -1),
  rule('\\b(?:falls?|plunges?|slumps?|tumbles?|declines?|drops?|weak|slowdown|crisis|pressure)\\b', -1),
];

function applyRules(text: string, rules: Rule[], reasons: string[]): { score: number; text: string } {
  let score = 0;
  for (const r of rules) {
    text = text.replace(r.re, (m) => {
      score += r.weight;
      reasons.push(m.toLowerCase());
      return ' '.repeat(m.length);
    });
  }
  return { score, text };
}

export function scoreHeadline(title: string): { sentiment: HeadlineSentiment; score: number; reasons: string[] } {
  const reasons: string[] = [];
  const phrases = applyRules(decode(title), PHRASE_RULES, reasons);
  const words = applyRules(phrases.text, WORD_RULES, reasons);
  const score = phrases.score + words.score;
  return { sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score, reasons };
}

export const MOOD_WINDOW_DAYS = 7;

export function moodLabel(positive: number, negative: number, neutral: number): { mood: StockMood['mood']; label: string } {
  const total = positive + negative + neutral;
  if (!total) return { mood: 'neutral', label: 'No news' };
  if (positive > negative && positive >= neutral / 2) return { mood: 'positive', label: positive > 1 && !negative ? 'Positive' : 'Mostly positive' };
  if (negative > positive && negative >= neutral / 2) return { mood: 'negative', label: negative > 1 && !positive ? 'Negative' : 'Mostly negative' };
  if (positive && negative && positive === negative) return { mood: 'mixed', label: 'Mixed' };
  return { mood: 'neutral', label: 'Mostly neutral' };
}

/** Groups the past week's Pakistani headlines by the PSX companies they mention. */
export function buildMoodIndex(items: MoodNewsItem[], companies: MoodCompany[], now = Date.now()): Map<string, StockMood> {
  const matchers = buildMatchers(companies);
  const since = now - MOOD_WINDOW_DAYS * 86400000;
  const out = new Map<string, StockMood>();
  for (const item of items) {
    const at = item.publishedAt || item.indexedAt;
    if (item.region && item.region !== 'Pakistan') continue;
    if (!(Date.parse(at) >= since)) continue;
    const symbols = matchCompanies(item.title, matchers);
    if (!symbols.length) continue;
    const { sentiment, reasons } = scoreHeadline(item.title);
    for (const symbol of symbols) {
      let m = out.get(symbol);
      if (!m) out.set(symbol, (m = { symbol, headlines: [], positive: 0, negative: 0, neutral: 0, mood: 'neutral', label: 'No news' }));
      m.headlines.push({ id: item.id, title: decode(item.title), url: item.url, source: item.source, publishedAt: at, sentiment, reasons });
      m[sentiment]++;
    }
  }
  for (const m of out.values()) {
    m.headlines.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    Object.assign(m, moodLabel(m.positive, m.negative, m.neutral));
  }
  return out;
}
