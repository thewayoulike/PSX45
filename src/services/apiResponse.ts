/** Never expose JSON-parser errors (or an HTML error page) as account status. */
export async function readApiJson(response: Response, fallback: string): Promise<any> {
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); }
  catch { throw new Error('The service returned an unexpected page. Please refresh the app and retry. Your saved data is unchanged.'); }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session could not be verified. Please sign in again. Your saved data is unchanged.');
    if (response.status === 429) throw new Error('Too many sync requests. Please wait a minute and retry. Your changes are kept on this device.');
    // Only show known API messages, never arbitrary upstream HTML or stack traces.
    throw new Error(typeof data?.error === 'string' && data.error.length < 240 ? data.error : fallback);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
  return data;
}
