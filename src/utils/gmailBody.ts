export interface GmailTextPart {
  mimeType: 'text/plain' | 'text/html';
  data?: string;
  attachmentId?: string;
}

export function gmailTextParts(payload: any): GmailTextPart[] {
  if (!payload || payload.filename) return [];
  if (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html') {
    return payload.body?.data || payload.body?.attachmentId
      ? [{ mimeType: payload.mimeType, data: payload.body.data, attachmentId: payload.body.attachmentId }] : [];
  }
  return Array.isArray(payload.parts) ? payload.parts.flatMap(gmailTextParts) : [];
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** Convert HTML mail into inert text. Never render mail HTML or load its images/links. */
export function emailHtmlToText(html: string): string {
  const text = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\b[^>]*>|<\/(?:p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '\t').replace(/<[^>]*>/g, '');
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—' };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (entity.startsWith('#')) {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
    }
    return entities[entity.toLowerCase()] ?? original;
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function gmailBodyText(parts: GmailTextPart[]): string {
  const plain = parts.filter(part => part.mimeType === 'text/plain' && part.data).map(part => decodeBase64Url(part.data!)).join('\n').trim();
  if (plain) return plain;
  return parts.filter(part => part.mimeType === 'text/html' && part.data).map(part => emailHtmlToText(decodeBase64Url(part.data!))).join('\n').trim();
}

export const emailBodyImportKey = (messageId: string) => JSON.stringify([messageId, 'email-body']);
export const MAX_SCAN_TEXT_LENGTH = 100000;
export function validateScanText(text: string): string {
  if (!text.trim()) throw new Error('This email has no readable text. Choose an attachment or paste the trade details.');
  if (text.length > MAX_SCAN_TEXT_LENGTH) throw new Error('This email is too long to scan. Keep only the trade confirmation text and try again.');
  return text.trim();
}
