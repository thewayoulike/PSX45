/**
 * Run scripts/pypsx-chart-analysis.py — Bollinger Bands + RSI (pypsx_toolkit).
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'pypsx-chart-analysis.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function runPython(symbol, period) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT, symbol, period], {
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
        reject(new Error(stderr.trim() || stdout.trim() || `pypsx chart exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Invalid JSON from pypsx chart: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/** @param {string} symbol @param {string} [period] */
export async function fetchPypsxChartAnalysis(symbol, period = '6mo') {
  const clean = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/^PSX:/, '');
  if (!clean) throw new Error('symbol required');

  const data = await runPython(clean, period);
  if (data?.error) throw new Error(data.error);
  return data;
}
