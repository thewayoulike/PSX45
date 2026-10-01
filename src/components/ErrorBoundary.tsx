import React from 'react';
import { OfflinePortfolio } from './OfflinePortfolio';
import { isMissingChunk, recoverAppVersion, recoveryMessages, RecoveryStatus } from '../utils/chunkRecovery';

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
      <p role="status" className="my-4 max-w-xl">{this.state.updating ? 'Checking for the current app version…' : this.state.status ? recoveryMessages[this.state.status] : 'Retry the update or view the saved transactions on this device.'}</p>
      <button disabled={this.state.updating} className="p-3 underline disabled:opacity-50" onClick={() => void this.recover(true)}>Retry update</button>
      <button className="p-3 underline" onClick={() => this.setState({ viewSaved: true })}>View saved transactions</button>
    </main>;
    return this.props.children;
  }
}
