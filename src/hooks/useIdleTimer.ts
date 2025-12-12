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
      // This prevents the app from freezing during scrolling/swiping
      if (now - throttleRef.current > 1000) {
        throttleRef.current = now;
        lastActivity.current = now;
        startTimer();
      }
    };

    // Reduced event list for better mobile performance
    // Removed 'mousemove' and 'scroll' which fire too frequently
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
