import { describe, expect, it } from 'vitest';
import { isMufapBlockedPage, parseMufapNavHtml } from './mufapParse.js';

/** Minimal modern MUFAP NAV table (AMC group header + fund row, no AMC column). */
const modernNavHtml = `
<html><body>
<span>Report Date:  Sep 22, 2026</span>
<table>
<tr><td colspan="20"><a class="group-link" href="/FundProfile/FundDirectory?group=Al%20Meezan">Al Meezan Investment Management Limited</a></td></tr>
<tr class="fund-block" role="row">
  <td class="d-none">Open-End Funds</td>
  <td class="text-left"><a href="/FundProfile/FundDetail?FundID=12824">Meezan Sovereign Fund</a></td>
  <td class="text-left">Shariah Compliant Income</td>
  <td>Feb 10, 2010</td>
  <td class="text-right">54.1650</td>
  <td class="text-right">53.5492</td>
  <td class="text-right">53.5492</td>
  <td>Sep 18, 2026</td>
  <td class="text-center">0</td>
  <td class="text-center">0</td>
</tr>
</table>
<!-- Cloudflare turnstile leftovers on successful pages -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback"></script>
<div class="cf-challenge-platform"></div>
</body></html>
`.repeat(1);

describe('mufapParse modern HTML', () => {
  it('does not treat challenge-platform widget alone as a blocked page', () => {
    expect(isMufapBlockedPage(modernNavHtml)).toBe(false);
  });

  it('parses AMC group-link headers and fund rows without an AMC column', () => {
    // Pad with enough synthetic rows so callers that require >=50 funds still work in sync,
    // but unit test checks the real fund is parsed.
    let html = modernNavHtml;
    for (let i = 0; i < 60; i++) {
      html += `<tr class="fund-block"><td class="d-none">Open-End Funds</td>
        <td><a href="/x">Pad Fund ${i}</a></td><td>Income</td><td>Jan 1, 2020</td>
        <td>10</td><td>10</td><td>10</td><td>Sep 18, 2026</td><td>0</td><td>0</td></tr>`;
    }
    const funds = parseMufapNavHtml(html);
    const msf = funds.find((f) => f.fundName === 'Meezan Sovereign Fund');
    expect(msf).toBeTruthy();
    expect(msf.amc).toMatch(/Al Meezan/i);
    expect(msf.nav).toBeCloseTo(53.5492, 4);
    expect(msf.validityDate).toBe('Sep 18, 2026');
  });
});
