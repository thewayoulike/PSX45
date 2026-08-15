// lib/brevo.js — tiny Brevo (Sendinblue) transactional email helper.
// Free tier: 300 emails/day. Verify a sender address in Brevo first.

export async function sendBrevo(to, subject, htmlContent) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');

  const senderEmail = process.env.BREVO_SENDER || process.env.OWNER_EMAIL || 'itruth2011@gmail.com';

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: 'PSX Tracker' },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Brevo ${resp.status}: ${t}`);
  }
  return true;
}

export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
