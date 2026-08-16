import React from 'react';
import { CardLayout, Device, visibleOrdered } from './dashboard';

interface Props {
  layout: CardLayout[];              // the active device's card list (ordered)
  device: Device;
  renderCard: (id: string) => React.ReactNode;
}

// Renders the dashboard from a saved layout. Read-only (editing happens in the
// customizer). Web uses a 12-col grid with per-card spans; mobile stacks.
export const DashboardGrid: React.FC<Props> = ({ layout, device, renderCard }) => {
  const cards = visibleOrdered(layout);

  if (device === 'mobile') {
    return (
      <div className="flex flex-col gap-6">
        {cards.map((c) => (
          <div
            key={c.id}
            style={c.h > 0 ? { height: c.h, overflow: 'auto' } : undefined}
          >
            {renderCard(c.id)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-12 gap-6"
      style={{ gridAutoFlow: 'row dense', alignItems: 'start' }}
    >
      {cards.map((c) => (
        <div
          key={c.id}
          style={{
            gridColumn: `span ${Math.min(12, Math.max(1, c.w))} / span ${Math.min(12, Math.max(1, c.w))}`,
            ...(c.h > 0 ? { height: c.h, overflow: 'auto' } : {}),
          }}
        >
          {renderCard(c.id)}
        </div>
      ))}
    </div>
  );
};
