(() => {
  const video = document.getElementById('tutorial-video');
  if (!(video instanceof HTMLVideoElement)) return;
  const links = [...document.querySelectorAll('a[data-start]')];
  const status = document.getElementById('video-status');
  let pendingSeek = null;
  const seek = (time) => {
    if (video.readyState >= 1) {
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
      pendingSeek = null;
    } else pendingSeek = time;
  };
  video.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) seek(pendingSeek);
  });
  video.addEventListener('timeupdate', () => {
    const active = links.filter((link) => Number(link.dataset.start) <= video.currentTime).pop();
    links.forEach((link) => {
      if (link === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  });
  video.addEventListener('error', () => {
    status.textContent = 'The video could not load. Check your connection and refresh this page to try again.';
  });
  links.forEach((link) => link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const time = Number(link.dataset.start);
    seek(time);
    history.replaceState(null, '', `/how-to-use?t=${time}#watch`);
    status.textContent = '';
    video.play().catch(() => { status.textContent = 'Chapter selected. Press Play to continue.'; });
    video.scrollIntoView({ block: 'center', behavior: 'auto' });
  }));
  const start = new URLSearchParams(location.search).get('t');
  if (start !== null && Number.isFinite(Number(start)) && Number(start) >= 0 && Number(start) < 336.48) {
    seek(Number(start));
    video.preload = 'metadata';
    video.load();
  }
})();
