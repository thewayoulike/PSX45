// api/test-email.js  — TEMPORARY diagnostic. Delete after debugging.
// Visit: https://<your-app>/api/test-email?secret=YOUR_APPROVE_SECRET
// It tries to send a test email to OWNER_EMAIL and returns exactly what Brevo says,
// plus which env values are actually loaded (key is masked).

export default async function handler(req, res) {
  if (req.query.secret !== process.env.APPROVE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — wrong or missing ?secret' });
  }

  const key = (process.env.BREVO_API_KEY || '').trim();
  const sender = (process.env.BREVO_SENDER || process.env.OWNER_EMAIL || '').trim();
  const owner = (process.env.OWNER_EMAIL || '').trim();

  const diag = {
    BREVO_API_KEY_present: !!key,
    BREVO_API_KEY_prefix: key ? key.slice(0, 10) + '…' : null,   // safe: first chars only
    BREVO_API_KEY_length: key.length,
    looks_like_api_key: key.startsWith('xkeysib-'),               // must be TRUE
    BREVO_SENDER: sender || '(not set)',
    OWNER_EMAIL: owner || '(not set)',
  };

  if (!key || !sender || !owner) {
    return res.status(200).json({ ...diag, result: 'Missing env var — see fields above' });
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: sender, name: 'PSX Tracker Test' },
        to: [{ email: owner }],
        subject: 'PSX Tracker — Brevo test',
        htmlContent: '<p>If you received this, Brevo is working. 🎉</p>',
      }),
    });
    const body = await resp.text();
    return res.status(200).json({ ...diag, brevo_status: resp.status, brevo_response: body });
  } catch (e) {
    return res.status(200).json({ ...diag, error: e.message });
  }
}
