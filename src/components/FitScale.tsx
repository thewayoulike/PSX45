import React, { useLayoutEffect, useRef } from 'react';

/** Shrink to fit when the card is too small. Never zoom above 1 (native text size). */
export const FitScale: React.FC<{ children: React.ReactNode; min?: number }> = ({
  children,
  min,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // On phones, avoid microscopic zoom — prefer scroll/reflow over unreadable text
  const floor = min ?? (typeof window !== 'undefined' && window.innerWidth < 1024 ? 0.72 : 0.35);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const fit = () => {
      inner.style.zoom = '1';
      const bh = box.clientHeight;
      const ih = inner.scrollHeight;
      if (bh < 8 || ih < 8) return;
      const next = ih > bh ? Math.max(floor, bh / ih) : 1;
      inner.style.zoom = String(next);
      // If still overflowing after min zoom, allow scroll instead of crushing further
      box.style.overflowY = next <= floor && ih > bh ? 'auto' : 'hidden';
    };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    const t = window.setTimeout(fit, 80);
    return () => { ro.disconnect(); window.clearTimeout(t); };
  }, [floor]);

  return (
    <div ref={boxRef} className="h-full w-full min-h-0 overflow-hidden">
      <div ref={innerRef} className="dash-card-shell h-full min-h-0">
        {children}
      </div>
    </div>
  );
};
