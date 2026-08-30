// Shared push-alert plumbing so alerts can be created from the Alerts page or straight off a chart.
import { getAuthHeaders } from './auth';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export type AlertDirection = 'ABOVE' | 'BELOW';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** iOS Safari needs both the promise and callback forms handled. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error("Notifications aren't supported here. On iOS you need 16.4+ and the app added to your Home Screen.");
  }
  let permission = Notification.permission;
  if (permission !== 'granted' && permission !== 'denied') {
    permission = await new Promise((resolve) => {
      try {
        const p = Notification.requestPermission(resolve as any);
        if (p && typeof (p as any).then === 'function') {
          (p as any).then(resolve).catch(() => resolve('denied'));
        }
      } catch {
        resolve('denied');
      }
    });
  }
  return permission;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) throw new Error('Service Workers are not supported by this browser.');
  if (!('PushManager' in window)) throw new Error('Push notifications are not supported on this device.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && VAPID_PUBLIC_KEY) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return subscription;
}

export interface SaveAlertInput {
  ticker: string;
  price: number;
  direction: AlertDirection;
}

/**
 * Persists one price alert to the same store the Alerts page reads.
 * Direction defaults to ABOVE/BELOW based on where the price sits vs the market.
 */
export async function saveChartAlert({ ticker, price, direction }: SaveAlertInput): Promise<string> {
  const clean = ticker.toUpperCase().replace('PSX:', '').trim();
  if (!clean) throw new Error('Missing ticker.');
  if (!(price > 0)) throw new Error('Invalid alert price.');
  if (!VAPID_PUBLIC_KEY) throw new Error('VAPID public key is not configured.');

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') throw new Error('Notification permission was denied.');

  const subscription = await getPushSubscription();
  if (!subscription) throw new Error('Could not create a push subscription.');

  const res = await fetch('/api/save-alert', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      subscription,
      ticker: clean,
      alerts: [{ price: Number(price.toFixed(2)), direction }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to save alert.');
  return data?.message || `Alert set for ${clean} at ${price.toFixed(2)}`;
}

/** Alert fires upward if the target sits above the current price. */
export const directionForPrice = (price: number, currentPrice: number): AlertDirection =>
  price >= currentPrice ? 'ABOVE' : 'BELOW';
