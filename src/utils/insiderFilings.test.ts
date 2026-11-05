import { describe, expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
(globalThis as any).DOMParser = DOMParser;
import { parseInsiderFilings } from './insiderFilings';

const html = `<table>
<tr><td>Oct 7, 2026</td><td>Disclosure of Interest by a Director CEO, or Executive of a listed company and their Spouses and the Substantial Shareholders u/c 5.6.1.(d) of PSX Regulations </td><td><a href="javascript:" data-images="285107-1.gif">View</a><a href="/download/document/285107.pdf">PDF</a></td></tr>
<tr><td>Nov 4, 2026</td><td>Disclosure of Interest by a Director CEO</td><td><a href="javascript:" data-images="288033-1.gif">View</a></td></tr>
<tr><td>May 21, 2026</td><td>SHARIAH DISCLOSURE FOR THE YEAR ENDED DECEMBER 31, 2025</td><td><a href="/download/document/1.pdf">PDF</a></td></tr>
<tr><td>Oct 30, 2026</td><td>Financial Results for the Quarter</td><td><a href="/download/document/2.pdf">PDF</a></td></tr>
<tr><td>Oct 7, 2026</td><td>Disclosure of Interest by a Director CEO</td><td><a href="/download/document/285107.pdf">PDF</a></td></tr>
</table>`;

describe('insider filings', () => {
  it('keeps only director / big-shareholder disclosures, newest first, with a link', () => {
    const rows = parseInsiderFilings(html);
    expect(rows.map((r) => [r.date, r.url])).toEqual([
      ['Nov 4, 2026', 'https://dps.psx.com.pk/download/image/288033-1.gif'],
      ['Oct 7, 2026', 'https://dps.psx.com.pk/download/document/285107.pdf'],
    ]);
  });
});
