/**
 * Build initial fund-nav-catalog.json from pipe-delimited MUFAP table lines.
 * Usage: node scripts/seed-fund-catalog.mjs [input.txt]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMufapNavHtml } from '../lib/mufapParse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../data/fund-nav-catalog.json');
const inputPath = process.argv[2] || path.join(__dirname, '../data/mufap-nav-sample.txt');

if (!fs.existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const funds = parseMufapNavHtml(raw);
if (funds.length < 10) {
  console.error('Parsed too few funds:', funds.length);
  process.exit(1);
}

const catalog = {};
funds.forEach(f => { catalog[f.id] = f; });
const dateMatch = raw.match(/Report Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);

const payload = {
  updatedAt: new Date().toISOString(),
  reportDate: dateMatch?.[1]?.trim() || null,
  source: 'seed',
  count: funds.length,
  catalog,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
const publicOut = path.join(__dirname, '../public/data/fund-nav-catalog.json');
fs.mkdirSync(path.dirname(publicOut), { recursive: true });
fs.copyFileSync(OUT, publicOut);
console.log(`Seeded ${payload.count} funds → ${OUT}`);
