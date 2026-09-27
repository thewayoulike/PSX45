/** Local-only image export. No network calls, DOM capture, storage or portfolio fields. */
import { SCAN_DISCLAIMER } from './technicalRatings';
export interface SnapshotRow { label: string; value: string; signal?: string }
export interface SnapshotSection { title: string; rows: SnapshotRow[]; kind?: 'averages' | 'oscillators' | 'overview' | 'levels' }
export interface SnapshotNote { title: string; paragraphs: string[] }
export type SnapshotLayout = 'portrait' | 'columns' | 'landscape';
export interface SnapshotVotes { buys: number; neutrals: number; sells: number }
export interface SnapshotGroup extends SnapshotVotes { label: string; rating: string; available: number; total: number }
export interface SnapshotSummary extends SnapshotVotes {
  score: number | null;
  caption: string;
  methodology: string;
  available: number;
  total: number;
  groups: SnapshotGroup[];
}
export interface SnapshotStock {
  symbol: string;
  rating: string;
  facts: SnapshotRow[];
  sections: SnapshotSection[];
  company?: string;
  price?: string;
  change?: string;
  priceNote?: string;
  summary?: SnapshotSummary;
  notes?: SnapshotNote[];
}
export interface ScanSnapshot {
  scannedAt: string;
  context: string;
  note: string;
  stocks: SnapshotStock[];
  layout?: SnapshotLayout;
}
export interface SnapshotFile { name: string; blob: Blob }

const MARGIN = 54, FOOTER = 130;
const ink = '#142033', muted = '#64748b', green = '#008b70', red = '#df365a';
const color = (signal = '') => /buy/i.test(signal) ? green : /sell/i.test(signal) ? red : /neutral/i.test(signal) ? '#a97100' : muted;
const safeName = (s: string) => s.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'scan';
const font = (size: number, bold = false) => `${bold ? '700' : '400'} ${size}px Arial, sans-serif`;

export function wrapSnapshotText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line + char) > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

type Block = { kind: 'section' | 'row'; label: string[]; value?: string[]; signal?: string; height: number; keepWithNext?: boolean };
export function paginateSnapshotBlocks<T extends { height: number; keepWithNext?: boolean }>(blocks: T[], available: number): T[][] {
  const pages: T[][] = []; let page: T[] = [], height = 0;
  for (const [index, block] of blocks.entries()) {
    if (block.height > available) throw new Error('A scan field is too long to fit in an image. Shorten the field and try again.');
    const needed = block.height + (block.keepWithNext ? blocks[index + 1]?.height || 0 : 0);
    if (height + Math.min(needed, available) > available && page.length) { pages.push(page); page = []; height = 0; }
    page.push(block); height += block.height;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
}

/** Layout changes placement only: every input section and row is retained. */
export function snapshotColumns(stock: SnapshotStock, layout: SnapshotLayout): SnapshotSection[][] {
  const overview: SnapshotSection = { title: 'Snapshot overview', rows: stock.facts, kind: 'overview' };
  const averages = stock.sections.filter(s => s.kind === 'averages');
  const oscillators = stock.sections.filter(s => s.kind === 'oscillators');
  const other = stock.sections.filter(s => s.kind !== 'averages' && s.kind !== 'oscillators');
  if (layout === 'portrait') return [[overview, ...stock.sections]];
  if (layout === 'landscape') return [[overview, ...other], averages, oscillators];
  return [[...averages, overview], [...oscillators, ...other]];
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, border?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fillStyle = fill; ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
}

function drawGauge(ctx: CanvasRenderingContext2D, cx: number, y: number, radius: number, score: number | null, methodology: string) {
  const palette = ['#ed3f65', '#f78491', '#ebcf85', '#79cead', '#009879'];
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(cx, y, radius, Math.PI + i * Math.PI / 5, Math.PI + (i + 1) * Math.PI / 5);
    ctx.lineWidth = 19; ctx.strokeStyle = score == null ? '#dce3e9' : palette[i]; ctx.stroke();
  }
  if (score != null && Number.isFinite(score)) {
    const angle = Math.PI + (Math.max(-1, Math.min(1, score)) + 1) / 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + Math.cos(angle) * (radius - 18), y + Math.sin(angle) * (radius - 18));
    ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, y, 9, 0, 2 * Math.PI); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  } else {
    ctx.font = font(22, true); ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('Incomplete data', cx, y - 40);
  }
  ctx.font = font(17); ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText('Strong Sell', cx - radius - 10, y + 23);
  ctx.textAlign = 'center'; ctx.fillText('Neutral', cx, y + 23);
  ctx.textAlign = 'right'; ctx.fillText('Strong Buy', cx + radius + 10, y + 23);
  ctx.textAlign = 'center'; ctx.font = font(18);
  wrapSnapshotText(methodology, radius * 2 + 60, s => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, cx, y + 57 + i * 23));
  ctx.textAlign = 'left';
}

