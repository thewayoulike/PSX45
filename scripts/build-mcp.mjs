// Bundles the PSX Tracker connector (src/mcp/server.ts and the app code it reuses) into one
// Node module for the Vercel function. Runs as part of `npm run build`.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'lib/generated/psx-mcp.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Vite-only globals some shared modules read.
  define: { 'import.meta.env': '{"MODE":"production","PROD":true,"DEV":false}' },
  banner: { js: "import { createRequire as __psxRequire } from 'node:module'; const require = __psxRequire(import.meta.url);" },
  logLevel: 'warning',
  legalComments: 'none',
});
console.log('Built lib/generated/psx-mcp.mjs');
