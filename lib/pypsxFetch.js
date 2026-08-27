/**
 * Call pypsx-toolkit via Vercel Python (/api/pypsx) or local Python scripts.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPANY_SCRIPT = path.join(ROOT, 'scripts', 'pypsx-company-info.py');
const ANALYSIS_SCRIPT = path.join(ROOT, 'scripts', 'pypsx-chart-analysis.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function runPythonScript(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [script, ...args], {
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
      } catch {
        reject(new Error(`Invalid JSON from pypsx: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

async function fetchPypsxHttp(mode, params) {
  const qs = new URLSearchParams({ mode, ...params });
  const base =
    process.env.VERCEL_URL && !process.env.VERCEL_URL.startsWith('http')
      ? `https://${process.env.VERCEL_URL}`
      : '';
  const url = `${base}/api/pypsx?${qs.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(json?.error || `pypsx HTTP ${res.status}`);
  }
  return json;
}

/**
 * @param {'company'|'analysis'} mode
 * @param {Record<string, string>} params
 */
export async function fetchPypsxToolkit(mode, params) {
  if (process.env.VERCEL) {
    return fetchPypsxHttp(mode, params);
  }

  if (mode === 'company') {
    const symbol = String(params.symbol || params.company || '').trim();
    const data = await runPythonScript(COMPANY_SCRIPT, [symbol]);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  if (mode === 'analysis') {
    const symbol = String(params.symbol || params.analysis || '').trim();
    const period = String(params.period || '6mo');
    const data = await runPythonScript(ANALYSIS_SCRIPT, [symbol, period]);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  throw new Error(`Unknown pypsx mode: ${mode}`);
}
