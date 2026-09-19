/* GA4 bootstrap — Measurement ID comes from ?id= on this script URL (CSP-safe). */
(function () {
  var script = document.currentScript;
  var id = script && new URL(script.src, location.href).searchParams.get('id');
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id);
})();
