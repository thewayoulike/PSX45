// PSX Tracker connector for Claude, ChatGPT and Cursor (MCP over HTTP), plus the settings
// actions that create and manage connector links. Served through check-access so the
// deployment stays within its API-entrypoint budget.
import { createHash, randomBytes } from 'node:crypto';
import { serverDb } from './serverDb.js';
import { computeAccess, FREE_QUOTAS } from './access.js';
import { sharedRateLimit, limitRequest } from './sharedRateLimit.js';
import { requireOnlineUser } from './requireOnlineUser.js';
import { readPortfolioFileForEmail } from './driveConnections.js';
import proxyHandler from '../api/proxy.js';
import fundNavHandler from '../api/fund-nav.js';

/** Data lookups (tool calls) a day, by plan. Resets at midnight Pakistan time. */
export const CONNECTOR_DAILY_LIMITS = { free: 30, trial: 300, paid: 1000, lifetime: 1000 };
const BURST_PER_MINUTE = 20;
const MAX_LINKS = 5;
const TOKEN_RE = /^psx_[A-Za-z0-9_-]{43}$/;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pkDate = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const dayKey = (email) => `mcp-day:${email}:${pkDate()}`;
const emailOf = (value) => String(value || '').trim().toLowerCase();

async function planFor(email) {
  const { data, error } = await serverDb().from('allowlist').select('approved,approved_at,access_until,lifetime').eq('email', email).maybeSingle();
  if (error) throw new Error('Account check unavailable');
  return computeAccess(data);
}

/** Answers the shared services' /api/... requests in-process, with the app's own handlers. */
function appFetchFor(email) {
  const caller = `connector:${sha256(email).slice(0, 16)}`;
  return (path, init = {}) => new Promise((resolve, reject) => {
    const url = new URL(path, 'https://app.internal');
    const handler = url.pathname === '/api/proxy' ? proxyHandler : url.pathname === '/api/fund-nav' ? fundNavHandler : null;
    if (!handler) return resolve(new Response(JSON.stringify({ error: 'Not available to the connector' }), { status: 404 }));
    const headers = {};
    let statusCode = 200;
    const finish = (body) => resolve(new Response(body ?? null, { status: statusCode, headers }));
    const res = {
      status(code) { statusCode = code; return res; },
      setHeader(name, value) { headers[name.toLowerCase()] = String(value); return res; },
      getHeader(name) { return headers[name.toLowerCase()]; },
      json(value) { headers['content-type'] ||= 'application/json'; finish(JSON.stringify(value)); return res; },
      send(value) { finish(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value)); return res; },
      end(value) { finish(value); return res; },
    };
    const req = { method: init.method || 'GET', url: path, query: Object.fromEntries(url.searchParams), headers: { 'x-forwarded-for': caller }, body: init.body };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const rpcToolError = (id, text) => ({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: text }) }], isError: true } });
const toolCalls = (body) => (Array.isArray(body) ? body : [body]).filter((m) => m && m.method === 'tools/call' && 'id' in m);

let corePromise;
const loadCore = () => (corePromise ||= import('./generated/psx-mcp.mjs'));

export async function handleConnector(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'This is the PSX Tracker connector. Add its link in Claude, ChatGPT or Cursor; it is not a web page.' });
  }
  const bearer = String(req.headers.authorization || req.headers.Authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = String(req.query?.token || bearer || '').trim();
  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'Unknown connector link. Copy a new one from PSX Tracker → Settings → AI assistant.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Request body must be JSON' } }); }

  try {
    const db = serverDb();
    const { data: link, error } = await db.from('mcp_connections').select('id,email,share_portfolio').eq('token_hash', sha256(token)).is('revoked_at', null).maybeSingle();
    if (error) throw error;
    if (!link) return res.status(404).json({ error: 'This connector link was disconnected or does not exist. Copy a new one from PSX Tracker → Settings → AI assistant.' });
    const email = emailOf(link.email);
    const access = await planFor(email);
    if (!access.active) return res.status(403).json({ error: 'This PSX Tracker account is not active yet.' });

    // Every tool call is one lookup against the plan's daily allowance and a short burst limit.
    const calls = toolCalls(body);
    if (calls.length) {
      const daily = CONNECTOR_DAILY_LIMITS[access.plan] ?? CONNECTOR_DAILY_LIMITS.free;
      for (const call of calls) {
        if (!await sharedRateLimit(`mcp-burst:${email}`, BURST_PER_MINUTE, 60)) {
          return res.status(200).json(rpcToolError(call.id, 'Too many PSX Tracker lookups in the last minute. Wait a minute and try again.'));
        }
        if (!await sharedRateLimit(dayKey(email), daily, 86400)) {
          const planName = { free: 'Free', trial: 'Trial', paid: 'Paid', lifetime: 'Lifetime' }[access.plan] || 'current';
          return res.status(200).json(rpcToolError(call.id, `Daily limit reached: the ${planName} plan includes ${daily} PSX Tracker lookups a day through the connector. It resets at midnight Pakistan time.${access.plan === 'free' ? ' Upgrade at https://www.psx-tracker.com for 1,000 a day.' : ''}`));
        }
      }
      db.from('mcp_connections').update({ last_used_at: new Date().toISOString() }).eq('id', link.id).then(() => {}, () => {});
    }

    const { handleConnectorRequest } = await loadCore();
    const reply = await handleConnectorRequest({
      body,
      plan: access.plan,
      sharePortfolio: link.share_portfolio,
      limits: access.plan === 'free' ? { stockTickers: FREE_QUOTAS.stockTickers, fundTickers: FREE_QUOTAS.fundTickers } : null,
      readPortfolioFile: () => readPortfolioFileForEmail(email),
      allowBacktest: access.plan === 'free' ? () => sharedRateLimit(`mcp-backtest:${email}:${pkDate()}`, 1, 86400) : async () => true,
      appFetch: appFetchFor(email),
    });
    if (reply === null) return res.status(202).end();
    return res.status(200).json(reply);
  } catch (error) {
    console.error('[connector]', error?.message);
    return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'PSX Tracker is temporarily unavailable. Please retry shortly.' } });
  }
}

