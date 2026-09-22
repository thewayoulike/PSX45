import { describe, expect, it, vi } from 'vitest';
import { buildFailureMessage, notifyMufapSyncFailure } from '../scripts/notify-mufap-sync-failure.mjs';

describe('notify-mufap-sync-failure', () => {
  it('builds subject, html, and Actions run URL', () => {
    const msg = buildFailureMessage({
      GITHUB_REPOSITORY: 'aftab/PSX45',
      GITHUB_RUN_ID: '99',
      GITHUB_SERVER_URL: 'https://github.com',
    });
    expect(msg.subject).toBe('PSX Tracker: MUFAP NAV sync failed');
    expect(msg.url).toBe('https://github.com/aftab/PSX45/actions/runs/99');
    expect(msg.html).toContain('https://github.com/aftab/PSX45/actions/runs/99');
    expect(msg.text).toContain('FAILED');
  });

  it('emails MUFAP_SYNC_ALERT_EMAIL via Brevo helper', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const result = await notifyMufapSyncFailure(
      {
        BREVO_API_KEY: 'x',
        MUFAP_SYNC_ALERT_EMAIL: 'owner@example.com',
        GITHUB_REPOSITORY: 'aftab/PSX45',
        GITHUB_RUN_ID: '7',
        GITHUB_SERVER_URL: 'https://github.com',
      },
      send,
    );
    expect(result.to).toBe('owner@example.com');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBe('owner@example.com');
    expect(send.mock.calls[0][1]).toBe('PSX Tracker: MUFAP NAV sync failed');
  });

  it('fails clearly when BREVO_API_KEY is missing', async () => {
    await expect(notifyMufapSyncFailure({ MUFAP_SYNC_ALERT_EMAIL: 'a@b.com' }, vi.fn()))
      .rejects.toMatchObject({ code: 'NO_BREVO_KEY' });
  });
});
