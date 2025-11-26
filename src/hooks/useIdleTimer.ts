import { useEffect, useRef } from 'react';

export const useIdleTimer = (timeout: number, onIdle: () => void) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivity = useRef<number>(Date.now());

  useEffect(() => {
    const handleActivity = () => {
      lastActivity.current = Date.now();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, timeout);
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    // Attach listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // Start initial timer
    timerRef.current = setTimeout(onIdle, timeout);

    // Cleanup
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [timeout, onIdle]);
};
