import { beforeEach, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({ access: vi.fn(), practice: vi.fn() }));
vi.mock('./accountAccess.js', () => ({ accountAccessHandler: () => handlers.access }));
vi.mock('./practiceTradingRoute.js', () => ({ default: handlers.practice }));
import handler from '../api/check-access.js';

beforeEach(() => vi.clearAllMocks());

it('routes the practice rewrite directly through the protected practice handler', async () => {
  const req = { method: 'POST', query: { service: 'practice-trading' }, body: { action: 'order' } };
  const res = {};
  await handler(req, res);
  expect(handlers.practice).toHaveBeenCalledWith(req, res);
  expect(handlers.access).not.toHaveBeenCalled();
});

it('preserves ordinary account access requests', async () => {
  const req = { method: 'POST', body: { action: 'check' } };
  const res = {};
  await handler(req, res);
  expect(handlers.access).toHaveBeenCalledWith(req, res);
  expect(handlers.practice).not.toHaveBeenCalled();
});
