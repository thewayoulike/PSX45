import { createHash } from 'node:crypto';

export const flowSource = 'https://www.scstrade.com/FIPILIPI.aspx';
export const insiderSource = 'https://www.scstrade.com/MarketStatistics/MS_Announcements.aspx';
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const text = html => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim();
const numeric = value => { const s = String(value ?? '').replace(/,/g, '').trim(); return s !== '' && Number.isFinite(Number(s)) ? Number(s) : null; };
export function reportDate(value) {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!m) throw new Error('Unexpected insider date');
  const date = `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2,'0')}-${m[1]}`;
  if (!months.includes(m[2]) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw new Error('Invalid insider date');
  return date;
}
export function parseCompanies(html) {
  const raw = html.match(/var availableTags\s*=\s*(\[[^;]*\]);/)?.[1];
  if (!raw) throw new Error('Company list unavailable');
  const companies = JSON.parse(raw).map(line => {
    const m = /^([A-Z0-9][A-Z0-9.-]{0,19}) - (.+)$/.exec(line);
    return m && {symbol:m[1], company:m[2]};
  }).filter(Boolean);
  return [...new Map(companies.map(r=>[r.symbol,r])).values()];
}
export function parseInsiders(html, company) {
  if (!html.includes('ContentPlaceHolder1_div_earnings1')) throw new Error(`Invalid company page: ${company.symbol}`);
  const table = html.match(/<table\b[^>]*id="ContentPlaceHolder1_GridView2"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return [];
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const result = [];
  for (const match of rows) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if (!cells.length) continue;
    if (cells.length !== 8) throw new Error('Insider table schema changed');
    const [date,person,role,action,quantity,rate] = cells.map(text);
    const shares = numeric(quantity), price = numeric(rate);
    if (!person || !action || shares === null || shares <= 0 || price === null || price < 0) throw new Error('Invalid insider row');
    const links = [...(cells[7]+cells[6]).matchAll(/href="(https:\/\/dps\.psx\.com\.pk\/download\/(?:document|image)\/[^"\s]+)"/gi)].map(m=>m[1]);
    const sourceUrl = links[0] || `https://www.scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=${company.symbol}`;
    const row = {...company,date:reportDate(date),person,role:role||'Not supplied',action,shares,price,value:price>0?Math.round(shares*price*100)/100:null,sourceUrl};
    // Include every field: identical-looking rows in different filings are distinct.
    const id = createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,24);
    result.push({id,...row});
  }
  return result;
}
export function normalizeFlows(raw, date) {
  if (!Array.isArray(raw) || raw.length < 50) throw new Error('Incomplete investor-flow report');
  const allowed = ['FIPI','BANKS / DFI','BROKER PROPRIETARY TRADING','COMPANIES','INDIVIDUALS','INSURANCE COMPANIES','MUTUAL FUNDS','NBFC','OTHER ORGANIZATION'];
  const cells = [], unique = new Set();
  for(const r of raw) {
    const sector = String(r.FLSectorName || '').replace(/\s*\(mn\$\)\s*$/,'').trim();
    const investor = String(r.FLTypeNew || '').trim(), value = numeric(r.FLNetValueUSD);
    const key = sector+'|'+investor;
    if (!sector || !allowed.includes(investor) || value === null || unique.has(key)) throw new Error('Invalid or duplicate flow cell');
    unique.add(key); cells.push({sector,investor,value});
  }
  const sectors = [...new Set(cells.map(r=>r.sector))];
  if (sectors.length !== 11 || !sectors.includes('Debt Market')) throw new Error('Flow coverage changed');
  for (const sector of sectors) {
    const group = cells.filter(r=>r.sector===sector);
    if (Math.abs(group.reduce((n,r)=>n+r.value,0)) > 0.000025) throw new Error(`Unbalanced flow sector: ${sector}`);
  }
  return {date,cells,sourceUrl:flowSource,unit:'USD million'};
}
export async function readPublic(url, options = {}) {
  const response = await fetch(url, {...options, signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  return response;
}
