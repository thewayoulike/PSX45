import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const loginPage = readFileSync('src/components/LoginPage.tsx', 'utf8');

it('links the PSX Tracker Facebook page from the login screen and the landing footer', () => {
  expect(loginPage).toContain('https://www.facebook.com/psxtracker');
  expect(loginPage).toContain('target="_blank"');
  expect(loginPage).toContain('rel="noopener noreferrer"');
  expect(loginPage).toMatch(/if \(compact\)[\s\S]*FacebookPageLink/);
  expect(loginPage).toMatch(/<footer[\s\S]*FacebookPageLink/);
});
