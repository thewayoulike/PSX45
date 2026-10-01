import { retryableModule } from '../utils/retryableModule';
import { isMissingChunk, TOOL_UPDATE_REQUIRED } from '../utils/chunkRecovery';

export const SCAN_ENGINE_UNAVAILABLE = 'AI Scan could not download its required app files. Your selected document has not been read or sent to AI. Retry with the same file. If it still fails, open PSX Tracker directly in Chrome and complete any security check. Download any unsynced portfolio changes before closing the app.';
export class ScanEngineLoadError extends Error {
  // A file removed by a newer release fails on every retry; it needs the current app version.
  constructor(public outdated = false) { super(outdated ? TOOL_UPDATE_REQUIRED : SCAN_ENGINE_UNAVAILABLE); this.name = 'ScanEngineLoadError'; }
}
const load = retryableModule(() => import('./gemini'));
// Only downloads app code. Reading a document and sending it to AI require Analyze.
export async function loadScanEngine() {
  try { return await load(); }
  catch (error) { throw new ScanEngineLoadError(isMissingChunk(error)); }
}
