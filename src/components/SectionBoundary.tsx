import React from 'react';
import { isMissingChunk } from '../utils/chunkRecovery';
import { ToolUpdatePrompt } from './ToolUpdatePrompt';

type Props = React.PropsWithChildren<{ label: string; resetKey?: unknown; compact?: boolean }>;

/** Contains a crash to one card or view, so the rest of the app stays usable. */
export class SectionBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`PSX ${this.props.label} failed:`, error.name); }
  componentDidUpdate(prev: Props) {
    // Navigating to another view or portfolio gives the section a fresh start.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const outdated = isMissingChunk(error);
    return <div role="alert" className={`rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 text-slate-800 dark:text-slate-200 ${this.props.compact ? 'p-4' : 'p-6'}`}>
      <p className="font-bold">{this.props.label} couldn’t load</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{outdated ? 'PSX Tracker was updated. Update the app to open it.' : 'The rest of the app still works, and your saved data is unchanged.'}</p>
      {outdated
        ? <ToolUpdatePrompt className="mt-3" />
        : <button type="button" onClick={() => this.setState({ error: null })} className="mt-3 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 px-4 text-sm font-bold">Try again</button>}
    </div>;
  }
}
