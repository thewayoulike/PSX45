import React, { useMemo } from 'react';
// @ts-ignore - react-grid-layout ships without bundled types
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { CardLayout, Device, COLS, ROW_HEIGHT, GRID_MARGIN, visibleOrdered, minFor } from './dashboard';
import { FitScale } from './FitScale';

const RGL: any = WidthProvider(GridLayout as any);

interface Props {
  layout: CardLayout[];
  device: Device;
  renderCard: (id: string) => React.ReactNode;
}

export const DashboardGrid: React.FC<Props> = ({ layout, device, renderCard }) => {
  const cards = useMemo(() => visibleOrdered(layout), [layout]);

  const rglLayout = useMemo(
    () => cards.map(c => {
      const { minW, minH } = minFor(c.id, device);
      return {
        i: c.id, x: c.x, y: c.y, w: c.w, h: c.h,
        minW, minH,
        static: false,
        isDraggable: false,
        isResizable: false,
      };
    }),
    [cards, device]
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
        <div key={c.id} className="h-full overflow-hidden">
          <FitScale>{renderCard(c.id)}</FitScale>
        </div>
      ))}
    </RGL>
  );
};
