import React, { useId } from 'react';
import { investedComparisonSegments } from '../utils/investedComparison';

type PlottedItem = { item: { props: { dataKey?: string } }; props: { points?: { x: number; y: number }[] } };

/** Recharts Customized passes its scaled graphical points into this SVG layer.
 * Keep the real series for axes, keyboard navigation and dated tooltips; colour
 * the displayed curve, a soft fill beneath it, and the gap to invested capital.
 */
export function PortfolioInvestedComparison({ formattedGraphicalItems = [], offset }: {
  formattedGraphicalItems?: PlottedItem[];
  offset?: { top: number; height: number };
}) {
  const gradientId = useId().replace(/:/g, '');
  const values = formattedGraphicalItems.find(item => item.item.props.dataKey === 'value')?.props.points || [];
  const invested = formattedGraphicalItems.find(item => item.item.props.dataKey === 'netInvested')?.props.points || [];
  const segments = investedComparisonSegments(values.map((p, i) => ({ ...p, investedY: invested[i]?.y ?? NaN })));
  const top = offset?.top ?? 0;
  const bottom = top + (offset?.height ?? 0);
  return <g className="portfolio-invested-comparison" pointerEvents="none" aria-hidden="true">
    {(['above', 'below', 'equal'] as const).map(side => {
      const matching = segments.filter(segment => segment.side === side);
      const color = side === 'above' ? 'var(--clean-up)' : side === 'below' ? 'var(--clean-down)' : 'var(--clean-muted)';
      const line = matching.map(({ from, to }) => `M${from.x},${from.y}L${to.x},${to.y}`).join('');
      const area = matching.map(({ from, to, baseline }) => `M${from.x},${from.y}L${to.x},${to.y}L${to.x},${baseline}L${from.x},${baseline}Z`).join('');
      const underCurve = matching.map(({ from, to }) => `M${from.x},${from.y}L${to.x},${to.y}L${to.x},${bottom}L${from.x},${bottom}Z`).join('');
      const fillId = `${gradientId}-${side}`;
      return <g key={side} data-comparison={side}>
        {side !== 'equal' && <>
          <defs><linearGradient id={fillId} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={bottom}>
            <stop offset="0%" stopColor={color} stopOpacity={.24}/>
            <stop offset="65%" stopColor={color} stopOpacity={.10}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient></defs>
          {bottom > top && <path className="portfolio-under-curve" d={underCurve} fill={`url(#${fillId})`} stroke="none"/>}
          <path d={area} fill={color} fillOpacity={.13} stroke="none"/>
        </>}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      </g>;
    })}
  </g>;
}
