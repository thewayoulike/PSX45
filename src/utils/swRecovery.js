// Public guide and SEO pages: not part of the app, never served from the app shell.
export const PUBLIC_PAGE = /^\/(about|privacy|terms|contact|guides|how-to-use|how-it-works|markets|tools|prototypes)(\/|\.html$|$)/;
const isAppWindow = tab => { try { return !PUBLIC_PAGE.test(new URL(tab.url).pathname); } catch { return true; } };

/** Do not replace a worker underneath another tab, including older tabs without an update protocol. */
export async function recoveryActivationStatus(scope, sourceId) {
  const tabs = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!sourceId || !tabs.some(tab => tab.id === sourceId)) return 'unavailable';
  // Guide pages hold no app state, so they never block an update.
  return tabs.some(tab => tab.id !== sourceId && isAppWindow(tab)) ? 'other-tabs' : 'activating';
}
