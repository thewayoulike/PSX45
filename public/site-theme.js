// Match the portfolio's saved theme; CSS handles system preference without JS.
try {
  const theme = localStorage.getItem('psx_theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch { /* Browser storage is optional on public pages. */ }
