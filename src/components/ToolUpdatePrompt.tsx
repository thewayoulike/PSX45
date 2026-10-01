import React, { useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { recoverAppVersion, recoveryMessages, type RecoveryStatus } from '../utils/chunkRecovery';
export { TOOL_UPDATE_REQUIRED } from '../utils/chunkRecovery';

/** A removed release file cannot be retried: only opening the current version helps. */
export function ToolUpdatePrompt({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const update = async () => {
    setBusy(true);
    // The person chose to leave this panel. Unsaved edits and pending backups still block the reload.
    const result = await recoverAppVersion(true, true);
    setStatus(result); setBusy(result === 'reloading');
  };
  return <div className={className}>
    {status && status !== 'reloading' && <p role="status" className="mb-3 text-sm leading-relaxed">{recoveryMessages[status]}</p>}
    <button type="button" disabled={busy} onClick={() => void update()} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2">
      <RefreshCcw size={16} className={busy ? 'animate-spin' : ''} />{busy ? 'Opening current version…' : 'Update app'}
    </button>
  </div>;
}
