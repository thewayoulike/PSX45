import React, { useLayoutEffect, useRef } from 'react';

/** Scale a card's contents to fill its grid cell — no inner scrollbars. */
export const FitScale: React.FC<{ children: React.ReactNode; min?: number; max?: number }> = ({
  children,
  min = 0.4,
  max = 1.8,
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
      const next = Math.min(max, Math.max(min, bh / ih));
      inner.style.zoom = String(next);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    return () => ro.disconnect();
  }, [min, max]);

  return (
    <div ref={boxRef} className="h-full w-full overflow-hidden">
      <div ref={innerRef} className="w-full">
        {children}
      </div>
    </div>
  );
};
