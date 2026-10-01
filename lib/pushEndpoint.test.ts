import { expect, it } from 'vitest';
import { isPushServiceEndpoint } from './pushEndpoint.js';

it('accepts the browser push services and nothing else', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://web.push.apple.com/QH-abc', 'https://wns2-par02p.notify.windows.com/w/?token=x'])
    expect(isPushServiceEndpoint(ok), ok).toBe(true);
  for (const bad of ['https://attacker.example/hook', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.test/x',
    'https://fcm.googleapis.com:8443/x', 'https://user@fcm.googleapis.com/x', 'https://169.254.169.254/latest', '', null])
    expect(isPushServiceEndpoint(bad as any), String(bad)).toBe(false);
});