function paintHeader(ctx: CanvasRenderingContext2D, width: number, stock: SnapshotStock, snapshot: ScanSnapshot, layout: SnapshotLayout): number {
  const text = (value: string, x: number, y: number, size = 23, fill = ink, bold = false) => {
    ctx.font = font(size, bold); ctx.fillStyle = fill; ctx.fillText(value, x, y);
  };
  const paragraph = (value: string, x: number, y: number, max: number, size = 23, fill = muted) => {
    ctx.font = font(size);
    const lines = wrapSnapshotText(value, max, s => ctx.measureText(s).width);
    lines.forEach((line, i) => text(line, x, y + i * (size + 9), size, fill));
    return lines.length * (size + 9);
  };
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  text('PSX TRACKER  /  TECHNICAL SNAPSHOT', MARGIN, 48, 22, green, true);
  text(stock.symbol, MARGIN, 99, 48, ink, true);
  const companyHeight = stock.company ? paragraph(stock.company, MARGIN, 159, width - 480, 23) : 28;
  ctx.textAlign = 'right';
  text(stock.price ? `Rs. ${stock.price}` : stock.rating, width - MARGIN, 99, stock.price ? 44 : 32, stock.price ? ink : color(stock.rating), true);
  if (stock.change) text(stock.change, width - MARGIN, 158, 25, /^[-−]/.test(stock.change) ? red : green);
  if (stock.priceNote) text(stock.priceNote, width - MARGIN, 192, 18, muted);
  ctx.textAlign = 'left';
  let y = Math.max(230, 173 + companyHeight);
  y += paragraph(`${snapshot.scannedAt} · ${snapshot.context}`, MARGIN, y, width - MARGIN * 2, 21);
  y += paragraph(snapshot.note, MARGIN, y + 7, width - MARGIN * 2, 19) + 28;
  const summary = stock.summary;
  if (!summary) return y + 10;
  ctx.strokeStyle = '#e3eaf0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(width - MARGIN, y); ctx.stroke();
  y += 32;
  const ratingWidth = layout === 'portrait' ? 580 : layout === 'columns' ? 620 : 780;
  text('OVERALL RATING', MARGIN, y, 20, muted, true);
  text(stock.rating, MARGIN, y + 42, 50, color(stock.rating), true);
  paragraph(summary.caption, MARGIN, y + 110, ratingWidth - 20, 23);
  [[summary.sells, 'Sell', red], [summary.neutrals, 'Neutral', '#a97100'], [summary.buys, 'Buy', green]].forEach(([count, label, fill], i) => {
    text(String(count), MARGIN + i * 122, y + 184, 36, String(fill), true);
    text(String(label), MARGIN + i * 122, y + 231, 20, muted);
  });
  const gaugeX = layout === 'portrait' ? width - 269 : layout === 'columns' ? width * .445 : width * .365;
  drawGauge(ctx, gaugeX, y + 173, 150, summary.score, summary.methodology);
  const groupsBelow = layout === 'portrait';
  const groupWidth = groupsBelow ? (width - MARGIN * 2 - 24) / 2 : layout === 'columns' ? width * .35 : width * .23;
  const groupStart = groupsBelow ? MARGIN : layout === 'columns' ? width * .615 : width * .51;
  const groupBase = groupsBelow ? y + 286 : y;
  summary.groups.forEach((g, i) => {
    const x = groupStart + (groupsBelow || layout === 'landscape' ? i * (groupWidth + 24) : 0);
    const gy = groupBase + (!groupsBelow && layout === 'columns' ? i * 142 : 0);
    const h = layout === 'landscape' ? 258 : 132;
    rounded(ctx, x, gy, groupWidth, h, '#f7f9fc', '#e0e7ef');
    text(g.label, x + 22, gy + 21, 23, muted);
    ctx.textAlign = 'right'; text(`${g.available}/${g.total}`, x + groupWidth - 22, gy + 22, 19, green); ctx.textAlign = 'left';
    text(g.rating, x + 22, gy + (layout === 'landscape' ? 69 : 55), 29, color(g.rating), true);
    paragraph(`${g.sells} Sell · ${g.neutrals} Neutral · ${g.buys} Buy`, x + 22, gy + (layout === 'landscape' ? 133 : 99), groupWidth - 44, 20);
    if (layout === 'landscape') text('Indicator group', x + 22, gy + 203, 18, muted);
  });
  const summaryHeight = groupsBelow && summary.groups.length ? 448 : 300;
  text(`${summary.available} / ${summary.total} readings available`, MARGIN, y + summaryHeight - 7, 20, green, true);
  return y + summaryHeight + 40;
}

