import React, { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore - react-grid-layout ships without bundled types
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { CardLayout, Device, COLS, visibleOrdered } from './dashboard';

const RGL: any = WidthProvider(GridLayout as any);

// Fine row unit + gap. Card heights are measured from real content so there are
// never scrollbars — each grid cell is sized to fit its card exactly.
const ROW = 8;
const GAP = 20;
const hForPx = (px: number) => Math.max(1, Math.ceil((px + GAP) / (ROW + GAP)));

interface Props {
  layout: CardLayout[];
  device: Device;
  renderCard: (id: string) => React.ReactNode;
}

export const DashboardGrid: React.FC<Props> = ({ layout, device, renderCard }) => {
  const cards = useMemo(() => visibleOrdered(layout), [layout]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const ids = cards.map(c => c.id).join(',');

  // Measure each card's natural height and keep the grid cells in sync.
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      setHeights(prev => {
        let changed = false;
        const next = { ...prev };
        for (const e of entries) {
          const id = (e.target as HTMLElement).getAttribute('data-card') || '';
          const h = (e.target as HTMLElement).offsetHeight;
          if (id && h > 0 && Math.abs((prev[id] || 0) - h) > 1) { next[id] = h; changed = true; }
        }
        return changed ? next : prev;
      });
    });
    Object.values(refs.current).forEach(el => el && ro.observe(el));
    return () => ro.disconnect();
  }, [ids, device]);

  const rglLayout = useMemo(
    () => cards.map(c => ({
      i: c.id, x: c.x, y: c.y, w: c.w,
      h: hForPx(heights[c.id] ?? c.h * 110),
      // Non-interactive but NOT static, so react-grid-layout vertically compacts
      // away any empty rows left by hidden/reordered cards (fixes the top gap).
      static: false,
      isDraggable: false,
      isResizable: false,
    })),
    [cards, heights]
  );

  return (
    <RGL
      className="layout"
      layout={rglLayout}
      cols={COLS[device]}
      rowHeight={ROW}
      margin={[GAP, GAP]}
      containerPadding={[0, 0]}
      isDraggable={false}
      isResizable={false}
      compactType="vertical"
    >
      {cards.map(c => (
        <div key={c.id} className="overflow-hidden">
          <div data-card={c.id} ref={el => { refs.current[c.id] = el; }} className="[&>*]:!m-0">
            {renderCard(c.id)}
          </div>
        </div>
      ))}
    </RGL>
  );
};