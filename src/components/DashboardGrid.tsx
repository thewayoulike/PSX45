import React, { useMemo } from 'react';
// @ts-ignore - react-grid-layout ships without bundled types
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { CardLayout, Device, COLS, ROW_HEIGHT, GRID_MARGIN, visibleOrdered } from './dashboard';

const RGL: any = WidthProvider(GridLayout as any);

interface Props {
  layout: CardLayout[];
  device: Device;
  renderCard: (id: string) => React.ReactNode;
}

// Live dashboard, rendered read-only from the saved 2-D grid layout.
export const DashboardGrid: React.FC<Props> = ({ layout, device, renderCard }) => {
  const cards = useMemo(() => visibleOrdered(layout), [layout]);
  const rglLayout = useMemo(
    () => cards.map(c => ({ i: c.id, x: c.x, y: c.y, w: c.w, h: c.h, static: true })),
    [cards]
  );

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
        <div key={c.id} className="h-full overflow-auto rounded-3xl [&>*]:min-h-full">
          {renderCard(c.id)}
        </div>
      ))}
    </RGL>
  );
};
