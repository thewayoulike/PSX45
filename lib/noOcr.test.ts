import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('does not ship OCR.space or an OCR API key in app source', () => {
  expect(existsSync('src/services/ocrSpace.ts')).toBe(false);
  const form = readFileSync('src/components/TransactionForm.tsx', 'utf8');
  expect(form).not.toContain('OCR_SCAN');
  expect(form).not.toContain('ocr.space');
  expect(form).not.toContain('VITE_OCR_API_KEY');
  const csp = JSON.parse(readFileSync('vercel.json', 'utf8')).headers
    .find((h: { source: string }) => h.source === '/(.*)').headers
    .find((h: { key: string }) => h.key === 'Content-Security-Policy').value as string;
  expect(csp).not.toContain('ocr.space');
  const privacy = readFileSync('config/publicPages.js', 'utf8');
  expect(privacy).not.toContain('OCR.space');
  expect(privacy).not.toContain('ocr.space');
});
