import { ApiResponseError, readApiJson } from './apiResponse';

function transient(error: unknown) {
  if (error instanceof ApiResponseError && error.kind === 'hosting-check') return false;
  if (error instanceof ApiResponseError) return [408, 500, 502, 503, 504].includes(error.status) || (error.kind === 'unexpected-page' && error.status >= 200 && error.status < 300);
  return error instanceof Error && (error.name === 'TypeError' || error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Retry the read-only version check once. Never replay a commit with an uncertain outcome. */
export async function requestCloudVersion(request: () => Promise<Response>, readOnly: boolean) {
  for (let attempt = 0; ; attempt++) {
    try { return await readApiJson(await request(), 'Cloud version check unavailable. Your changes remain on this device.'); }
    catch (error) {
      if (readOnly && attempt === 0 && transient(error)) {
        await new Promise(resolve => setTimeout(resolve, 600));
        continue;
      }
      if (error instanceof ApiResponseError && error.kind === 'unexpected-page') {
        throw new Error(`Cloud sync received a web page instead of data (HTTP ${error.status}). Your changes are kept on this device. Retry shortly, or download a local copy before closing the app.`);
      }
      throw error;
    }
  }
}
