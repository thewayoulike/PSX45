(() => {
  if (window.psxPerformance) return;
  const entries = [];
  const allowed = new Set(['session_ready', 'access_check', 'cached_portfolio', 'drive_head', 'drive_read', 'drive_commit', 'price_refresh', 'LCP', 'INP', 'CLS']);
  const sampled = Math.random() < 0.1;
  function record(name, value, outcome = 'ok') {
    if (!allowed.has(name) || !Number.isFinite(value)) return;
    const part = location.pathname.split('/')[1];
    const route = ['login', 'holdings', 'dashboard', 'stocks', 'charts', 'settings', 'how-it-works', 'how-to-use'].includes(part) ? part : part ? 'other' : 'home';
    const entry = { name, value: Math.round(value * 1000) / 1000, outcome: outcome === 'ok' ? 'ok' : 'error', route, device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop' };
    entries.push(entry); if (entries.length > 40) entries.shift();
    // Reuse configured analytics; no new backend, user identifiers or portfolio data.
    let disabled = false;
    try { disabled = localStorage.getItem('psx_disable_performance') === '1'; } catch {}
    if (sampled && !disabled && navigator.doNotTrack !== '1' && typeof window.gtag === 'function') {
      window.gtag('event', 'psx_speed', { metric: entry.name, value: entry.value, outcome: entry.outcome, route: entry.route, device_class: entry.device, non_interaction: true });
    }
  }
  window.psxPerformance = { record, entries: () => entries.map(e => ({ ...e })) };
  const start = () => import('/web-vitals-v5.js').then(({ onLCP, onINP, onCLS }) => {
    const report = metric => record(metric.name, metric.value);
    onLCP(report); onINP(report); onCLS(report);
  }).catch(() => {});
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();
