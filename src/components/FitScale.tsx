import React, { useLayoutEffect, useRef } from 'react';

/** Shrink card contents to the grid cell. Never larger than the designed size. */
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
      const bw = box.clientWidth;
      const ih = inner.scrollHeight;
      const iw = inner.scrollWidth;
      if (bh < 8 || ih < 8 || bw < 8 || iw < 8) return;
      const next = Math.min(1, Math.max(min, Math.min(bh / ih, bw / iw)));
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
      <div ref={innerRef} className="w-full">
        {children}
      </div>
    </div>
  );
};
