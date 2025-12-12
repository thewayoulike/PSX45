import { useEffect, useRef } from 'react';

export const useIdleTimer = (timeout: number, onIdle: () => void) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivity = useRef<number>(Date.now());
  const throttleRef = useRef<number>(0);

  useEffect(() => {
    const startTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, timeout);
    };

    const handleActivity = () => {
      const now = Date.now();
      // Optimization: Only reset timer if 1 second has passed since last reset
      // This massively reduces CPU usage on mobile scrolling
      if (now - throttleRef.current > 1000) {
        throttleRef.current = now;
        lastActivity.current = now;
        startTimer();
      }
    };

    // Removed 'mousemove' and 'scroll' to prevent lag on phones
    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    startTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [timeout, onIdle]);
};
