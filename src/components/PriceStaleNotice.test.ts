import { expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceStaleNotice, formatPriceTime } from './PriceStaleNotice';

it('says prices failed to update and when the shown prices are from', () => {
  const at = '2026-10-01T10:20:00.000Z';
  const html = renderToStaticMarkup(React.createElement(PriceStaleNotice, { failed: true, lastUpdated: at }));
  expect(html).toContain('Prices couldn’t update');
  expect(html).toContain(formatPriceTime(at));
  expect(html).toContain('role="status"');
  expect(renderToStaticMarkup(React.createElement(PriceStaleNotice, { failed: true, lastUpdated: null, isFunds: true }))).toContain('NAVs couldn’t update, and none are saved');
  expect(renderToStaticMarkup(React.createElement(PriceStaleNotice, { failed: false, lastUpdated: at }))).toBe('');
});
