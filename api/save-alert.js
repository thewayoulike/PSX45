import { sidFor, getRecord, putRecord } from '../lib/alertsStore.js';
import { requireOnlineUser } from '../lib/requireOnlineUser.js';
import { computeAccess, FREE_QUOTAS, PAID_QUOTAS } from '../lib/access.js';
import { createClient } from '@supabase/supabase-js';

async function quotasForEmail(email) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supabase
      .from('allowlist')
      .select('approved, approved_at, access_until, lifetime')
      .eq('email', (email || '').toLowerCase())
      .maybeSingle();
    const access = computeAccess(data || { approved: false });
    if (access.plan === 'free') return { ...FREE_QUOTAS, plan: 'free' };
    return { ...PAID_QUOTAS, plan: access.plan || 'paid' };
  } catch (e) {
    console.error('alerts quotas lookup failed', e);
    return { ...PAID_QUOTAS, plan: 'paid' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const gate = await requireOnlineUser(req);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { subscription, ticker, alerts } = body;

    if (!subscription?.endpoint || !ticker || !Array.isArray(alerts) || alerts.length === 0) {
      return res.status(400).json({ error: 'Missing required data or empty alerts array' });
    }

    const quotas = await quotasForEmail(gate.user.email);
    const maxTickers = Number.isFinite(quotas.alertsTickers) ? quotas.alertsTickers : 15;
    const maxTp = Number.isFinite(quotas.alertsTp) ? quotas.alertsTp : 4;
    const maxSl = Number.isFinite(quotas.alertsSl) ? quotas.alertsSl : 4;

    const sid = sidFor(subscription.endpoint);
    const record = (await getRecord(sid)) || { subscription, alerts: [] };
    record.subscription = subscription;
    record.userEmail = gate.user.email;

    const T = ticker.toUpperCase();
    const existingTickers = new Set((record.alerts || []).map((a) => a.ticker));
    if (!existingTickers.has(T) && existingTickers.size >= maxTickers) {
      return res.status(403).json({
        error: `Your plan allows alerts on ${maxTickers} tickers. Upgrade or remove an old ticker.`,
      });
    }

    const existing = record.alerts.filter((a) => a.ticker === T);
    let tpCount = existing.filter((a) => a.direction === 'ABOVE').length;
    let slCount = existing.filter((a) => a.direction === 'BELOW').length;

    const toAdd = [];
    for (const a of alerts) {
      const price = Number(a.price);
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: 'Each alert needs a valid price.' });
      }
      const direction = a.direction === 'ABOVE' ? 'ABOVE' : 'BELOW';
      if (direction === 'ABOVE') {
        if (tpCount >= maxTp) {
          return res.status(400).json({
            error: `Max ${maxTp} Target Price (TP) alerts allowed for ${T} on your plan.`,
          });
        }
        tpCount++;
      } else {
        if (slCount >= maxSl) {
          return res.status(400).json({
            error: `Max ${maxSl} Stop Loss (SL) alerts allowed for ${T} on your plan.`,
          });
        }
        slCount++;
      }
      toAdd.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        ticker: T,
        targetPrice: price,
        direction,
        createdAt: new Date().toISOString(),
      });
    }

    record.alerts.push(...toAdd);
    await putRecord(sid, record);

    return res.status(200).json({ success: true, message: `Successfully saved ${toAdd.length} alert(s)` });
  } catch (error) {
    console.error('Save Alert Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
