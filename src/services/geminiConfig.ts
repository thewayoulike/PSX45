// Key configuration stays small so entering the app never downloads the AI SDK.
let key: string | null = null;
let revision = 0;
export function setGeminiApiKey(value: string | null) {
  const next = value ? value.replace(/[^\x00-\x7F]/g, '').trim() || null : null;
  if (next !== key) { key = next; revision++; }
}
export const getGeminiConfig = () => ({ key, revision });
