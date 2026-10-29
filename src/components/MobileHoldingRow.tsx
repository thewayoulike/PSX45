import {useMobileLayout} from '../hooks/useMobileLayout';
import {fetchStockHistory} from '../services/psxData';
import {fundAvgForCost,fmtFundNav,fmtFundUnits} from '../utils/fundFormat';
import {MobileFitLine} from './MobileFitLine';
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChartNoAxesCombined, Building2 } from 'lucide-react';
import type { Holding } from '../types';
import { isShariahCompliant } from '../utils/shariah';

const money = (n: number) => n.toLocaleString('en-PK', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
type Props = {
  holding: Holding; isFund: boolean; showBroker: boolean; displayName: string; listedIn: string; failed: boolean;
  day: {change: number; pct: number}; onTickerClick?: (ticker: string) => void;
  onChartClick?: (ticker: string) => void;
  onCorporateAction?: (holding: Holding) => void;
};

export function MobileHoldingRow({holding: h, isFund, showBroker, displayName, listedIn, failed, day, onTickerClick, onChartClick, onCorporateAction}: Props) {
  const id = useId().replace(/:/g, '');
  const roundedAvg = isFund ? fundAvgForCost(h.avgPrice) : Math.round(h.avgPrice * 100) / 100;
  const cost = h.quantity * roundedAvg;
  const value = h.quantity * h.currentPrice;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
  const buyFees = (h.totalCommission || 0) + (h.totalTax || 0) + (h.totalCDC || 0) + (h.totalOtherFees || 0);
  const breakEven = h.avgPrice + (h.quantity > 0 ? buyFees / h.quantity : 0);
  const mobile=useMobileLayout(), ref=useRef<HTMLElement>(null);
  const [points,setPoints]=useState<number[]>([]);
  useEffect(()=>{
    setPoints([]);if(!mobile||isFund||!ref.current)return;
    let active=true;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();
      fetchStockHistory(h.ticker,'1M').then(rows=>{if(active)setPoints(rows.filter(r=>Number.isFinite(r.price)&&r.price>0).map(r=>r.price));}).catch(()=>{});
    },{rootMargin:'100px'});observer.observe(ref.current);
    return()=>{active=false;observer.disconnect();};
  },[h.ticker,isFund,mobile]);
  const hasChart=points.length>1;
  const min=Math.min(...points),max=Math.max(...points),spread=max-min||1;
  const chartPositive=hasChart&&points[points.length-1]>=points[0];
  const positive = day.change >= 0;
  const line = hasChart ? points.map((n,i) => `${i * 88 / (points.length - 1)},${40 - (n-min)/spread*36}`).join(' ') : '';
  const tags = listedIn.split(',').map(t=>t.trim()).filter(Boolean);
  const cells = [
    [isFund ? 'Units' : 'Quantity', isFund ? fmtFundUnits(h.quantity) : h.quantity.toLocaleString('en-PK')],
    [isFund ? 'Current NAV' : 'Current price', `Rs. ${isFund ? fmtFundNav(h.currentPrice) : money(h.currentPrice)}`],
    [isFund ? 'Average NAV' : 'Average buy price', `Rs. ${isFund ? fmtFundNav(roundedAvg) : money(roundedAvg)}`],
    ['Total cost', `Rs. ${money(cost)}`],
    ['Market value', `Rs. ${money(value)}`],
    ['Today’s P&L', `Rs. ${signed(day.change)} (${day.pct.toFixed(2)}%)`, positive ? 'up' : 'down'],
    ['Total P&L', `Rs. ${signed(pnl)} (${pnlPct.toFixed(2)}%)`, pnl >= 0 ? 'up' : 'down'],
    ['Est. break-even price', `Rs. ${isFund ? fmtFundNav(breakEven) : money(breakEven)}`, Math.abs(h.currentPrice-breakEven)<=.001 ? 'break-even-flat' : h.currentPrice>breakEven ? 'break-even-up' : 'break-even-down'],
    ['Buy commission', `Rs. ${money(h.totalCommission || 0)}`],
    ['Buy tax', `Rs. ${money(h.totalTax || 0)}`],
    ['CDC charges', `Rs. ${money(h.totalCDC || 0)}`],
    ['Other charges', `Rs. ${money(h.totalOtherFees || 0)}`],
  ];
  return <article ref={ref} className="clean-holding" aria-label={`${displayName} holding`}>
    <div className="clean-holding-row" data-has-chart={hasChart}>
      <div className="clean-stock-identity">
        <span className={`clean-stock-mark mark-${h.ticker.toLowerCase()}`} aria-hidden="true">{h.ticker.slice(0,2)}</span>
        <div><strong>{displayName}</strong><span>{isFund ? fmtFundUnits(h.quantity) : h.quantity.toLocaleString()} × {isFund ? fmtFundNav(h.currentPrice) : money(h.currentPrice)}</span></div>
      </div>
      {hasChart && <div className={`clean-mini-chart ${chartPositive ? 'up' : 'down'}`}>
        <svg viewBox="0 0 88 44" role="img" aria-label={`${h.ticker} recent daily closing prices`}>
          <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
          <path d={`M0,44 L${line!.replace(/ /g,' L')} L88,44 Z`} fill={`url(#fill-${id})`}/>
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>1M · daily</span>
      </div>}
      <div className="clean-holding-value"><strong><MobileFitLine max={14}>{money(value)}</MobileFitLine></strong><span className={positive ? 'up' : 'down'}>{signed(day.change)}<small>today</small></span></div>
    </div>
    {failed && <p className="clean-quote-warning">Latest quote unavailable · showing the last known price</p>}
    <details className="clean-holding-details">
      <summary aria-label={`See details for ${displayName}`}><span className="when-closed">See details</span><span className="when-open">Hide details</span><ChevronDown size={14}/></summary>
      <div className="clean-details-content">
        <div className="clean-holding-context"><span>{h.sector || 'PSX stock'}</span>{showBroker && h.broker && <span>{h.broker}</span>}</div>
        {tags.length > 0 && <div className="clean-stock-tags">{isShariahCompliant(tags) && <span>Shariah</span>}{tags.map(t=><span key={t}>{t}</span>)}</div>}
        <dl>{cells.map(([label,amount,color])=><div key={label}><dt>{label}</dt><dd className={color}>{amount}</dd></div>)}</dl>
        <p className="clean-detail-note">Break-even uses the average buy price plus estimated selling fees, using your recorded buy fees as the estimate.</p>
        <div className="clean-detail-actions">
          {onTickerClick && <button type="button" onClick={()=>onTickerClick(h.ticker)}><Building2 size={16}/>{isFund ? 'Open fund profile' : 'Open stock profile'}</button>}
          {!isFund && onChartClick && <button type="button" onClick={()=>onChartClick(h.ticker)}><ChartNoAxesCombined size={16}/>Open stock chart</button>}
          {!isFund && onCorporateAction && <button type="button" onClick={()=>onCorporateAction(h)}>Bonus, split, rights</button>}
        </div>
      </div>
    </details>
  </article>;
}
