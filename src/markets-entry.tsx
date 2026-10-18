import React from 'react';
import { createRoot } from 'react-dom/client';
import MarketsPage from './components/MarketsPage';
class MarketBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <section className="mk-panel"><h1>Markets could not open</h1><p>Your portfolio is unaffected. Reload this page to try again.</p><a href="/markets">Reload Markets</a></section> : this.props.children; }
}
createRoot(document.getElementById('markets-root')!).render(<React.StrictMode><MarketBoundary><MarketsPage/></MarketBoundary></React.StrictMode>);
