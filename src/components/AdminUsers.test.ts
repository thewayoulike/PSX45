import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { computeAccess } from '../../lib/access.js';
import { StatusBadge, lastSeenLabel } from './AdminUsers';

describe('admin last seen', () => {
  const now = Date.parse('2026-10-21T22:00:00.000Z');
  it.each([
    ['2026-10-21T21:58:00.000Z', 'last seen just now'],
    ['2026-10-21T19:00:00.000Z', 'last seen 3h ago'],
    ['2026-10-18T22:00:00.000Z', 'last seen 3d ago'],
    [null, 'no visit recorded yet'],
    ['not a date', 'no visit recorded yet'],
  ])('labels %s as %s', (seen, label) => {
    expect(lastSeenLabel(seen, now)).toBe(label);
  });
});

describe('admin access badges match server access states', () => {
  const oldDate = '2020-01-01T00:00:00.000Z';
  const futureDate = '2099-01-01T00:00:00.000Z';
  it.each([
    ['Pending / Blocked', { approved: false }],
    ['Trial', { approved: true, approved_at: new Date().toISOString() }],
    ['Paid', { approved: true, access_until: futureDate }],
    ['Lifetime', { approved: true, lifetime: true }],
    ['Free', { approved: true, approved_at: oldDate }],
    ['Free', { approved: true, approved_at: oldDate, access_until: oldDate }],
    ['Free', { approved: true }],
  ])('renders %s from an actual server response without crashing', (label, row) => {
    const access = computeAccess(row);
    const html = renderToStaticMarkup(React.createElement(StatusBadge, { a: access as any }));
    expect(html).toContain(label);
  });

  it.each(['future-plan', 'constructor', '__proto__'])('handles unrecognized status %s', status => {
    const html = renderToStaticMarkup(React.createElement(StatusBadge, { a: { status } as any }));
    expect(html).toContain('Unknown');
  });

  it('handles users without an access object', () => {
    expect(renderToStaticMarkup(React.createElement(StatusBadge))).toContain('Pending / Blocked');
  });
});
