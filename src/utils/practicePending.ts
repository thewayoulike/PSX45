import type { PracticeInput } from '../services/practiceTrading';
const key = (email: string) => `psx_practice_pending:${email.trim().toLowerCase()}`;
export function readPracticePending(email: string): PracticeInput | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key(email)) || 'null');
    if (!v || !/^practice-[A-Za-z0-9-]{10,100}$/.test(v.clientOrderId) || !/^[A-Z][A-Z0-9.-]{0,19}$/.test(v.symbol) || !['BUY','SELL'].includes(v.side) || !['MARKET','LIMIT'].includes(v.orderType) || !Number.isSafeInteger(v.quantity) || v.quantity < 1) return null;
    if (v.orderType === 'LIMIT' && (typeof v.price !== 'number' || !Number.isFinite(v.price) || v.price <= 0)) return null;
    return { symbol: v.symbol, side: v.side, quantity: v.quantity, orderType: v.orderType, clientOrderId: v.clientOrderId, ...(v.orderType === 'LIMIT' ? { price: v.price } : {}) };
  } catch { return null; }
}
export function savePracticePending(email: string, order: PracticeInput | null) {
  try { if (order) sessionStorage.setItem(key(email), JSON.stringify(order)); else sessionStorage.removeItem(key(email)); } catch { /* History remains authoritative when browser storage is unavailable. */ }
}
