import React, { useId } from 'react';
import { MobileFitLine } from './MobileFitLine';
import './login-dashboard-snippet.css';

type Metric = { label: string; value: string; note?: string; tone?: 'positive' | 'negative' };

function Metrics({ items }: { items: Metric[] }) {
  return <dl className="login-snippet-metrics">{items.map(({ label, value, note, tone }) =>
    <div key={label}>
      <dt>{label}</dt>
      <dd className={tone ? `login-snippet-${tone}` : undefined}><MobileFitLine max={17}>{value}</MobileFitLine></dd>
      {note && <small>{note}</small>}
    </div>
  )}</dl>;
}

function Panel({ title, caption, card, children }: React.PropsWithChildren<{ title: string; caption?: string; card?: string }>) {
  return <section className="login-snippet-panel" data-preview-card={card}>
    <div className="login-snippet-panel-heading"><h3>{title}</h3>{caption && <span>{caption}</span>}</div>
    {children}
  </section>;
}

function SampleRow({ label, note, value, detail, tone }: { label: string; note: string; value: string; detail?: string; tone?: 'positive' | 'negative' }) {
  return <div className="login-snippet-row">
    <div><strong>{label}</strong><small>{note}</small></div>
    <div className={tone ? `login-snippet-${tone}` : undefined}><strong>{value}</strong>{detail && <small>{detail}</small>}</div>
  </div>;
}