/* --------------------------- settings: manage links --------------------------- */

async function usedToday(email) {
  const { data } = await serverDb().from('request_limits').select('hits,expires_at').eq('key', sha256(dayKey(email))).maybeSingle();
  return data && Date.parse(data.expires_at) > Date.now() ? Math.min(data.hits, 100000) : 0;
}

export async function handleConnectorSettings(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await limitRequest(req, res, 'mcp-settings', 30)) return;
  const auth = await requireOnlineUser(req);
  if (!auth.ok) return res.status(401).json({ error: 'Sign in to manage AI assistant connections.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: 'Invalid request' }); }
  const email = emailOf(auth.user.email);
  try {
    const db = serverDb();
    const access = await planFor(email);
    if (!access.active) return res.status(403).json({ error: 'Your account is not active yet.' });

    if (body.action === 'create') {
      const label = String(body.label || 'AI assistant').trim().slice(0, 40) || 'AI assistant';
      const { count } = await db.from('mcp_connections').select('id', { count: 'exact', head: true }).eq('email', email).is('revoked_at', null);
      if ((count || 0) >= MAX_LINKS) return res.status(409).json({ error: `You can have up to ${MAX_LINKS} connections. Disconnect one first.` });
      const token = `psx_${randomBytes(32).toString('base64url')}`;
      const { data, error } = await db.from('mcp_connections').insert({ email, label, token_hash: sha256(token), token_hint: token.slice(-4) }).select('id').single();
      if (error) throw error;
      const origin = new URL(process.env.APP_URL || 'https://www.psx-tracker.com').origin;
      // The full link is shown once; only its hash is kept.
      return res.status(200).json({ id: data.id, link: `${origin}/api/mcp/${token}` });
    }
    if (body.action === 'update' || body.action === 'revoke') {
      if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return res.status(400).json({ error: 'Invalid connection' });
      const patch = body.action === 'revoke' ? { revoked_at: new Date().toISOString() } : { share_portfolio: body.sharePortfolio === true };
      const { error } = await db.from('mcp_connections').update(patch).eq('id', body.id).eq('email', email).is('revoked_at', null);
      if (error) throw error;
    } else if (body.action !== 'list') {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const [{ data: links, error }, used, drive] = await Promise.all([
      db.from('mcp_connections').select('id,label,token_hint,share_portfolio,created_at,last_used_at').eq('email', email).is('revoked_at', null).order('created_at'),
      usedToday(email),
      db.from('drive_connections').select('email').eq('email', email).maybeSingle(),
    ]);
    if (error) throw error;
    return res.status(200).json({
      plan: access.plan,
      dailyLimit: CONNECTOR_DAILY_LIMITS[access.plan] ?? CONNECTOR_DAILY_LIMITS.free,
      usedToday: used,
      driveConnected: !!drive.data,
      connections: (links || []).map((l) => ({ id: l.id, label: l.label, hint: l.token_hint, sharePortfolio: l.share_portfolio, createdAt: l.created_at, lastUsedAt: l.last_used_at })),
    });
  } catch (error) {
    console.error('[connector-settings]', error?.message);
    return res.status(503).json({ error: 'AI assistant connections are temporarily unavailable. Please retry.' });
  }
}
