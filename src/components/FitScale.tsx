import React, { useLayoutEffect, useRef } from 'react';

/**
 * Uniformly scale card contents to fill the grid cell (grow or shrink).
 * Never overflow — scale is min(heightFit, widthFit).
 */
export const FitScale: React.FC<{ children: React.ReactNode; min?: number; max?: number }> = ({
  children,
  min = 0.35,
  max = 2.4,
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
      // Fill the cell top-to-bottom so leftover gaps disappear.
      const next = Math.min(max, Math.max(min, bh / ih));
      inner.style.zoom = String(next);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    const t1 = window.setTimeout(fit, 50);
    const t2 = window.setTimeout(fit, 250);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [min, max]);

  return (
    <div ref={boxRef} className="h-full w-full min-h-0 overflow-hidden">
      <div ref={innerRef} className="w-full">
        {children}
      </div>
    </div>
  );
};
