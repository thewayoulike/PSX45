// src/utils/faceValues.ts
//
// PSX dividends are declared as a PERCENTAGE OF FACE VALUE, not of market price.
// The vast majority of PSX stocks have a face value of Rs. 10, so a "100% dividend"
// = Rs. 10 per share (i.e. percent / 10). But some stocks have a face value BELOW
// Rs. 10 (typically 5, 3.5, or 1), so for those the per-share rupee amount is smaller.
//
// This map holds every stock whose face value is NOT the default Rs. 10.
// Anything not listed here is assumed to be Rs. 10.
//
// Source: user-supplied verification sheet (KSEStocks / PSX notices).
// To add/adjust a stock later, just add a line below — no other file needs to change.

export const DEFAULT_FACE_VALUE = 10;

export const FACE_VALUES: Record<string, number> = {
  AATM: 5,     // Ali Asghar Textile Mills Limited
  AGIL: 5,     // Agriautos Industries Limited
  AGTL: 5,     // Al-Ghazi Tractors Limited
  ANNT: 5,     // Annoor Textile Mills Limited
  BAFL: 5,     // Bank Alfalah Limited
  BLUEX: 1,    // Blue-Ex Limited
  CWSM: 5,     // Chakwal Spinning Mills Limited
  DLL: 1,      // Dawood Lawrencepur Limited
  DYNO: 5,     // Dynea Pakistan Limited
  FHAM: 5,     // First Habib Modaraba Limited
  FNEL: 1,     // First National Equities Limited
  HABSM: 5,    // Habib Sugar Mills Limited
  HADC: 5,     // Haydari Construction Company Limited
  HICL: 5,     // Habib Insurance Company Limited
  HRPL: 5,     // Habib Rice Products Limited
  HUMNL: 1,    // Hum Network Limited
  KEL: 3.5,    // K-Electric Limited
  KML: 1,      // Kohinoor Mills Limited
  KOSM: 5,     // Kohinoor Spinning Mills Limited
  NATF: 5,     // National Foods Limited
  PIAB: 5,     // Pakistan International Airlines Corporation (B Class Shares)
  PINL: 5,     // Premier Insurance Limited
  STCL: 5,     // Shabbir Tiles and Ceramics Limited
  THALL: 5,    // Thal Limited
  TSBL: 1,     // Trust Securities & Brokerage Limited
};

/** Face value (Rs.) for a ticker. Defaults to Rs. 10 when not in the exception map. */
export const getFaceValue = (ticker: string): number => {
  const key = String(ticker || '').trim().toUpperCase();
  return FACE_VALUES[key] ?? DEFAULT_FACE_VALUE;
};

/**
 * Convert a declared dividend percentage into rupees-per-share, using the stock's
 * actual face value. e.g. 100% on a Rs. 10 stock = Rs. 10; 100% on KEL (Rs. 3.5) = Rs. 3.50.
 */
export const percentToRs = (percent: number, ticker: string): number => {
  if (!isFinite(percent)) return NaN;
  return (percent / 100) * getFaceValue(ticker);
};
