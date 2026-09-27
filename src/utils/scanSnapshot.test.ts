import { describe, expect, it, vi } from 'vitest';
import { paginateSnapshotBlocks, snapshotCrc32, wrapSnapshotText, zipSnapshotFiles, snapshotColumns, renderScanSnapshot, type SnapshotStock } from './scanSnapshot';

describe('complete local snapshots', () => {
  it('renders full explanations and all take-profit rows inside each image', async () => {
    const painted: { text: string; y: number; height: number }[] = [];
    const canvas = { width: 0, height: 1, getContext: () => ctx, toBlob: (done: (blob: Blob) => void) => done(new Blob(['test image'])) };
    const ctx = {
      measureText: (s: string) => ({ width: s.length * 12 }),
      fillText: (text: string, _x: number, y: number) => { if (canvas.height > 1) painted.push({ text, y, height: canvas.height }); },
      fillRect: () => {}, beginPath: () => {}, roundRect: () => {}, fill: () => {}, stroke: () => {}, moveTo: () => {}, lineTo: () => {},
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      for (const layout of ['portrait', 'columns', 'landscape'] as const) {
        painted.length = 0;
        const files = await renderScanSnapshot({ layout, scannedAt: 'Example date', context: 'Daily', note: 'Illustrative', stocks: [{
          symbol: 'TEST', rating: 'Neutral', facts: [],
          sections: [{ title: 'Price levels and trade plan', kind: 'levels', rows: [1, 2, 3].map(n => ({ label: `Take profit ${n}`, value: String(100 + n) })) }],
          notes: [{ title: 'How the rating works', paragraphs: ['Buy +1, Neutral 0, Sell -1. '.repeat(30) + 'EXPLANATION_END'] }],
        }] });
        expect(files).toHaveLength(1);
        for (const n of [1, 2, 3]) expect(painted.some(p => p.text === `Take profit ${n}`)).toBe(true);
        expect(painted.some(p => p.text === 'How the rating works')).toBe(true);
        expect(painted.map(p => p.text).join(' ')).toContain('EXPLANATION_END');
        expect(painted.map(p => p.text).join(' ')).toContain('Do your own research and assess your risk before investing.');
        expect(painted.every(p => p.y >= 0 && p.y + 24 <= p.height)).toBe(true);
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves every field in all three layouts, including extra sections', () => {
    const stock: SnapshotStock = { symbol: 'DEMO', rating: 'Neutral', facts: [{ label: 'Quote', value: '100' }], sections: [
      { title: 'Averages', kind: 'averages', rows: Array.from({ length: 15 }, (_, i) => ({ label: `MA ${i}`, value: String(i) })) },
      { title: 'Oscillators', kind: 'oscillators', rows: Array.from({ length: 11 }, (_, i) => ({ label: `OSC ${i}`, value: String(i) })) },
      { title: 'Levels', rows: [{ label: 'Support', value: '90' }] },
      { title: 'Backtest', rows: [{ label: 'Trades', value: '10' }] },
    ] };
    const expected = [...stock.facts, ...stock.sections.flatMap(s => s.rows)].map(r => r.label).sort();
    for (const layout of ['portrait', 'columns', 'landscape'] as const) {
      const columns = snapshotColumns(stock, layout);
      expect(columns.flatMap(c => c.flatMap(s => s.rows)).map(r => r.label).sort()).toEqual(expected);
      expect(columns.length).toBe(layout === 'portrait' ? 1 : layout === 'columns' ? 2 : 3);
    }
  });
  it('wraps long labels and words without losing text', () => {
    const text = 'Volume Weighted Moving Average (20)';
    const lines = wrapSnapshotText(text, 12, s => s.length);
    expect(lines.join(' ')).toBe(text);
    expect(lines.every(s => s.length <= 12)).toBe(true);
    expect(wrapSnapshotText('ABCDEFGHIJK', 4, s => s.length).join('')).toBe('ABCDEFGHIJK');
  });
  it('keeps every row in order across bounded pages and moves headings with rows', () => {
    const blocks = [{ height: 80 }, { height: 10, keepWithNext: true }, { height: 30 }, ...Array.from({ length: 120 }, () => ({ height: 25 }))];
    const pages = paginateSnapshotBlocks(blocks, 100);
    expect(pages.flat()).toEqual(blocks);
    expect(pages[0]).toHaveLength(1);
    expect(pages.every(p => p.reduce((n, b) => n + b.height, 0) <= 100)).toBe(true);
    expect(() => paginateSnapshotBlocks([{ height: 101 }], 100)).toThrow();
  });
  it('writes a valid ZIP directory and preserves each image byte for byte', async () => {
    expect(snapshotCrc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const files = [
      { name: '001-OGDC.png', blob: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2])]) },
      { name: '002-PPL.png', blob: new Blob([new Uint8Array([137, 80, 78, 71, 3, 4])]) },
    ];
    const bytes = new Uint8Array(await (await zipSnapshotFiles(files)).arrayBuffer());
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (const file of files) {
      expect(view.getUint32(offset, true)).toBe(0x04034b50);
      const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true);
      expect(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameSize))).toBe(file.name);
      expect(bytes.slice(offset + 30 + nameSize, offset + 30 + nameSize + size)).toEqual(new Uint8Array(await file.blob.arrayBuffer()));
      offset += 30 + nameSize + size;
    }
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2);
    expect(view.getUint32(bytes.length - 6, true)).toBe(offset);
  });
});
