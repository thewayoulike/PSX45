import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartProjectionAccess, canUseChartProjection, useChartProjectionAccess } from './ChartProjectionAccess';
import type { AccessStatus } from '../services/auth';

const owner = 'itruth2011@gmail.com';
const allowed: AccessStatus = {
  approved: true, active: true, status: 'lifetime', plan: 'lifetime', lifetime: true,
  accountEmail: owner, features: { chartProjection: true },
};
const Feature = () => useChartProjectionAccess() ? React.createElement('button', null, 'Projected range') : null;

describe('private projection rollout', () => {
  it('defaults to hidden outside a verified signed-in provider', () => {
    expect(renderToStaticMarkup(React.createElement(Feature))).toBe('');
  });
  it('requires active, account-bound server permission and drops it across account changes', () => {
    expect(canUseChartProjection(allowed, ' ITRUTH2011@gmail.com ')).toBe(true);
    for (const [status, email] of [
      [undefined, owner], [allowed, undefined], [allowed, 'member@example.invalid'],
      [{ ...allowed, active: false }, owner], [{ ...allowed, accountEmail: undefined }, owner],
      [{ ...allowed, features: undefined }, owner],
      [{ ...allowed, features: { chartProjection: false } }, owner],
    ] as const) expect(canUseChartProjection(status, email)).toBe(false);
  });
  it('renders the beta only while the matching account permission is present', () => {
    const render = (email: string) => renderToStaticMarkup(
      React.createElement(ChartProjectionAccess.Provider, { value: canUseChartProjection(allowed, email) }, React.createElement(Feature)),
    );
    expect(render(owner)).toContain('Projected range');
    expect(render('other@example.invalid')).toBe('');
  });
});
