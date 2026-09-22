/** Do not replace a worker underneath another tab, including older tabs without an update protocol. */
export async function recoveryActivationStatus(scope, sourceId) {
  const tabs = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!sourceId || !tabs.some(tab => tab.id === sourceId)) return 'unavailable';
  return tabs.some(tab => tab.id !== sourceId) ? 'other-tabs' : 'activating';
}
