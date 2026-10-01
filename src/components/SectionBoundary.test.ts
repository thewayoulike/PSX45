import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionBoundary } from './SectionBoundary';

const fallback = (error: Error) => {
  const boundary = new SectionBoundary({ label: 'This card' });
  boundary.state = SectionBoundary.getDerivedStateFromError(error);
  return renderToStaticMarkup(boundary.render() as any);
};
it('shows an inline retry for a crashed card, and an update for a removed app file', () => {
  const crashed = fallback(new Error('x is undefined'));
  expect(crashed).toContain('This card couldn’t load');
  expect(crashed).toContain('Try again');
  expect(crashed).not.toContain('x is undefined');
  expect(fallback(new Error('Failed to fetch dynamically imported module: /assets/a.js'))).toContain('Update app');
});
