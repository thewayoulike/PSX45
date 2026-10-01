import { beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../utils/retryableModule', () => ({ retryableModule: () => load }));
import { loadScanEngine, SCAN_ENGINE_UNAVAILABLE, ScanEngineLoadError } from './scanEngine';
import { ScanErrorPanel } from '../components/ScanErrorPanel';
beforeEach(() => { load.mockReset(); });
it('treats an engine download failure separately from a document error', async () => {
  load.mockRejectedValue(new Error('network'));
  const caught = await loadScanEngine().catch(error => error);
  expect(caught).toBeInstanceOf(ScanEngineLoadError);
  const html = renderToStaticMarkup(React.createElement(ScanErrorPanel, {message:SCAN_ENGINE_UNAVAILABLE,emailText:false,onRetry:vi.fn(),onChangeSource:vi.fn()}));
  expect(html).toContain('Retry AI Scan');
  expect(html).toContain('has not been read or sent to AI');
  expect(html).not.toMatch(/Try Different File|example.invalid|gemini.js/);
});
it('can prepare or retry the engine without reading a document or invoking the AI', async () => {
  const parseTradeDocument = vi.fn(), parseFundBalanceDocument = vi.fn();
  load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({parseTradeDocument,parseFundBalanceDocument});
  await expect(loadScanEngine()).rejects.toBeInstanceOf(ScanEngineLoadError);
  await expect(loadScanEngine()).resolves.toEqual({parseTradeDocument,parseFundBalanceDocument});
  expect(parseTradeDocument).not.toHaveBeenCalled();
  expect(parseFundBalanceDocument).not.toHaveBeenCalled();
});
it('asks for the current app version when a newer release removed the engine file', async () => {
  load.mockRejectedValue(new Error('Failed to fetch dynamically imported module: https://example.invalid/assets/gemini.js'));
  const caught = await loadScanEngine().catch(error => error);
  expect(caught).toBeInstanceOf(ScanEngineLoadError);
  expect(caught.outdated).toBe(true);
  const html = renderToStaticMarkup(React.createElement(ScanErrorPanel, {message:caught.message,emailText:false,onRetry:vi.fn(),onChangeSource:vi.fn()}));
  expect(html).toContain('Update app');
  expect(html).not.toMatch(/Retry AI Scan|Try Different File|example.invalid|gemini.js/);
});
