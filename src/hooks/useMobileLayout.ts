import { useSyncExternalStore } from 'react';

// The same breakpoint as the holdings cards and mobile layout stylesheet.
const query = '(max-width: 767px)';
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
