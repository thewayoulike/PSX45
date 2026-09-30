// src/utils/faceValues.ts
//
// PSX dividends are declared as a PERCENTAGE OF FACE VALUE, not of market price.
// Most PSX stocks have a face value of Rs. 10, so a "100% dividend" is Rs. 10
// per share. Stocks below are the exceptions. Anything not listed is Rs. 10.
//
// Current values: ordinary-share face values read from bsl.com.pk on 2026-09-30
// for every symbol on that day's PSX market-watch board. PINL read as Rs 10, so
// it is no longer an exception. ANNT, CWSM, FHAM, HADC, and PIAB were not on that
// board; they keep the earlier verified Rs 5.
//
// Split dates (first session at the new face value) come from PSX notices.
// An ex-date before that session still uses the previous face value.

export const DEFAULT_FACE_VALUE = 10;

export const FACE_VALUES: Record<string, number> = {
  AATM: 5,      // Ali Asghar Textile Mills
  AGIL: 5,      // Agriauto Industries
  AGTL: 5,      // Al-Ghazi Tractors
  AHCL: 1,      // Arif Habib Corporation
  ANNT: 5,      // Annoor Textile Mills (not on the 30 Sep 2026 board)
  BAFL: 5,      // Bank Alfalah
  BECO: 1,      // Beco Steel
  BFAGRO: 1,    // Barkat Frisian Agro
  BFBIO: 3,     // B.F. Biosciences
  BLUEX: 1,     // Blue-Ex
  BNL: 1,       // Bunnys
  CLOV: 1,      // Clover Pakistan
  CWSM: 5,      // Chakwal Spinning Mills (not on the 30 Sep 2026 board)
  DLL: 1,       // Dawood Lawrencepur
  DYNO: 5,      // Dynea Pakistan
  FHAM: 5,      // First Habib Modaraba (not on the 30 Sep 2026 board)
  FNEL: 1,      // First National Equities
  GDL: 1,       // Ghani Dairies
  GEMPACRA: 1,  // Gammon Pakistan
  HABSM: 5,     // Habib Sugar Mills
  HADC: 5,      // Haydari Construction (not on the 30 Sep 2026 board)
  HICL: 5,      // Habib Insurance
  HRPL: 5,      // Habib Rice Products
  HUMNL: 1,     // Hum Network
  IMS: 1,       // Intermarket Securities
  KEL: 3.5,     // K-Electric
  KML: 1,       // Kohinoor Mills
  KOHC: 2,      // Kohat Cement
  KOSM: 5,      // Kohinoor Spinning Mills
  KTML: 2,      // Kohinoor Textile Mills
  LSECL: 5,     // LSE Capital
  LSEVL: 5,     // LSE Ventures
  MTL: 5,       // Millat Tractors
  NATF: 5,      // National Foods
  PIAB: 5,      // PIAC B class (not on the 30 Sep 2026 board)
  PIAHCLB: 5,   // PIA Holding Company B
  QTECH: 5,     // Quice Food Industries
  SLM: 2,       // Shahzad Textile Mills
  SPEL: 5,      // SPEL
  SPSL: 1,      // Saudi Pak Leasing
  SRVI: 1,      // Service Industries
  STCL: 5,      // Shabbir Tiles and Ceramics
  SYM: 1,       // Symmetry Group
  SYS: 2,       // Systems Limited
  THALL: 5,     // Thal
  THCCL: 2,     // Thatta Cement
  TSBL: 1,      // Trust Securities & Brokerage
  UBL: 5,       // United Bank
  WAHDAT: 2,    // Wahdat Poultry Farm
  ZAL: 1,       // Zafar Ali
};

const FACE_VALUE_FROM: Record<string, { from: string; previous: number }> = {
  // Book closure 31 May 2025; trading resumed 2 Jun 2025 at one fifth of the 27 May close.
  SYS: { from: '2025-06-02', previous: 10 },
  // Split credited 21 Jun 2025; first session at the new face value was 23 Jun 2025.
  UBL: { from: '2025-06-23', previous: 10 },
  // First session after the 18 Apr 2026 book closure.
  BAFL: { from: '2026-04-20', previous: 10 },
};

/** Face value (Rs.) for a ticker. Defaults to Rs. 10 when not in the exception map. */
export const getFaceValue = (ticker: string, asOf?: string): number => {
  const key = String(ticker || '').trim().toUpperCase();
  const current = FACE_VALUES[key] ?? DEFAULT_FACE_VALUE;
  const change = FACE_VALUE_FROM[key];
  if (change && asOf && asOf < change.from) return change.previous;
  return current;
};

/**
 * Convert a declared dividend percentage into rupees-per-share, using the stock's
 * actual face value. e.g. 100% on a Rs. 10 stock = Rs. 10; 100% on KEL (Rs. 3.5) = Rs. 3.50.
 */
export const percentToRs = (percent: number, ticker: string, asOf?: string): number => {
  if (!isFinite(percent)) return NaN;
  return (percent / 100) * getFaceValue(ticker, asOf);
};

/** Same face-value rules, written for the dividend-search prompt. */
export const faceValueGuide = (): string => {
  const current = Object.entries(FACE_VALUES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, value]) => `${ticker} Rs ${value}`)
    .join(', ');
  const history = Object.entries(FACE_VALUE_FROM)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, change]) => `${ticker} was Rs ${change.previous} before ${change.from}`)
    .join('; ');
  return `Face values that are not Rs 10: ${current}. Every other symbol is Rs 10. On an ex-date before a split, use the old face value: ${history}.`;
};
