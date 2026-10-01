// Alert delivery POSTs to the subscription endpoint, so only browser push services are accepted.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/];

export function isPushServiceEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && !url.username && PUSH_HOSTS.some(re => re.test(url.hostname));
  } catch { return false; }
}
