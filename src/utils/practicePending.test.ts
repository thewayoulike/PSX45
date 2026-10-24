import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPracticePending, savePracticePending } from './practicePending';
const stored = new Map<string,string>();
beforeEach(() => { stored.clear(); vi.stubGlobal('sessionStorage', { getItem: (k:string) => stored.get(k) || null, setItem: (k:string,v:string) => stored.set(k,v), removeItem: (k:string) => stored.delete(k) }); });
const order = { symbol:'HBL',side:'BUY' as const,quantity:2,orderType:'LIMIT' as const,price:280,clientOrderId:'practice-12345678901' };
describe('pending practice submission recovery', () => {
  it('retains the same order reference after a reload', () => { savePracticePending('first@example.test',order); expect(readPracticePending('FIRST@example.test')).toEqual(order); });
  it('does not show another signed-in account a pending order', () => { savePracticePending('first@example.test',order); expect(readPracticePending('second@example.test')).toBeNull(); });
  it('clears only a confirmed or definitively rejected attempt', () => { savePracticePending('first@example.test',order); savePracticePending('first@example.test',null); expect(readPracticePending('first@example.test')).toBeNull(); });
  it('ignores corrupt or invalid data', () => { stored.set('psx_practice_pending:first@example.test','{}'); expect(readPracticePending('first@example.test')).toBeNull(); });
});
