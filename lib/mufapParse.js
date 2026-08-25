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

/** @param {string[]} cells */
function rowToFund(cells) {
  if (cells.length < 8) return null;
  const sector = (cells[0] || '').trim();
  const amc = (cells[1] || '').trim();
  const fundName = (cells[2] || '').trim();
  const category = (cells[3] || '').trim();
  if (!amc || !fundName || sector === 'Sector') return null;

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
    inceptionDate: (cells[4] || '').trim() || undefined,
    offer: offer || nav,
    repurchase: repurchase || nav,
    nav,
    validityDate: (cells[8] || '').trim(),
    frontEndLoad: parseNum(cells[9]),
    backEndLoad: parseNum(cells[10]),
  };
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

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(
        cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim()
      );
    }
    const fund = rowToFund(cells);
    if (fund && !seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }

  if (funds.length > 0) return funds;

  for (const line of html.split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 8) continue;
    const fund = rowToFund(cells);
    if (fund && !seen.has(fund.id)) {
      seen.add(fund.id);
      funds.push(fund);
    }
  }

  return funds;
}
