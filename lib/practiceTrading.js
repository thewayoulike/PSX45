import { createHmac } from 'node:crypto';

// Intentionally fixed to PAPER. A live key, host, or linked brokerage account is never accepted.
export const PAPER_BASE = 'https://brokerapi-paper.pypsx.com/v1/partner-api';
const error = (message, status = 502, code = 'PRACTICE_UNAVAILABLE') => Object.assign(new Error(message), { status, code, safe: true });
const number = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => typeof value === 'string' ? value.slice(0, 200) : '';
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const messages = {
  'PYPSX-1410': 'Not enough virtual cash or shares for this practice order.',
  'PYPSX-1413': 'This practice account is not active.',
  'PYPSX-1415': 'Some shares are reserved by another practice order. Cancel it or reduce the quantity.',
  'PYPSX-1416': 'These shares are reserved by an existing practice order.',
  'PYPSX-1418': 'This order reference was already used. Check your order history before placing another order.',
  'PYPSX-1437': 'This symbol is not listed on PSX.',
  'PYPSX-1438': 'The limit price is outside the exchange price limits for this session.',
  'PYPSX-1441': 'A usable price is not available for this stock. Please try again later.',
  'PYPSX-1503': 'The practice service is busy. Please try again shortly.',
};

export function practiceIdentity(email, secret) {
  if (!secret || secret.length < 32) throw error('Practice trading is not configured yet.', 503);
  const reference = createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
  // No real name, email, CNIC, portfolio, or broker credentials are sent to the sandbox.
  return { reference, email: `practice-${reference.slice(0, 40)}@sandbox.psx-tracker.com` };
}

export function validatePracticeOrder(input) {
  const allowed = new Set(['symbol', 'side', 'quantity', 'orderType', 'price', 'clientOrderId']);
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !allowed.has(k))) throw error('Invalid practice order.', 400);
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,19}$/.test(symbol)) throw error('Enter a valid PSX stock symbol.', 400);
  if (!['BUY', 'SELL'].includes(input.side) || !['MARKET', 'LIMIT'].includes(input.orderType)) throw error('Choose buy or sell and a market or limit order.', 400);
  if (typeof input.quantity !== 'number' || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1_000_000_000) throw error('Quantity must be a positive whole number.', 400);
  if (!identifier(input.clientOrderId)) throw error('A valid order reference is required.', 400);
  if (input.orderType === 'LIMIT' && (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0 || input.price > 10_000_000)) throw error('Enter a valid limit price.', 400);
  return { symbol, side: input.side, quantity: input.quantity, order_type: input.orderType, order_class: 'SIMPLE', client_order_id: input.clientOrderId,
    ...(input.orderType === 'LIMIT' ? { price: input.price } : {}) };
}

export function normalizePracticeOrder(o) {
  return { id: text(o.order_id || o.id), clientOrderId: text(o.client_order_id), symbol: text(o.symbol), side: text(o.side),
    type: text(o.order_type), status: text(o.status), quantity: number(o.quantity ?? o.qty), filled: number(o.filled_qty),
    price: number(o.avg_fill_price ?? o.fill_price), limitPrice: number(o.price ?? o.limit_price),
    commission: number(o.commission), fees: number(o.fees_total), reason: text(o.reason_code), createdAt: text(o.created_at ?? o.timestamp),
  };
}