export default function LoginMobileDashboard() {
  const gradient = `login-sample-${useId().replace(/:/g, '')}`;
  // A static excerpt of the approved mobile design, with illustrative data only.
  // Keep account state, chart controls and dashboard logic out of the login page.
  return <figure className="login-dashboard-snippet" aria-label="Sample mobile dashboard snapshot">
    <figcaption>Dashboard preview <span>Sample figures</span></figcaption>
    <div className="login-snippet-body">
      <div className="login-snippet-chart">
        <div className="login-snippet-chart-heading"><span>Portfolio value</span><small>1 month</small></div>
        <strong className="login-snippet-total"><MobileFitLine max={25}>Rs. 104,000.00</MobileFitLine></strong>
        <p className="login-snippet-change">Day’s change <span>−Rs. 420.00</span></p>
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
          <path d="M0 83 L16 75 L32 81 L48 66 L64 57 L80 63 L96 50 L112 58 L128 43 L144 38 L160 45 L176 29 L192 36 L208 22 L224 16 L240 21 L256 10 L272 5 L288 0 L300 8 L300 100 L0 100 Z" fill={`url(#${gradient})`}/>
          <path d="M0 83 L16 75 L32 81 L48 66 L64 57 L80 63 L96 50 L112 58 L128 43 L144 38 L160 45 L176 29 L192 36 L208 22 L224 16 L240 21 L256 10 L272 5 L288 0 L300 8" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
        </svg>
      </div>
      <div data-preview-card="stats">
      <div className="login-snippet-cards">
        <div><span>Total return</span><strong className="login-snippet-positive"><MobileFitLine max={20}>+4.00%</MobileFitLine></strong><small>+Rs. 4,000.00</small></div>
        <div><span>Today’s P&amp;L</span><strong className="login-snippet-negative"><MobileFitLine max={20}>−Rs. 420.00</MobileFitLine></strong><small>−0.40% of net worth</small></div>
      </div>
      <Panel title="Performance" caption="Your returns">
        <Metrics items={[
          { label: 'MWR (XIRR)', value: 'N/A', note: 'Needs cash-flow dates' },
          { label: 'ROI', value: '+4.00%', note: 'Including dividends', tone: 'positive' },
          { label: 'Realized gain', value: 'Rs. 0.00', note: 'Net of CGT' },
          { label: 'Unrealized gain', value: '+Rs. 4,000.00', note: 'Current holdings', tone: 'positive' },
        ]} />
      </Panel>
      <Panel title="Capital" caption="Your money">
        <Metrics items={[
          { label: 'Net invested', value: 'Rs. 100,000.00' },
          { label: 'Cost basis', value: 'Rs. 80,000.00' },
          { label: 'Stock value', value: 'Rs. 84,000.00' },
          { label: 'Cash balance', value: 'Rs. 20,000.00' },
        ]} />
      </Panel>
      <Panel title="Income" caption="Profit & dividends">
        <Metrics items={[
          { label: 'Dividends (total)', value: 'Rs. 0.00', note: 'Tax & reinvested: Rs. 0' },
          { label: 'Dividend yield', value: '0.00%', note: 'Yield on cost' },
          { label: 'Total P&L', value: '+Rs. 4,000.00', note: 'Net profit', tone: 'positive' },
          { label: 'Total CGT', value: 'Rs. 0.00', note: 'Capital gains tax' },
        ]} />
      </Panel>
      <Panel title="Fees & charges">
        <Metrics items={[
          { label: 'Commission', value: 'Rs. 80.00' },
          { label: 'Taxes (SST)', value: 'Rs. 12.00' },
          { label: 'CDC charges', value: 'Rs. 8.00' },
          { label: 'Other fees', value: 'Rs. 0.00' },
        ]} />
      </Panel>
      <Panel title="Health score" caption="Illustrative score">
        <div className="login-snippet-health"><strong>62 <span>/ 100</span></strong><span>Good</span></div>
        <div className="login-snippet-meter" aria-hidden="true"><span style={{ width: '62%' }} /></div>
        <p className="login-snippet-note">A view of performance, diversification, costs and income.</p>
      </Panel>
      </div>
      <Panel title="Performance vs index" caption="1 month" card="benchmark">
        <Metrics items={[
          { label: 'Your portfolio', value: '+4.00%', tone: 'positive' },
          { label: 'KSE-100', value: '+3.10%' },
          { label: 'KMI-30', value: '+3.40%' },
          { label: 'vs KSE-100', value: '+0.90 pp', tone: 'positive' },
        ]} />
      </Panel>
      <Panel title="Daily stock P&L" caption="30-day chart" card="performance">
        <div className="login-snippet-chart-key"><span>Stocks</span><span>KSE-100</span><span>KMI-30</span></div>
        <svg className="login-snippet-performance-plot" viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 45H300" stroke="var(--snippet-line)" strokeDasharray="4 4" />
          <polyline points="0,48 20,35 40,50 60,28 80,39 100,15 120,30 140,53 160,44 180,24 200,35 220,18 240,36 260,30 280,54 300,64" fill="none" stroke="var(--snippet-up)" strokeWidth="2" />
          <polyline points="0,48 20,42 40,48 60,39 80,46 100,30 120,36 140,48 160,42 180,35 200,46 220,30 240,39 260,45 280,39 300,48" fill="none" stroke="#778bd1" strokeWidth="1.5" />
          <polyline points="0,50 20,45 40,52 60,42 80,49 100,34 120,40 140,51 160,45 180,39 200,48 220,34 240,44 260,48 280,43 300,51" fill="none" stroke="#c38a42" strokeWidth="1.5" />
        </svg>
        <p className="login-snippet-note">Daily stock returns alongside the two indices.</p>
      </Panel>
      <Panel title="Allocation" caption="By sector" card="allocation">
        <div className="login-snippet-allocation">
          <div className="login-snippet-donut" aria-hidden="true"><span>2<small>sectors</small></span></div>
          <ul><li><i />Fertilizer <strong>50%</strong></li><li><i />Oil & gas E&P <strong>50%</strong></li></ul>
        </div>
        <p className="login-snippet-note">Stock holdings · excludes cash</p>
      </Panel>
      <Panel title="Top holdings" caption="2 holdings" card="topHoldings">
        <SampleRow label="FFC" note="100 × Rs. 420.00" value="Rs. 42,000.00" detail="50% of stock value" />
        <SampleRow label="PPL" note="200 × Rs. 210.00" value="Rs. 42,000.00" detail="50% of stock value" />
      </Panel>
      <Panel title="Insights" caption="Portfolio highlights" card="insights">
        <ul className="login-snippet-insights">
          <li><strong>Rs. 4,000 unrealized gain</strong><span>Your open holdings are above their cost basis.</span></li>
          <li><strong>Two sectors, equal weight</strong><span>Each holds 50% of your stock value.</span></li>
          <li><strong>Rs. 20,000 available cash</strong><span>19.23% of your total portfolio value.</span></li>
        </ul>
      </Panel>
      <Panel title="Upcoming dividends" caption="Sample announcement" card="dividends">
        <SampleRow label="FFC · Cash dividend" note="100 shares × Rs. 5.00" value="Rs. 500.00" detail="Before withholding tax" />
        <p className="login-snippet-note">Illustrative payout, not a current announcement.</p>
      </Panel>
      <Panel title="Top movers" caption="KSE-100 · sample" card="topMovers">
        <SampleRow label="OGDC" note="Oil & gas exploration" value="+2.10%" tone="positive" />
        <SampleRow label="MEBL" note="Commercial banks" value="+1.30%" tone="positive" />
        <SampleRow label="LUCK" note="Cement" value="−0.80%" tone="negative" />
      </Panel>
      <Panel title="Board meetings" caption="Sample schedule" card="boardMeetings">
        <SampleRow label="FFC" note="Financial results" value="In 2 days" detail="10:00 AM PKT" />
        <SampleRow label="PPL" note="Financial results" value="In 4 days" detail="11:00 AM PKT" />
        <p className="login-snippet-note">Example dates and times for this preview.</p>
      </Panel>
      <Panel title="Portfolio summary" card="summary">
        <Metrics items={[
          { label: 'Best performer', value: 'FFC', note: '+Rs. 2,000 · +5.00%' },
          { label: 'Lowest return', value: 'PPL', note: '+Rs. 2,000 · +5.00%' },
          { label: 'Top holding', value: 'FFC', note: '50% · tied with PPL' },
          { label: 'Top sector', value: 'Fertilizer', note: '50% · joint largest' },
          { label: 'Diversification', value: '2 holdings', note: 'Concentrated' },
          { label: 'Cash allocation', value: '19.23%', note: 'Rs. 20,000.00' },
        ]} />
      </Panel>
      <p className="login-snippet-disclaimer">Sample dashboard · all figures, charts and events are illustrative.</p>
    </div>
  </figure>;
}
