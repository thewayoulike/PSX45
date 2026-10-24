import { getSession } from './auth';
import { getValidToken } from './driveStorage';

export interface PracticeOrder {
  id: string; clientOrderId: string; symbol: string; side: string; type: string; status: string;
  quantity: number | null; filled: number | null; price: number | null; limitPrice: number | null;
  commission: number | null; fees: number | null; reason: string; createdAt: string;
}
export interface PracticeInput { symbol: string; side: 'BUY' | 'SELL'; quantity: number; orderType: 'MARKET' | 'LIMIT'; price?: number; clientOrderId: string }
export interface PracticeSnapshot {
  config: { environment: 'sandbox'; startingCash: number | null; commissionPct: number | null; currency: string; fees: { advanceRate: number | null; sstRate: number | null } };
  account: { id: string; status: string } | null;
  portfolio?: { cash: number | null; availableCash: number | null; reservedCash: number | null; equity: number | null; marketValue: number | null; unrealizedPnl: number | null; asOf: string;
    positions: { symbol: string; quantity: number | null; averagePrice: number | null; lastPrice: number | null; marketValue: number | null; unrealizedPnl: number | null }[] };
  orders?: PracticeOrder[]; total?: number; offset?: number;
  session?: { name: string; canFill: boolean; synthetic: boolean };
}
export interface PracticeQuote { symbol: string; last: number | null; bid: number | null; ask: number | null; changePct: number | null; synthetic: boolean; asOf: string; marketState: string; stale: boolean }

export async function practiceRequest<T>(email: string, body: Record<string, unknown>): Promise<T> {
  const normalized = email.trim().toLowerCase();
  const session = await getSession().catch(() => null);
  let token = session?.user?.email?.toLowerCase() === normalized ? session.access_token : null;
  if (!token) {
    let driveEmail = '';
    try { driveEmail = JSON.parse(localStorage.getItem('psx_drive_user_profile') || '{}').email || ''; } catch { /* no Google login */ }
    if (driveEmail.toLowerCase() === normalized) token = await getValidToken().catch(() => null);
  }
  if (!token) throw new Error('Please sign in again to use practice trading.');
  let res: Response;
  try { res = await fetch('/api/practice-trading', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(58_000), cache: 'no-store' }); }
  catch { throw new Error('Connection interrupted. For an order, use Retry same order to check it without creating a duplicate.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw Object.assign(new Error(data?.error || 'Practice trading is temporarily unavailable.'), { status: res.status });
  return data as T;
}