export function createPracticeBroker({ env = process.env, fetchImpl = fetch } = {}) {
  function credentials() {
    if (!env.PSX_PAPER_KEY_ID?.startsWith('PYPSX-SANDBOX-') || !env.PSX_PAPER_SECRET) throw error('Practice trading is not configured yet.', 503);
    return { 'PYPSX-ORG-API-KEY-ID': env.PSX_PAPER_KEY_ID, 'PYPSX-ORG-API-SECRET-KEY': env.PSX_PAPER_SECRET, 'Content-Type': 'application/json' };
  }
  async function request(path, method = 'GET', body, extraHeaders = {}) {
    const headers = { ...credentials(), ...extraHeaders };
    let response, data;
    try {
      response = await fetchImpl(`${PAPER_BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(18_000) });
      data = await response.json();
    } catch { throw error('Could not reach the practice service. If you submitted an order, retry the same order to check it safely.', 503, 'PRACTICE_RETRY'); }
    if (!response.ok) {
      const code = text(data?.code);
      const message = messages[code] || (response.status === 409 ? 'The practice request conflicts with the current account or order state. Refresh and check your history.' : 'The practice service could not complete this request. Please try again.');
      throw error(message, [400, 409, 422, 429].includes(response.status) ? response.status : 503, code || 'PRACTICE_UNAVAILABLE');
    }
    if (!data || typeof data !== 'object') throw error('The practice service returned an invalid response.');
    return data;
  }
  async function config() {
    const c = await request('/config');
    if (c.environment !== 'sandbox') throw error('Practice trading requires a sandbox connection.', 503);
    return { environment: 'sandbox', startingCash: number(c.default_portfolio_value), commissionPct: number(c.commission_rate),
      currency: 'PKR', fees: { advanceRate: number(c.fees?.advance_fee_rate), sstRate: number(c.fees?.sst_rate) } };
  }
  function ownedAccount(a, identity) {
    if (!a || a.email?.toLowerCase() !== identity.email || a.partner_reference_id !== identity.reference || !identifier(a.account_id)) throw error('Could not verify this practice account.', 503);
    if (!String(a.broker_account_number || '').startsWith('SANDBOX-')) throw error('Only unlinked sandbox accounts can be used for practice trading.', 403);
    return a;
  }
  async function findAccount(email) {
    const identity = practiceIdentity(email, env.PSX_PAPER_IDENTITY_SECRET);
    const result = await request(`/accounts?search=${encodeURIComponent(identity.email)}&limit=50`);
    if (!Array.isArray(result.accounts)) throw error('Could not read your practice account.');
    const matches = result.accounts.filter(a => a.email?.toLowerCase() === identity.email);
    if (matches.length > 1) throw error('This practice account needs a support check.', 503);
    return matches.length ? ownedAccount(matches[0], identity) : null;
  }
  async function account(email) {
    const a = await findAccount(email);
    if (!a) throw error('Start your practice account first.', 409);
    return a;
  }
  async function start(email) {
    await config();
    const current = await findAccount(email);
    if (current) return current;
    const identity = practiceIdentity(email, env.PSX_PAPER_IDENTITY_SECRET);
    try {
      return ownedAccount(await request('/accounts', 'POST', { full_name: 'PSX Tracker Practice', email: identity.email, partner_reference_id: identity.reference }), identity);
    } catch (e) {
      // Concurrent tabs may both start; only the provider's unique email wins.
      if (e.status === 409 || e.code === 'PRACTICE_RETRY') {
        const recovered = await findAccount(email);
        if (recovered) return recovered;
      }
      throw e;
    }
  }
  async function snapshot(email, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw error('Invalid history page.', 400);
    const settings = await config();
    const a = await findAccount(email);
    if (!a) return { config: settings, account: null };
    const id = encodeURIComponent(a.account_id);
    const [p, orders, session] = await Promise.all([
      request(`/accounts/${id}/portfolio`), request(`/accounts/${id}/orders?limit=25&offset=${offset}`), request('/market/status'),
    ]);
    if (p.account_id !== a.account_id || orders.account_id !== a.account_id || !Array.isArray(p.positions) || !Array.isArray(orders.orders)) throw error('Could not verify your practice portfolio.');
    return { config: settings, account: { id: a.account_id, status: text(a.status) },
      portfolio: { cash: number(p.cash), availableCash: number(p.available_cash), reservedCash: number(p.reserved_cash), equity: number(p.equity),
        marketValue: number(p.positions_market_value), unrealizedPnl: number(p.total_unrealized_pnl), asOf: text(p.as_of),
        positions: p.positions.map(x => ({ symbol: text(x.symbol), quantity: number(x.quantity ?? x.qty ?? x.shares), averagePrice: number(x.avg_price ?? x.avg_cost ?? x.average_price),
          lastPrice: number(x.last_price ?? x.current_price ?? x.price), marketValue: number(x.market_value), unrealizedPnl: number(x.unrealized_pnl) })),
      },
      orders: orders.orders.map(normalizePracticeOrder), total: number(orders.total) ?? 0, offset,
      session: { name: text(session.session), canFill: session.can_fill === true, synthetic: session.synthetic === true },
    };
  }
  async function quote(symbol) {
    const clean = String(symbol || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,19}$/.test(clean)) throw error('Enter a valid PSX stock symbol.', 400);
    const q = await request(`/market/quote/${encodeURIComponent(clean)}`);
    return { symbol: clean, last: number(q.last), bid: number(q.bid), ask: number(q.ask), changePct: number(q.change_pct), synthetic: q.is_synthetic === true,
      asOf: text(q.as_of || q.ts), marketState: text(q.market_state), stale: q.stale === true };
  }
  async function place(email, input) {
    const order = validatePracticeOrder(input);
    await config();
    const a = await account(email);
    const result = await request('/orders', 'POST', { ...order, sub_account_id: a.account_id }, { 'Idempotency-Key': order.client_order_id });
    if (!identifier(result.order_id || result.id) || !result.status) throw error('Could not confirm the order response. Retry the same order to check it safely.', 503, 'PRACTICE_RETRY');
    return normalizePracticeOrder(result);
  }
  async function cancel(email, orderId) {
    if (!identifier(orderId)) throw error('Invalid practice order.', 400);
    await config();
    const a = await account(email);
    const order = await request(`/orders/${encodeURIComponent(orderId)}`);
    if ((order.sub_account_id || order.account_id) !== a.account_id) throw error('Practice order not found.', 404);
    return normalizePracticeOrder(await request(`/orders/${encodeURIComponent(orderId)}`, 'DELETE'));
  }
  return { config, start, snapshot, quote, place, cancel };
}