/** Produces complete images from structured results; never captures a clipped viewport. */
export async function renderScanSnapshot(snapshot: ScanSnapshot, onProgress?: (done: number, total: number) => void): Promise<SnapshotFile[]> {
  if (!snapshot.stocks.length) throw new Error('There are no visible scan results to export.');
  const layout = snapshot.layout || 'landscape';
  const width = layout === 'portrait' ? 1200 : layout === 'columns' ? 2400 : 3200;
  const maxHeight = layout === 'portrait' ? 6000 : 4000;
  const gap = 36;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create a snapshot image.');
  const files: SnapshotFile[] = []; let bytes = 0;
  try {
    for (const [stockIndex, stock] of snapshot.stocks.entries()) {
      const headerHeight = paintHeader(ctx, width, stock, snapshot, layout);
      const columns = snapshotColumns(stock, layout);
      const columnWidth = (width - MARGIN * 2 - (columns.length - 1) * gap) / columns.length;
      const rowSize = layout === 'portrait' ? 23 : 25;
      // Explanations span the image width, independent of collapsed UI sections.
      ctx.font = font(23);
      const notes = (stock.notes || []).map(note => ({
        title: note.title,
        paragraphs: note.paragraphs.map(p => wrapSnapshotText(p, width - MARGIN * 2 - 36, s => ctx.measureText(s).width)),
      }));
      const notesHeight = notes.reduce((height, note) => height + 72 + note.paragraphs.reduce((n, lines) => n + lines.length * 32 + 17, 0), 0);
      const makeBlocks = (sections: SnapshotSection[]): Block[] => {
        const blocks: Block[] = [];
        for (const section of sections) {
          ctx.font = font(24, true);
          const title = wrapSnapshotText(section.title, columnWidth - 40, s => ctx.measureText(s).width);
          blocks.push({ kind: 'section', label: title, height: 37 + title.length * 30, keepWithNext: section.rows.length > 0 });
          ctx.font = font(rowSize);
          for (const row of section.rows) {
            const label = wrapSnapshotText(row.label, columnWidth * (row.signal ? .54 : .53) - 20, s => ctx.measureText(s).width);
            const value = wrapSnapshotText(row.value, columnWidth * (row.signal ? .25 : .43) - 20, s => ctx.measureText(s).width);
            blocks.push({ kind: 'row', label, value, signal: row.signal, height: Math.max(label.length, value.length) * (rowSize + 8) + 27 });
          }
        }
        return blocks;
      };
      const columnPages = columns.map(c => paginateSnapshotBlocks(makeBlocks(c), maxHeight - headerHeight - FOOTER - notesHeight));
      const pageCount = Math.max(...columnPages.map(c => c.length));
      for (let p = 0; p < pageCount; p++) {
        const pages = columnPages.map(c => c[p] || []);
        const bodyHeight = Math.max(...pages.map(page => page.reduce((n, b) => n + b.height, 0)));
        canvas.width = width; canvas.height = Math.ceil(headerHeight + bodyHeight + notesHeight + FOOTER);
        ctx.fillStyle = '#f3f7f8'; ctx.fillRect(0, 0, width, canvas.height);
        rounded(ctx, 24, 24, width - 48, canvas.height - 48, '#ffffff');
        paintHeader(ctx, width, stock, snapshot, layout);
        pages.forEach((page, col) => {
          const x = MARGIN + col * (columnWidth + gap); let y = headerHeight;
          for (const block of page) {
            if (block.kind === 'section') {
              rounded(ctx, x, y, columnWidth, block.height - 8, '#edf7f3');
              ctx.font = font(24, true); ctx.fillStyle = green;
              block.label.forEach((line, i) => ctx.fillText(line, x + 16, y + 13 + i * 30));
            } else {
              ctx.font = font(rowSize); ctx.fillStyle = ink;
              block.label.forEach((line, i) => ctx.fillText(line, x + 10, y + 12 + i * (rowSize + 8)));
              ctx.fillStyle = muted; ctx.textAlign = 'right';
              block.value?.forEach((line, i) => ctx.fillText(line, x + columnWidth * (block.signal ? .8 : 1) - 12, y + 12 + i * (rowSize + 8)));
              if (block.signal) { ctx.font = font(20, true); ctx.fillStyle = color(block.signal); ctx.fillText(block.signal, x + columnWidth - 10, y + 16); }
              ctx.textAlign = 'left'; ctx.strokeStyle = '#e5eaf0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + block.height - 1); ctx.lineTo(x + columnWidth, y + block.height - 1); ctx.stroke();
            }
            y += block.height;
          }
        });
        let noteY = headerHeight + bodyHeight + 12;
        for (const note of notes) {
          rounded(ctx, MARGIN, noteY, width - MARGIN * 2, 48, '#edf7f3');
          ctx.font = font(24, true); ctx.fillStyle = green;
          ctx.fillText(note.title, MARGIN + 16, noteY + 12); noteY += 60;
          ctx.font = font(23); ctx.fillStyle = muted;
          for (const lines of note.paragraphs) {
            lines.forEach((line, i) => ctx.fillText(line, MARGIN + 16, noteY + i * 32));
            noteY += lines.length * 32 + 17;
          }
          noteY += 12;
        }
        ctx.font = font(18); ctx.fillStyle = muted;
        wrapSnapshotText(SCAN_DISCLAIMER, width - MARGIN * 2 - 180, s => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, MARGIN, canvas.height - 95 + i * 27));
        ctx.textAlign = 'right'; ctx.fillText(`Stock ${stockIndex + 1}/${snapshot.stocks.length} · Page ${p + 1}/${pageCount}`, width - MARGIN, canvas.height - 39); ctx.textAlign = 'left';
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create the image. Try the portrait layout.')), 'image/png'));
        bytes += blob.size;
        if (bytes > 80 * 1024 * 1024) throw new Error('This scan is too large for one download on this device. Export individual stocks instead.');
        files.push({ name: `${String(stockIndex + 1).padStart(3, '0')}-${safeName(stock.symbol)}-${layout}${pageCount > 1 ? `-page-${p + 1}` : ''}.png`, blob });
        canvas.width = width; canvas.height = 1;
      }
      onProgress?.(stockIndex + 1, snapshot.stocks.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return files;
  } finally { canvas.width = 0; canvas.height = 0; }
}

export function snapshotCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored ZIP: PNGs are already compressed. One download avoids blocked multi-downloads. */
export async function zipSnapshotFiles(files: SnapshotFile[]): Promise<Blob> {
  const parts: BlobPart[] = [], central: BlobPart[] = []; let offset = 0, directorySize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name), data = new Uint8Array(await file.blob.arrayBuffer()), crc = snapshotCrc32(data);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true); local.set(name, 30);
    const entry = new Uint8Array(46 + name.length), d = new DataView(entry.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true); d.setUint16(14, 33, true);
    d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); entry.set(name, 46);
    parts.push(local, file.blob); central.push(entry); directorySize += entry.length; offset += local.length + data.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

export async function downloadScanSnapshot(snapshot: ScanSnapshot, progress?: (done: number, total: number) => void): Promise<number> {
  const files = await renderScanSnapshot(snapshot, progress);
  const blob = files.length === 1 ? files[0].blob : await zipSnapshotFiles(files);
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = files.length === 1 ? `PSX-Scan-${files[0].name}` : `PSX-Scan-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return files.length;
}
