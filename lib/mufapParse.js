/** @param {string} amc @param {string} fundName @param {string} [category] */
export function makeFundId(amc, fundName, category) {
  const parts = [amc, fundName, category].filter(Boolean).join('-');
  const slug = parts
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return `MF:${slug}`;
}

/** @param {string} raw */
function parseNum(raw) {
  const n = parseFloat(String(raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** Strip markdown / HTML link wrappers → plain text. */
function cleanCell(raw) {
  let s = String(raw || '');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // markdown links
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return s.trim();
}

const looksLikeDate = (s) =>
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}$/i.test(String(s || '').trim()) ||
  /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());

const looksLikeAmc = (s) =>
  /limited|management|investments|asset|fund managers|capital|securities|company|assurance|insurance|takaful|wealth|advisors|trust/i.test(
    String(s || '')
  );

/**
 * Classic MUFAP HTML table row:
 * Sector | AMC | Fund | Category | Inception | Offer | Repurchase | NAV | Validity | ...
 */
function rowToFundHtml(cells) {
  if (cells.length < 8) return null;
  const sector = cleanCell(cells[0]);
  const amc = cleanCell(cells[1]);
  const fundName = cleanCell(cells[2]);
  const category = cleanCell(cells[3]);
  if (!amc || !fundName || sector === 'Sector' || fundName === 'Fund') return null;
  // Guard: HTML layout has AMC in col1 and date in col4
  if (!looksLikeAmc(amc) || !looksLikeDate(cells[4])) return null;

  const offer = parseNum(cells[5]);
  const repurchase = parseNum(cells[6]);
  const nav = parseNum(cells[7]) || repurchase || offer;
  if (nav <= 0) return null;

  return {
    id: makeFundId(amc, fundName, category),
    sector,
    amc,
    fundName,
    category,
    inceptionDate: cleanCell(cells[4]) || undefined,
    offer: offer || nav,
    repurchase: repurchase || nav,
    nav,
    validityDate: cleanCell(cells[8]),
    frontEndLoad: parseNum(cells[9]),
    backEndLoad: parseNum(cells[10]),
  };
}

/**
 * Jina / markdown export (AMC is a section header, not a column):
 * Sector | Fund | Category | Inception | Offer | Repurchase | NAV | Validity | ...
 */
function rowToFundMarkdown(cells, currentAmc) {
  if (cells.length < 7 || !currentAmc) return null;
  const sector = cleanCell(cells[0]);
  const fundName = cleanCell(cells[1]);
  const category = cleanCell(cells[2]);
  if (!fundName || sector === 'Sector' || fundName === 'Fund') return null;
  if (!looksLikeDate(cells[3])) return null;
  if (/^\d+(\.\d+)?$/.test(fundName)) return null;

  const offer = parseNum(cells[4]);
  const repurchase = parseNum(cells[5]);
  const nav = parseNum(cells[6]) || repurchase || offer;
  if (nav <= 0) return null;

  return {
    id: makeFundId(currentAmc, fundName, category),
    sector,
    amc: currentAmc,
    fundName,
    category,
    inceptionDate: cleanCell(cells[3]) || undefined,
    offer: offer || nav,
    repurchase: repurchase || nav,
    nav,
    validityDate: cleanCell(cells[7]),
    frontEndLoad: parseNum(cells[8]),
    backEndLoad: parseNum(cells[9]),
  };
}

/** Detect AMC section header rows from jina markdown. */
function amcFromHeaderCells(cells) {
  if (cells.length !== 1) return null;
  const raw = cleanCell(cells[0]);
  if (!raw || raw.length < 8) return null;
  if (/^(sector|fund|category|open-end|report|title|url source|markdown)/i.test(raw)) return null;
  // TOC style: "Al Meezan Investment Management Limited 48"
  const m = raw.match(/^(.+?)\s+\d+\s*$/);
  const name = (m ? m[1] : raw).trim();
  if (!looksLikeAmc(name)) return null;
  return name;
}

/** @param {string} html */
export function isMufapBlockedPage(html) {
  if (!html || html.length < 1500) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment') ||
    lower.includes('cf-chl') ||
    lower.includes('challenge-platform') ||
    lower.includes('enable javascript and cookies')
  );
}

