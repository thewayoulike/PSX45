import { describe, expect, it } from 'vitest';
import { emailBodyImportKey, emailHtmlToText, gmailBodyText, gmailTextParts, MAX_SCAN_TEXT_LENGTH, validateScanText } from './gmailBody';
import { emailAttachmentKey } from './emailImportHistory';

const encoded = (text: string) => Buffer.from(text).toString('base64url');
describe('email body extraction', () => {
  it('decodes UTF-8 base64url and prefers plain text over the duplicate HTML alternative', () => {
    const text = 'BUY FFC 100 @ 500 — بروکر';
    const parts = gmailTextParts({ parts: [{ parts: [
      { mimeType: 'text/plain', body: { data: encoded(text) } },
      { mimeType: 'text/html', body: { data: encoded('<b>duplicate</b>') } },
    ] }] });
    expect(gmailBodyText(parts)).toBe(text);
  });
  it('extracts HTML table rows without executing HTML or including scripts, styles and tracking images', () => {
    const text = emailHtmlToText('<head><title>Hidden</title></head><script>steal()</script><style>bad</style><img src="https://tracker.invalid/pixel"><table><tr><th>Stock</th><th>Qty</th></tr><tr><td>FFC</td><td>100</td></tr></table><p>Rs&nbsp;50,000 &amp; fees &#8212; tax</p>');
    expect(text).toContain('Stock\tQty\nFFC\t100');
    expect(text).toContain('Rs 50,000 & fees — tax');
    expect(text).not.toMatch(/Hidden|steal|bad|tracker|<img/);
  });
  it('uses HTML when no nonempty plain body exists and skips attached text files', () => {
    const parts = gmailTextParts({ parts: [
      { mimeType: 'text/plain', body: { data: encoded('  ') } },
      { mimeType: 'text/html', body: { data: encoded('<p>SELL 10 FFC</p>') } },
      { mimeType: 'text/plain', filename: 'attachment.txt', body: { data: encoded('DO NOT MERGE') } },
    ] });
    expect(gmailBodyText(parts)).toBe('SELL 10 FFC');
  });
  it('recognizes single-part emails and externally stored text without treating it as a file', () => {
    expect(gmailTextParts({ mimeType: 'text/plain', body: { attachmentId: 'large-text' } })).toEqual([{ mimeType: 'text/plain', data: undefined, attachmentId: 'large-text' }]);
    expect(gmailTextParts({ mimeType: 'image/png', body: { attachmentId: 'picture' } })).toEqual([]);
  });
  it('does not silently truncate long emails or submit blank text', () => {
    expect(() => validateScanText(' '.repeat(3))).toThrow('no readable text');
    expect(() => validateScanText('x'.repeat(MAX_SCAN_TEXT_LENGTH + 1))).toThrow('too long');
    expect(validateScanText('  BUY FFC  ')).toBe('BUY FFC');
  });
  it('keeps body tracking separate from files in the same email and other emails', () => {
    expect(emailBodyImportKey('m1')).not.toBe(emailBodyImportKey('m2'));
    expect(emailBodyImportKey('m1')).not.toBe(emailAttachmentKey('m1', { partId: '1', id: 'file' }));
  });
});
