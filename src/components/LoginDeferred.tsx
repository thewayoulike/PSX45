import React, { Suspense, useEffect, useRef, useState } from 'react';

/** Keep below-the-fold downloads out of startup, and start them before scrolling into view. */
export function LoginDeferred({ children, requested = false, className, fallback }: {
  children: React.ReactNode;
  requested?: boolean;
  className?: string;
  fallback: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(requested);
  useEffect(() => {
    if (visible || requested) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible, requested]);
  return <div ref={ref} className={className}>
    {visible || requested ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
  </div>;
}
