import React from 'react';
import { InsiderActivity } from './markets/MarketActivity';
import './markets/markets.css';

export default function InsiderTransactionsPage() {
  return <div className="mk-page mk-embedded">
    <header className="mk-heading">
      <div>
        <span className="mk-eyebrow">TOOLS</span>
        <h1>Insider Transactions</h1>
        <p>Explore reported insider purchases and sales across PSX companies.</p>
      </div>
    </header>
    <InsiderActivity />
  </div>;
}