/** @param {string} html */
export function parseMufapNavHtml(html) {
  const funds = [];
  const seen = new Set();

  // 1) Real HTML <tr> rows (classic MUFAP page)
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cleanCell(cellMatch[1]));
    }
    const fund = rowToFundHtml(cells);
    if (fund && !seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }

  if (funds.length >= 50) return funds;

  // 2) Markdown / pipe tables (jina.ai) — track AMC headers
  let currentAmc = '';
  for (const line of html.split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    if (/^\s*\|?\s*[-:| ]+\s*\|?\s*$/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length === 0) continue;

    const amcHeader = amcFromHeaderCells(cells);
    if (amcHeader) {
      currentAmc = amcHeader;
      continue;
    }

    let fund = rowToFundHtml(cells);
    if (!fund) fund = rowToFundMarkdown(cells, currentAmc);
    if (fund && !seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }

  return funds;
}

/**
 * Parse MUFAP NAV Excel / CSV rows (SheetJS sheet_to_json objects).
 * Supports both HTML-export column names and slightly different Excel headers.
 * @param {Record<string, any>[]} rows
 * @returns {any[]}
 */
export function parseMufapNavRows(rows) {
  const funds = [];
  const seen = new Set();
  let currentAmc = '';

  const pick = (row, keys) => {
    for (const k of keys) {
      if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    // case-insensitive fallback
    const map = {};
    Object.keys(row || {}).forEach((k) => {
      map[k.toLowerCase().replace(/\s+/g, '')] = row[k];
    });
    for (const k of keys) {
      const v = map[k.toLowerCase().replace(/\s+/g, '')];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  for (const row of rows) {
    const values = Object.values(row || {}).map((v) => (v == null ? '' : String(v).trim()));
    // AMC group header row: only one populated cell that looks like an AMC
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 1 && looksLikeAmc(nonEmpty[0])) {
      currentAmc = cleanCell(nonEmpty[0]).replace(/\s+\d+$/, '');
      continue;
    }

    let amc = pick(row, ['AMC', 'Amc', 'Asset Management Company', 'Company']);
    const fundName = pick(row, ['Fund', 'Fund Name', 'FundName', 'Scheme']);
    const category = pick(row, ['Category', 'Fund Category', 'Type']);
    const sector = pick(row, ['Sector', 'Fund Sector']) || 'Open-End Funds';
    if (!amc && currentAmc) amc = currentAmc;
    if (!amc || !fundName) continue;
    if (/^fund$/i.test(fundName) || /^sector$/i.test(sector)) continue;

    const offer = parseNum(pick(row, ['Offer', 'Offer Price', 'Sale Price']));
    const repurchase = parseNum(pick(row, ['Repurchase', 'Repurchase Price', 'Redemption']));
    const nav = parseNum(pick(row, ['NAV', 'Nav', 'Net Asset Value'])) || repurchase || offer;
    if (!(nav > 0)) continue;

    const fund = {
      id: makeFundId(amc, fundName, category),
      sector,
      amc,
      fundName,
      category,
      inceptionDate: pick(row, ['Inception Date', 'Inception', 'InceptionDate']) || undefined,
      offer: offer || nav,
      repurchase: repurchase || nav,
      nav,
      validityDate: pick(row, ['Validity Date', 'Validity', 'ValidityDate', 'Date']),
      frontEndLoad: parseNum(pick(row, ['Front-end', 'Front End', 'FrontEnd', 'Front End Load'])),
      backEndLoad: parseNum(pick(row, ['Back-end', 'Back End', 'BackEnd', 'Back End Load'])),
    };
    if (!seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }
  return funds;
}
