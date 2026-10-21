import { describe, expect, it } from 'vitest';
import { isShariahCompliant } from './shariah';

describe('Shariah compliance tag', () => {
  it.each([
    [['ALLSHR', 'KMIALLSHR'], true],
    [['KMI30', 'KSE100'], true],
    [['ALLSHR', 'MZNPI'], true],
    [['ALLSHR', 'KSE100', 'KSE100PR'], false],
    [[], false],
  ])('%j → %s', (tags, expected) => {
    expect(isShariahCompliant(tags)).toBe(expected);
  });

  it('ignores case and spacing', () => {
    expect(isShariahCompliant([' kmiallshr '])).toBe(true);
  });
});
