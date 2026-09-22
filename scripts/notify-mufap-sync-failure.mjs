/**
 * Email the owner when MUFAP NAV sync fails (Brevo).
 * Env (GitHub Actions secrets):
 *   BREVO_API_KEY — required
 *   MUFAP_SYNC_ALERT_EMAIL — optional; defaults to OWNER_EMAIL / itruth2011@gmail.com
 *   BREVO_SENDER / OWNER_EMAIL — From address (must be verified in Brevo)
 *   GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL — from Actions
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { sendBrevo, escapeHtml } from '../lib/brevo.js';

export function buildFailureMessage(env = process.env) {
  const repo = env.GITHUB_REPOSITORY || 'unknown/repo';
  const runId = env.GITHUB_RUN_ID || '0';
  const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
  const url = `${server}/${repo}/actions/runs/${runId}`;
  return {
    text: `PSX Tracker MUFAP NAV sync FAILED on ${repo} (run ${runId}). Open: ${url}`,
    subject: 'PSX Tracker: MUFAP NAV sync failed',
    html: `<p><strong>PSX Tracker</strong> MUFAP fund NAV sync failed.</p>
<p>Repository: <code>${escapeHtml(repo)}</code><br>
Run: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
<p>Check the Actions log, then re-run the workflow or fix the sync script.</p>`,
    url,
  };
}

export async function notifyMufapSyncFailure(env = process.env, send = sendBrevo) {
  const msg = buildFailureMessage(env);
  const to = (
    env.MUFAP_SYNC_ALERT_EMAIL
    || env.OWNER_EMAIL
    || 'itruth2011@gmail.com'
  ).trim();

  if (!env.BREVO_API_KEY) {
    const err = new Error('BREVO_API_KEY is not set');
    err.code = 'NO_BREVO_KEY';
    throw err;
  }

  await send(to, msg.subject, msg.html);
  return { to, subject: msg.subject, url: msg.url };
}

async function main() {
  const msg = buildFailureMessage();
  console.error(msg.text);
  try {
    const result = await notifyMufapSyncFailure();
    console.log(`[notify] email sent to ${result.to}`);
  } catch (err) {
    console.error('[notify] FAILED:', err.message);
    process.exit(1);
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] && path.resolve(process.argv[1]) === thisFile;
if (invoked) {
  main();
}
