import { beforeEach, expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { list: async () => [], generateContent: generate }; },
  Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
}));
import { parseTradeDocument, parseFundBalanceDocument, setGeminiApiKey } from './gemini';

beforeEach(() => { generate.mockReset(); setGeminiApiKey('test-key'); });

it('sends reviewed email content as text and returns parsed trades for review without binary uploads', async () => {
  const trades = [{ ticker: 'FFC', type: 'BUY', quantity: 100, price: 500, date: '2026-09-25' }];
  generate.mockResolvedValue({ text: JSON.stringify(trades) });
  const text = 'Trade date: 25 Sep 2026\nBUY FFC 100 @ 500';
  expect(await parseTradeDocument(new File([text], 'Email - confirmation.txt', { type: 'text/plain' }))).toEqual(trades);
  const request = generate.mock.calls[0][0];
  expect(request.contents.parts.some((part: any) => part.text === text)).toBe(true);
  expect(request.contents.parts.every((part: any) => !part.inlineData)).toBe(true);
  expect(request.config.responseMimeType).toBe('application/json');
});

it('supports text-only fund confirmations through the existing fund review path', async () => {
  generate.mockResolvedValue({ text: JSON.stringify({ holdings: [], cashFlows: [{ type: 'DEPOSIT', amount: 5000 }] }) });
  const text = 'Subscription confirmation: PKR 5,000';
  const result = await parseFundBalanceDocument(new File([text], 'Email.txt', { type: 'text/plain' }));
  expect(result.cashFlows[0].amount).toBe(5000);
  expect(generate.mock.calls[0][0].contents.parts.some((part: any) => part.text === text)).toBe(true);
});

it('requires a configured API key before sending email contents', async () => {
  setGeminiApiKey(null);
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(parseTradeDocument(new File(['BUY FFC'], 'email.txt', { type: 'text/plain' }))).rejects.toThrow('API Key missing');
  expect(generate).not.toHaveBeenCalled();
  errorLog.mockRestore();
});

it('rejects empty email text before calling the model', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(parseTradeDocument(new File(['  '], 'email.txt', { type: 'text/plain' }))).rejects.toThrow('no readable text');
  expect(generate).not.toHaveBeenCalled();
  errorLog.mockRestore();
});
