import { getAuthHeaders } from './auth';

export interface ConnectorLink { id: string; label: string; hint: string; sharePortfolio: boolean; createdAt: string; lastUsedAt: string | null }
export interface ConnectorStatus { plan: string; dailyLimit: number; usedToday: number; driveConnected: boolean; connections: ConnectorLink[] }

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/connector-settings', { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'AI assistant connections are unavailable. Please retry.');
  return data as T;
}

export const loadConnectorStatus = () => post<ConnectorStatus>({ action: 'list' });
export const createConnectorLink = (label: string) => post<{ id: string; link: string }>({ action: 'create', label });
export const setConnectorSharing = (id: string, sharePortfolio: boolean) => post<ConnectorStatus>({ action: 'update', id, sharePortfolio });
export const revokeConnectorLink = (id: string) => post<ConnectorStatus>({ action: 'revoke', id });
