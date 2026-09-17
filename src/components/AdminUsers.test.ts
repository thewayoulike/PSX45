import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { computeAccess } from '../../lib/access.js';
import { StatusBadge } from './AdminUsers';

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
