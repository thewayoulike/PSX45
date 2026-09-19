import React from 'react';
import { OfflinePortfolio } from './OfflinePortfolio';
import { recoverMissingChunk } from '../utils/chunkRecovery';
export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; viewSaved: boolean }> {
  state = { failed: false, viewSaved: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { if (!recoverMissingChunk(error)) console.error('PSX view failed:', error.name); }
  render() {
    if (this.state.viewSaved) return <OfflinePortfolio />;
    if (this.state.failed) return <main className="p-6 min-h-screen bg-slate-50 text-slate-900"><h1 className="text-xl font-bold">This screen could not open</h1><p className="my-4">Your saved data has not been cleared. Reload or view the saved transactions on this device.</p><button className="p-3 underline" onClick={() => window.location.reload()}>Reload</button><button className="p-3 underline" onClick={() => this.setState({ viewSaved: true })}>View saved transactions</button></main>;
    return this.props.children;
  }
}
