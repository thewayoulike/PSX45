import { SITE_URL } from '../config/site.js';

export const videoGuide = {
  title: 'How to use PSX Tracker: video guide',
  description: 'Learn PSX Tracker: create a portfolio, add trades, read holdings, sync Google Drive, and scan documents with Gemini.',
  video: '/media/tutorial/psx-tracker-guide-v1.mp4',
  poster: '/media/tutorial/poster-v2-1280.webp',
  captions: '/media/tutorial/captions-v1.vtt',
  duration: 336.48,
};

export const videoChapters = [
  ['Create a portfolio', 0],
  ['Set up your broker', 23.08],
  ['Choose your default broker', 65.20],
  ['Record a cash deposit', 80.44],
  ['Enter a purchase', 97.44],
  ['Review and save', 114.48],
  ['Read your holdings', 127.20],
  ['Check transaction history', 149.92],
  ['Confirm your save', 163],
  ['Add your Gemini API key', 179.72],
  ['Scan a broker document', 209.72],
  ['Review and add scanned trades', 230.84],
  ['Find a broker email', 250.84],
  ['Analyze the email attachment', 276.20],
  ['Your Drive backup and privacy', 303.36],
];

const timestamp = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function videoGuideHead() {
  const schema = {
    '@context': 'https://schema.org', '@type': 'VideoObject',
    name: videoGuide.title, description: videoGuide.description,
    thumbnailUrl: [`${SITE_URL}${videoGuide.poster}`],
    uploadDate: '2026-09-19T00:00:00-04:00', duration: 'PT5M36S',
    contentUrl: `${SITE_URL}${videoGuide.video}`, inLanguage: 'en',
    hasPart: videoChapters.map(([name, startOffset], index) => ({
      '@type': 'Clip', name, startOffset,
      endOffset: videoChapters[index + 1]?.[1] ?? videoGuide.duration,
      url: `${SITE_URL}/how-to-use?t=${startOffset}#watch`,
    })),
  };
  return `<link rel="preload" as="image" href="${videoGuide.poster}" fetchpriority="high"><link rel="stylesheet" href="/video-guide.css"><script src="/video-guide.js" defer></script><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
}

export function renderVideoGuideBody() {
  const chapters = videoChapters.map(([title, start], index) => `<li><a href="${videoGuide.video}#t=${start}" data-start="${start}"><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span>${title}</span><time>${timestamp(start)}</time></a></li>`).join('');
  return `<div class="guide-meta"><span>5 min 36 sec</span><span>English voice &amp; captions</span><span>Demo account</span></div>
    <div class="watch-layout">
      <section class="watch-panel" id="watch" aria-label="Video walkthrough">
        <video id="tutorial-video" controls playsinline preload="none" poster="${videoGuide.poster}" width="1920" height="1080" aria-label="How to use PSX Tracker" aria-describedby="video-note">
          <source src="${videoGuide.video}" type="video/mp4">
          <track kind="captions" src="${videoGuide.captions}" srclang="en" label="English">
          Your browser does not support this video. <a href="${videoGuide.video}">Open the video file</a>.
        </video>
        <div class="watch-caption"><strong>Create → Set up broker → Record → Review → Sync</strong><p id="video-note">Real app screens with sample trades, email and AI results. Use your own broker figures when entering records.</p></div>
        <p id="video-status" role="status" aria-live="polite"></p>
        <p class="player-tip">Use the player controls for captions, playback speed and full screen. On a phone, turn sideways for a closer view.</p>
      </section>
      <section class="chapter-panel" aria-labelledby="chapters-heading"><h2 id="chapters-heading">Choose a chapter</h2><p>Start at the beginning or skip ahead.</p><ol class="chapters">${chapters}</ol></section>
    </div>
    <section class="quick-start" aria-labelledby="before-heading"><h2 id="before-heading">Before you begin</h2><div class="quick-grid">
      <article><span class="quick-number">01</span><h3>Your account &amp; broker</h3><p>Sign in, create a portfolio, then open <strong>Settings → Broker Setup</strong>. Enter the charges from your broker’s tariff and choose the portfolio’s default broker.</p></article>
      <article><span class="quick-number">02</span><h3>Your Gemini key for AI scan</h3><p>AI document and email-attachment scanning need your own Gemini API key. Open <strong>Settings → API Keys → Get Key</strong>, then save it under Gemini AI Key. Google offers a free tier with usage limits.</p></article>
      <article><span class="quick-number">03</span><h3>Your records &amp; Drive</h3><p>Check every imported trade before saving. When Drive sync completes, your portfolio, settings and saved API keys are backed up to your Google Drive. A local copy also stays on your device.</p></article>
    </div><p class="privacy-note">Drive access follows your Google permissions, including access granted to PSX Tracker. Login, alert and connection records are stored separately. AI scanning sends your selected document to Google for processing. <a href="/privacy">Read the privacy policy</a>.</p></section>
    <div class="guide-next"><div><h2>Ready to try it?</h2><p>Open PSX Tracker and follow along at your own pace.</p></div><div class="actions"><a class="button" href="/holdings">Open PSX Tracker</a><a class="button secondary" href="/how-it-works">Read the feature guide</a></div></div>
    <p class="support-note">Need a hand? <a href="/contact">Contact support</a>.</p>`;
}
