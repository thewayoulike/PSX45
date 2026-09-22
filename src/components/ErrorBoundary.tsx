import React from 'react';
import { OfflinePortfolio } from './OfflinePortfolio';
import { isMissingChunk, recoverAppVersion, RecoveryStatus } from '../utils/chunkRecovery';

const messages: Record<RecoveryStatus, string> = {
  reloading: 'Opening the current app version…',
  unsaved: 'Automatic reload is paused to protect edits or a pending backup. Your saved records remain available below.',
  'other-tabs': 'Close other PSX Tracker tabs or app windows, then retry the update. This protects edits in those windows.',
  offline: 'You are offline. Reconnect to update, or view the records saved on this device.',
  unavailable: 'The update could not finish. Check your connection, then retry. If it persists, close all PSX Tracker windows and reopen the app.',
  cooldown: 'The screen still could not open after reloading. Retry the update or view your saved records.',
};
export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; viewSaved: boolean; updating: boolean; status: RecoveryStatus | null }> {
  state = { failed: false, viewSaved: false, updating: false, status: null as RecoveryStatus | null };
  mounted = true;
  componentDidMount() { this.mounted = true; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentWillUnmount() { this.mounted = false; }
  componentDidCatch(error: Error) {
    if (isMissingChunk(error)) void this.recover(false);
    else console.error('PSX view failed:', error.name);
  }
  recover = async (manual: boolean) => {
    this.setState({ updating: true });
    const status = await recoverAppVersion(manual);
    if (this.mounted) this.setState({ status, updating: status === 'reloading' });
  };
  render() {
    if (this.state.viewSaved) return <OfflinePortfolio />;
    if (this.state.failed) return <main className="p-6 min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <h1 className="text-xl font-bold">This screen could not open</h1>
      <p className="my-4">Your saved data has not been cleared.</p>
      <p role="status" className="my-4 max-w-xl">{this.state.updating ? 'Checking for the current app version…' : this.state.status ? messages[this.state.status] : 'Retry the update or view the saved transactions on this device.'}</p>
      <button disabled={this.state.updating} className="p-3 underline disabled:opacity-50" onClick={() => void this.recover(true)}>Retry update</button>
      <button className="p-3 underline" onClick={() => this.setState({ viewSaved: true })}>View saved transactions</button>
    </main>;
    return this.props.children;
  }
}
