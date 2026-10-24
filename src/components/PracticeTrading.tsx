import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, RefreshCw, ArrowUpRight, ArrowDownRight, ShieldCheck, Wallet, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { practiceRequest, type PracticeSnapshot, type PracticeQuote, type PracticeInput, type PracticeOrder } from '../services/practiceTrading';
import './practice-trading.css';
import { readPracticePending, savePracticePending } from '../utils/practicePending';

const amount = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PKT' : 'Time unavailable';
const label = (value = '') => value.replace(/_/g, ' ').toLowerCase();
const pending = (status: string) => ['PENDING', 'PARTIALLY_FILLED', 'NEW', 'ACCEPTED', 'OPEN'].includes(status);
type RequestFn = <T>(email: string, body: Record<string, unknown>) => Promise<T>;

export const PracticeTrading: React.FC<{ email: string; request?: RequestFn }> = ({ email, request = practiceRequest }) => {
  const [data, setData] = useState<PracticeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offset, setOffset] = useState(0);
  const [symbol, setSymbol] = useState('HBL');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [quote, setQuote] = useState<PracticeQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [review, setReview] = useState<PracticeInput | null>(() => readPracticePending(email));
  const [uncertain, setUncertain] = useState(() => !!readPracticePending(email));
  const active = useRef(true);
  const refreshing = useRef(false);
  const refreshSequence = useRef(0);
  const submitting = useRef(false);
  const quoteSequence = useRef(0);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if ((quiet && refreshing.current) || submitting.current) return;
    const seq = ++refreshSequence.current;
    refreshing.current = true;
    if (!quiet) setLoading(true);
    try {
      const next = await request<PracticeSnapshot>(email, { action: 'snapshot', offset });
      if (active.current && seq === refreshSequence.current) { setData(next); if (!quiet) setError(''); }
    } catch (e) { if (active.current && seq === refreshSequence.current) setError(e instanceof Error ? e.message : 'Could not refresh practice trading.'); }
    finally { if (seq === refreshSequence.current) { refreshing.current = false; if (active.current) setLoading(false); } }
  }, [email, offset, request]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 30_000);
    return () => { active.current = false; ++refreshSequence.current; refreshing.current = false; window.clearInterval(timer); };
  }, [refresh]);

  const loadQuote = useCallback(async (value: string) => {
    const clean = value.trim().toUpperCase();
    const seq = ++quoteSequence.current;
    setQuote(null); setQuoteError('');
    if (!/^[A-Z][A-Z0-9.-]{0,19}$/.test(clean)) { setQuoteLoading(false); return; }
    setQuoteLoading(true);
    try { const next = await request<PracticeQuote>(email, { action: 'quote', symbol: clean }); if (active.current && seq === quoteSequence.current) setQuote(next); }
    catch (e) { if (active.current && seq === quoteSequence.current) setQuoteError(e instanceof Error ? e.message : 'Quote unavailable.'); }
    finally { if (active.current && seq === quoteSequence.current) setQuoteLoading(false); }
  }, [email, request]);
  useEffect(() => { if (!data?.account) return; const timer = window.setTimeout(() => void loadQuote(symbol), 400); return () => window.clearTimeout(timer); }, [symbol, !!data?.account, loadQuote]);

  async function start() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { setData(await request<PracticeSnapshot>(email, { action: 'start' })); setMessage('Your virtual account is ready.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start practice trading.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  function prepare(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    const qty = Number(quantity), limit = Number(price), clean = symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,19}$/.test(clean) || !Number.isSafeInteger(qty) || qty <= 0 || qty > 1_000_000_000 || (orderType === 'LIMIT' && (!Number.isFinite(limit) || limit <= 0 || limit > 10_000_000))) { setError('Enter a valid stock symbol, whole number of shares, and limit price if needed.'); return; }
    setReview({ symbol: clean, side, quantity: qty, orderType, ...(orderType === 'LIMIT' ? { price: limit } : {}), clientOrderId: `practice-${crypto.randomUUID()}` });
    setUncertain(false);
  }
  async function submitOrder() {
    if (!review || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    savePracticePending(email, review);
    try {
      const result = await request<{ order: PracticeOrder }>(email, { action: 'order', order: review });
      setMessage(`Practice ${review.side.toLowerCase()} ${label(result.order.status) || 'received'}${result.order.reason ? ` · ${label(result.order.reason)}` : ''}.`);
      savePracticePending(email, null); setReview(null); setUncertain(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm this order.');
      const status = (e as { status?: number })?.status;
      const unknownOutcome = !status || status >= 500;
      setUncertain(unknownOutcome);
      if (!unknownOutcome) savePracticePending(email, null);
    }
    finally { submitting.current = false; setBusy(false); void refresh(true); }
  }
  async function cancel() {
    if (!cancelId || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await request(email, { action: 'cancel', orderId: cancelId }); setMessage('Practice order cancellation received.'); setCancelId(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not cancel this order.'); }
    finally { submitting.current = false; setBusy(false); void refresh(true); }
  }
  const portfolio = data?.portfolio;
  const selectedQuote = quote?.symbol === symbol.trim().toUpperCase() ? quote : null;
  const estimatedPrice = orderType === 'LIMIT' ? Number(price) || null : selectedQuote?.last;
  const estimatedNotional = estimatedPrice && Number(quantity) > 0 ? estimatedPrice * Number(quantity) : null;

  return <section className="practice-page" aria-label="Practice Trading">
    <header className="practice-heading">
      <div><div className="practice-eyebrow"><FlaskConical size={14} /> Virtual money only</div><h1>Practice Trading</h1><p>Build your confidence with a separate PSX practice portfolio.</p></div>
      <button className="practice-button practice-secondary" onClick={() => void refresh()} disabled={loading || busy} aria-label="Refresh practice portfolio"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </header>
    <div className="practice-notice"><ShieldCheck size={18} /><span>All orders are simulated through pyPSX. No real money or shares are traded, and your real portfolio is unaffected.</span></div>
    {error && <div className="practice-error" role="alert">{error}</div>}
    {message && <div className="practice-success" role="status">{message}</div>}
    {!data ? <div className="practice-panel practice-empty" role="status">{loading ? <><Loader2 className="animate-spin" /> Connecting to practice trading…</> : <><p>Practice trading could not be loaded.</p><button className="practice-button" onClick={() => void refresh()}>Try again</button></>}</div> : !data.account ?
      <div className="practice-panel practice-welcome"><div className="practice-welcome-icon"><Wallet size={30} /></div><h2>Your first practice portfolio</h2><p>Start with <strong>PKR {amount(data.config.startingCash)}</strong> in virtual cash. Practise buying and selling PSX stocks, then follow your positions and order history.</p><div className="practice-welcome-details"><span>Market &amp; limit orders</span><span>Simulated commission: {data.config.commissionPct ?? '—'}%</span><span>Available on your other devices</span></div><button className="practice-button" onClick={() => void start()} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />} Start practice trading</button><small>Your practice account is hosted by pyPSX using an anonymous account reference. Your real portfolio is not uploaded.</small></div> : <>
      <div className="practice-stats">
        {[['Portfolio value', portfolio?.equity], ['Available cash', portfolio?.availableCash], ['Invested value', portfolio?.marketValue], ['Unrealized P&L', portfolio?.unrealizedPnl]].map(([name, value]) => <div className="practice-panel practice-stat" key={String(name)}><span>{name}</span><strong className={name === 'Unrealized P&L' ? Number(value) < 0 ? 'practice-negative' : 'practice-positive' : ''}><small>PKR </small>{amount(value as number | null)}</strong></div>)}
      </div>
      <div className="practice-session"><span className="practice-pill">{data.session?.synthetic ? 'Simulated prices' : 'PSX prices'} · {label(data.session?.name) || 'Session unavailable'}</span><span>{data.session?.canFill ? 'Practice orders may fill during this session.' : 'Orders may queue until the next market session.'}</span><span>Reserved cash: PKR {amount(portfolio?.reservedCash)}</span></div>
      <div className="practice-workspace">
        <div className="practice-panel practice-ticket"><h2>Place a practice order</h2><form onSubmit={prepare}>
          <fieldset disabled={busy || !!review}>
            <label htmlFor="practice-symbol">Stock symbol</label><div className="practice-symbol-row"><input id="practice-symbol" value={symbol} maxLength={20} onChange={e => { ++quoteSequence.current; setSymbol(e.target.value.toUpperCase()); setQuote(null); }} placeholder="e.g. HBL" autoComplete="off" required /><button type="button" className="practice-button practice-secondary" onClick={() => void loadQuote(symbol)} disabled={quoteLoading} aria-label="Refresh stock quote"><RefreshCw size={16} /></button></div>
            <div className="practice-quote" aria-live="polite"><span>{quoteLoading ? 'Getting quote…' : selectedQuote ? `${selectedQuote.symbol} · ${selectedQuote.synthetic ? 'simulated price' : 'PSX reference price'}` : quoteError || 'Enter a symbol to see its price.'}</span>{selectedQuote && <><strong>PKR {amount(selectedQuote.last)}</strong><small>{when(selectedQuote.asOf)}{selectedQuote.stale ? ' · May be stale' : ''}</small></>}</div>
            <div className="practice-toggle" aria-label="Order side"><button type="button" aria-pressed={side === 'BUY'} className={side === 'BUY' ? 'selected-buy' : ''} onClick={() => setSide('BUY')}><ArrowUpRight size={16} /> Buy</button><button type="button" aria-pressed={side === 'SELL'} className={side === 'SELL' ? 'selected-sell' : ''} onClick={() => setSide('SELL')}><ArrowDownRight size={16} /> Sell</button></div>
            <div className="practice-fields"><div><label htmlFor="practice-quantity">Shares</label><input id="practice-quantity" type="number" inputMode="numeric" min="1" max="1000000000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required /></div><div><label htmlFor="practice-type">Order type</label><select id="practice-type" value={orderType} onChange={e => setOrderType(e.target.value as 'MARKET' | 'LIMIT')}><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select></div></div>
            {orderType === 'LIMIT' && <><label htmlFor="practice-price">Limit price · PKR per share</label><input id="practice-price" type="number" inputMode="decimal" min="0.0001" max="10000000" step="any" value={price} onChange={e => setPrice(e.target.value)} required /></>}
            <div className="practice-estimate"><span>Estimated value</span><strong>PKR {amount(estimatedNotional)}</strong></div><p className="practice-small">Before simulated fees. Commission: {data.config.commissionPct ?? '—'}%. Market orders fill at the available price, which can differ from this quote.</p>
            <button className="practice-button practice-full" type="submit">Review practice {side.toLowerCase()}</button>
          </fieldset>
        </form>
        {review && <div className="practice-review" aria-label="Review practice order"><h3>{uncertain ? 'Check this practice order' : 'Review your practice order'}</h3><p><strong>{review.side} {review.quantity.toLocaleString()} {review.symbol}</strong><br />{review.orderType === 'LIMIT' ? `Limit: PKR ${amount(review.price)}` : 'Market order · final price determined at fill'}</p><p className="practice-small">{uncertain ? 'Retry uses the same reference to avoid a second order. Check the history before starting a different order.' : 'This uses virtual cash only. Simulated fees apply at fill.'}</p><button type="button" className="practice-button practice-full" disabled={busy} onClick={() => void submitOrder()}>{busy ? 'Submitting…' : uncertain ? 'Retry same order' : 'Confirm practice order'}</button><button type="button" className="practice-link" disabled={busy} onClick={() => { setReview(null); setUncertain(false); }}>{uncertain ? 'Close review' : 'Edit order'}</button></div>}
        </div>
        <div className="practice-panel practice-positions"><div className="practice-panel-heading"><h2>Practice positions</h2><span>{portfolio?.positions.length || 0} stocks</span></div>
          {!portfolio?.positions.length ? <div className="practice-empty"><FlaskConical size={28} /><h3>Your practice holdings will appear here</h3><p>A submitted order becomes a position when it fills.</p></div> : <div className="practice-position-list">{portfolio.positions.map(p => <button type="button" className="practice-position" key={p.symbol} onClick={() => { setSymbol(p.symbol); setSide('SELL'); }} disabled={!!review || busy}><div><strong>{p.symbol}</strong><span>{p.quantity?.toLocaleString() ?? '—'} shares · Avg. {amount(p.averagePrice)}</span></div><div><strong>PKR {amount(p.marketValue)}</strong><span className={(p.unrealizedPnl ?? 0) < 0 ? 'practice-negative' : 'practice-positive'}>{amount(p.unrealizedPnl)} unrealized</span></div></button>)}</div>}
          <p className="practice-small practice-position-foot">Practice balances and positions are saved with pyPSX and stay separate from your Google Drive portfolio.</p>
        </div>
      </div>
      <div className="practice-panel practice-history"><div className="practice-panel-heading"><h2>Practice order history</h2><span>{data.total ?? 0} orders</span></div>
        {!data.orders?.length ? <p className="practice-history-empty">No practice orders on this page.</p> : <div className="practice-table-wrap"><table><thead><tr><th>Stock / time</th><th>Order</th><th>Shares / filled</th><th>Fill price</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.orders.map(o => <tr key={o.id}><td><strong>{o.symbol}</strong><small>{when(o.createdAt)}</small></td><td><span className={o.side === 'BUY' ? 'practice-positive' : 'practice-negative'}>{o.side}</span><small>{label(o.type)}{o.type === 'LIMIT' ? ` · ${amount(o.limitPrice)}` : ''}</small></td><td>{o.quantity?.toLocaleString() ?? '—'}<small>{o.filled?.toLocaleString() ?? '—'} filled</small></td><td>{amount(o.price)}<small>PKR</small></td><td><span className={`practice-status ${o.status === 'FILLED' ? 'practice-positive' : ''}`}>{label(o.status)}</span>{o.reason && <small>{label(o.reason)}</small>}</td><td>{pending(o.status) && <button className="practice-link" disabled={busy} onClick={() => setCancelId(o.id)}>Cancel</button>}</td></tr>)}</tbody></table></div>}
        {cancelId && <div className="practice-cancel" role="group" aria-label="Cancel practice order"><span>Cancel the unfilled part of this practice order?</span><button className="practice-button practice-secondary" onClick={() => void cancel()} disabled={busy}>Confirm cancel</button><button className="practice-link" onClick={() => setCancelId(null)} disabled={busy}>Keep order</button></div>}
        <div className="practice-pagination"><span>25 per page · {data.total ? `${offset + 1}–${Math.min(offset + 25, data.total)} of ${data.total}` : '0 orders'}</span><div><button aria-label="Previous practice orders" disabled={!offset || loading || busy} onClick={() => setOffset(Math.max(0, offset - 25))}><ChevronLeft size={18} /></button><button aria-label="Next practice orders" disabled={offset + 25 >= (data.total || 0) || loading || busy} onClick={() => setOffset(offset + 25)}><ChevronRight size={18} /></button></div></div>
      </div>
      <p className="practice-small">Updated {when(portfolio?.asOf)} · Refreshes every 30 seconds while this page is visible. Sandbox results do not guarantee real trading outcomes.</p>
    </>}
  </section>;
};
