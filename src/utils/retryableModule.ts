/** Share successful/in-flight imports, but do not retain our own rejected promise. */
export function retryableModule<T>(importer: () => Promise<T>, timeoutMs = 15000) {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      const request = new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tool download timed out')), timeoutMs);
        Promise.resolve().then(importer).then(
          value => { clearTimeout(timer); resolve(value); },
          error => { clearTimeout(timer); reject(error); },
        );
      });
      pending = request;
      void request.catch(() => { if (pending === request) pending = null; });
    }
    return pending;
  };
}
