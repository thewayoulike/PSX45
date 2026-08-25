import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../data/fund-nav-catalog.json');
const dest = path.join(__dirname, '../public/data/fund-nav-catalog.json');

if (!fs.existsSync(src)) {
  console.warn('[copy-fund-catalog] Source missing, skipping:', src);
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-fund-catalog] Copied → public/data/fund-nav-catalog.json');
