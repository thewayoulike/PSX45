export class ApiResponseError extends Error {
  constructor(message: string, public status: number, public kind: 'http' | 'unexpected-page' | 'hosting-check' = 'http') {
    super(message); this.name = 'ApiResponseError';
  }
}
/** Never expose JSON-parser errors (or an HTML error page) as account status. */
export async function readApiJson(response: Response, fallback: string): Promise<any> {
  if (response.headers.get('x-vercel-mitigated') === 'challenge') {
    throw new ApiResponseError('Hosting security check interrupted this request. Open www.psx-tracker.com directly in Chrome and complete any security check, then retry. Keep any unsynced local copy before closing the app.', response.status, 'hosting-check');
  }
  if (response.status === 401) throw new ApiResponseError('Your session could not be verified. Please sign in again. Your saved data is unchanged.', 401);
  if (response.status === 429) throw new ApiResponseError('Too many sync requests. Please wait a minute and retry. Your changes are kept on this device.', 429);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); }
  catch { throw new ApiResponseError(`The service returned an unexpected page (HTTP ${response.status}). Please retry. Your saved data is unchanged.`, response.status, 'unexpected-page'); }
  if (!response.ok) {
    // Only show known API messages, never arbitrary upstream HTML or stack traces.
    throw new ApiResponseError(typeof data?.error === 'string' && data.error.length < 240 ? data.error : fallback, response.status);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
  return data;
}
