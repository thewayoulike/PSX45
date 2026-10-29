import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore - react-grid-layout ships without bundled types
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { CardLayout, Device, COLS, ROW_HEIGHT, GRID_MARGIN, visibleOrdered, minFor } from './dashboard';
import { FitScale } from './FitScale';
import './dashboard-grid.css';
import { SectionBoundary } from './SectionBoundary';

const RGL: any = WidthProvider(GridLayout as any);

interface Props {
  layout: CardLayout[];
  device: Device;
  renderCard: (id: string) => React.ReactNode;
  compactStats?: boolean;
}

export const DashboardGrid: React.FC<Props> = ({ layout, device, renderCard, compactStats = false }) => {
  const cards = useMemo(() => visibleOrdered(layout), [layout]);
  const stats = cards.find(c => c.id === 'stats');
  // Compact the full-width stats row without rewriting saved custom layouts.
  // Side-by-side custom arrangements retain their explicit dimensions.
  const fitStats = compactStats && device === 'web' && stats?.x === 0 && stats.w === COLS.web
    && cards.every(c => c.id === 'stats' || c.y >= stats.y + stats.h);
  const naturalStats = useRef<HTMLDivElement>(null);
  const [statsRows, setStatsRows] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = naturalStats.current;
    if (!fitStats || !node) { setStatsRows(null); return; }
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0) setStatsRows(Math.max(minFor('stats', device).minH, Math.ceil((height + GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1]))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, [fitStats, device]);

  const rglLayout = useMemo(
    () => cards.map(c => {
      const { minW, minH } = minFor(c.id, device);
      const heightDelta = fitStats && statsRows !== null && stats ? statsRows - stats.h : 0;
      return {
        i: c.id, x: c.x, y: c.id === 'stats' ? c.y : c.y + heightDelta,
        w: c.w, h: c.id === 'stats' ? c.h + heightDelta : c.h,
        minW, minH,
        static: false,
        isDraggable: false,
        isResizable: false,
      };
    }),
    [cards, device, fitStats, statsRows, stats]
  );

  // Mobile is a reading flow, not a scaled desktop canvas. Preserve visibility
  // and order, but let content determine height so text never shrinks or clips.
  if (device === 'mobile') {
    const mobileCards = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
    return <div className="mobile-dashboard grid grid-cols-1 gap-4 min-w-0">
      {mobileCards.map(c => <section key={c.id} className="min-w-0" data-dashboard-card={c.id}>
        <SectionBoundary label="This card" compact>{renderCard(c.id)}</SectionBoundary>
      </section>)}
    </div>;
  }

  return (
    <RGL
      className="layout"
      layout={rglLayout}
      cols={COLS[device]}
      rowHeight={ROW_HEIGHT}
      margin={GRID_MARGIN}
      containerPadding={[0, 0]}
      isDraggable={false}
      isResizable={false}
      compactType="vertical"
    >
      {cards.map(c => (
        <div key={c.id} className="dash-cell h-full min-h-0 overflow-hidden" data-dashboard-card={c.id}>
          <SectionBoundary label="This card" compact>{c.id === 'stats' && fitStats
            ? <div ref={naturalStats} style={{ display: 'flow-root' }}>{renderCard(c.id)}</div>
            : <FitScale>{renderCard(c.id)}</FitScale>}</SectionBoundary>
        </div>
      ))}
    </RGL>
  );
};
