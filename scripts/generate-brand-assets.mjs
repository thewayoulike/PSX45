// Rebuild raster icons from the selected, editable SVG; no generated-image crop.
// Use installed sharp, or set BRAND_ASSET_NODE_MODULES to a bundled node_modules.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.env.BRAND_ASSET_NODE_MODULES
  ? join(process.env.BRAND_ASSET_NODE_MODULES, 'sharp') : 'sharp');
const root = new URL('../public/', import.meta.url);
const source = await readFile(new URL('brand/premium-badge.svg', root), 'utf8');
const dark = source.replace('fill="#059669"', 'fill="#FFFFFF"');
await writeFile(new URL('brand/premium-badge-dark.svg', root), dark);
const inner = svg => svg.replace(/^[\s\S]*?<title>[\s\S]*?<\/title>/, '').replace(/<\/svg>\s*$/, '');
const tile = (size, { darkMode = false, maskable = false } = {}) => {
  // Entire mark fits within the central 80% safe circle for maskable icons.
  const extent = maskable ? 288 : 384;
  const offset = (512 - extent) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="${darkMode ? '#059669' : '#FFFCF3'}"/><svg x="${offset}" y="${offset}" width="${extent}" height="${extent}" viewBox="340 100 382 430">${inner(darkMode ? dark : source)}</svg></svg>`;
};
for (const [name, size, options] of [
  ['favicon-32.png', 32, {}], ['pwa-64x64.png', 64, {}],
  ['pwa-premium-192.png', 192, {}], ['pwa-premium-512.png', 512, {}],
  ['pwa-premium-maskable-512.png', 512, { darkMode: true, maskable: true }],
  ['apple-touch-premium.png', 180, { darkMode: true }],
  ['brand/premium-icon-dark.png', 512, { darkMode: true }],
]) await sharp(Buffer.from(tile(size, options))).png().toFile(fileURLToPath(new URL(name, root)));
// PNG-backed ICO containing real 16, 32, and 48 pixel representations.
const pngs = await Promise.all([16, 32, 48].map(size => sharp(Buffer.from(tile(size))).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const start = 6 + i * 16;
  header[start] = header[start + 1] = [16, 32, 48][i];
  header.writeUInt16LE(1, start + 4); header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(png.length, start + 8); header.writeUInt32LE(offset, start + 12);
  offset += png.length;
});
await writeFile(new URL('favicon.ico', root), Buffer.concat([header, ...pngs]));
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><style>.ground{fill:#FFFCF3}.badge{fill:#059669}@media(prefers-color-scheme:dark){.ground{fill:#059669}.badge{fill:#fff}}</style><rect class="ground" width="512" height="512" rx="96"/><svg x="48" y="40" width="416" height="416" viewBox="340 100 382 430">${inner(source).replace('fill="#059669"', 'class="badge"')}</svg></svg>`;
await writeFile(new URL('favicon-premium.svg', root), favicon);
await writeFile(new URL('mask-icon.svg', root), source.replace('fill="#059669"', 'fill="#000000"').replace('fill="#C4A03D"', 'fill="#000000"'));
await sharp(Buffer.from(source.replaceAll(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#FFFFFF"')))
  .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile(fileURLToPath(new URL('notification-badge-premium.png', root)));
console.log('Generated Premium Badge light/dark, favicon, Apple, and PWA icons.');
