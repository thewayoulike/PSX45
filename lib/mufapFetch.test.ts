import { expect, it, vi } from 'vitest';
import { fetchNavWithFallback, packNavReport, sourceError } from './mufapFetch.js';

it('reports HTTP blocks and security pages explicitly', () => {
  expect(sourceError(403, '<title>Just a moment...</title>', 'MUFAP')).toMatchObject({ code: 'SOURCE_BLOCKED' });
  expect(sourceError(200, 'Title: Just a moment...', 'relay')).toMatchObject({ code: 'SOURCE_BLOCKED' });
  expect(sourceError(503, 'Unavailable', 'MUFAP')?.message).toContain('503');
});

it('does not treat an embedded security widget in a valid fund table as a block', () => {
  const html = `<table><tr><td colspan="20"><a class="group-link">ABC Asset Management Limited</a></td></tr>${Array.from({length:60},(_,i)=>
    `<tr class="fund-block"><td>Open-End Funds</td><td>Income Fund ${i}</td><td>Income</td><td>Jan 1, 2020</td><td>10</td><td>10</td><td>10</td><td>Oct 21, 2026</td><td>0</td><td>0</td></tr>`).join('')}</table><script src="challenge-platform"></script>`;
  const pack = packNavReport(html, '2026-10-24', 'test');
  expect(pack.funds).toHaveLength(60);
  expect(pack.dateYmd).toBe('2026-10-21');
});

it('retains both failure causes and stops retrying dates for a source-wide block', async () => {
  const first = vi.fn().mockRejectedValue(sourceError(403, '', 'browser'));
  const second = vi.fn().mockRejectedValue(sourceError(200, 'Just a moment', 'relay'));
  await expect(fetchNavWithFallback(first, second)).rejects.toMatchObject({ code:'SOURCE_BLOCKED', message: expect.stringMatching(/browser.*relay/) });
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  await expect(fetchNavWithFallback(first, async () => ({ dateYmd:'2026-10-23' }))).resolves.toMatchObject({ dateYmd:'2026-10-23' });
});
