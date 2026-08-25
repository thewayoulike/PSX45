import React, { useLayoutEffect, useRef } from 'react';

/** Shrink to fit when the card is too small. Never zoom above 1 (native text size). */
export const FitScale: React.FC<{ children: React.ReactNode; min?: number }> = ({
  children,
  min = 0.35,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const fit = () => {
      inner.style.zoom = '1';
      const bh = box.clientHeight;
      const ih = inner.scrollHeight;
      if (bh < 8 || ih < 8) return;
      const next = ih > bh ? Math.max(min, bh / ih) : 1;
      inner.style.zoom = String(next);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    const t = window.setTimeout(fit, 80);
    return () => { ro.disconnect(); window.clearTimeout(t); };
  }, [min]);

  return (
    <div ref={boxRef} className="h-full w-full min-h-0 overflow-hidden">
      <div ref={innerRef} className="dash-card-shell h-full min-h-0">
        {children}
      </div>
    </div>
  );
};
