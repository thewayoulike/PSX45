/**
 * Company info for /api/proxy?company= — uses PSX web APIs (Vercel-safe).
 * Falls back to local Python/pypsx-toolkit only when PSX fetch fails on dev machines.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { fetchPsxCompanyInfo } from './psxCompanyInfo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'pypsx-company-info.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function runPython(symbol) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT, symbol], {
      cwd: ROOT,
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => {
      stdout += c;
    });
    proc.stderr.on('data', (c) => {
      stderr += c;
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `pypsx exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`Invalid JSON from pypsx: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/** @param {string} symbol */
export async function fetchPypsxCompanyInfo(symbol) {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  try {
    return await fetchPsxCompanyInfo(clean);
  } catch (webErr) {
    if (process.env.VERCEL || process.env.CI) throw webErr;
    try {
      const data = await runPython(clean);
      if (data?.error) throw new Error(data.error);
      return data;
    } catch {
      throw webErr;
    }
  }
}
