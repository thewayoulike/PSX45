import { guideIntroduction, featureSections } from '../config/howItWorks.js';
import { videoGuide } from './videoGuide.js';
import { responsiveContents } from './mobileContents.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraph = value => escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function renderHowItWorksBody() {
  return `<div class="feature-guide">
    <section id="guide-video" aria-label="Video walkthrough" class="feature-video">
      <h2>Watch the basics</h2><p>Create a portfolio → set up your broker → record and review your trades.</p>
      <video controls playsinline preload="none" poster="${videoGuide.poster}" width="1920" height="1080" aria-label="How PSX Tracker works">
        <source src="${videoGuide.video}" type="video/mp4"><track kind="captions" src="${videoGuide.captions}" srclang="en" label="English">
        Your browser does not support the video player.
      </video><p class="feature-note">5 min 36 sec · English voice and captions · Demo account. Use the player controls for full screen and playback speed.</p>
    </section>
    ${responsiveContents(`<nav class="feature-contents" aria-label="Feature guide contents"><strong>Jump to a feature</strong>${featureSections.map(s => `<a href="#guide-${s.id}">${escape(s.title)}</a>`).join('')}</nav>`)}
    <div class="feature-intro">${guideIntroduction.map(p => `<p>${paragraph(p)}</p>`).join('')}<p class="feature-note">Screenshots use illustrative demo records. Tap an image to enlarge it. Availability and data can vary by plan and account.</p></div>
    ${featureSections.map(s => `<section class="feature-section" id="guide-${s.id}"><h2>${escape(s.title)}</h2>${s.paragraphs.map(p => `<p>${paragraph(p)}</p>`).join('')}<div class="feature-images">${s.images.map(img => `<figure><a href="/media/features/${img.file}" target="_blank" rel="noopener noreferrer" aria-label="Enlarge: ${escape(img.caption)} (opens in a new tab)"><img src="/media/features/${img.file.replace('.webp', '-preview.webp')}" alt="${escape(img.caption)} — demo account" srcset="/media/features/${img.file.replace('.webp', '-480.webp')} 480w, /media/features/${img.file.replace('.webp', '-800.webp')} 800w, /media/features/${img.file.replace('.webp', '-preview.webp')} 1600w" sizes="(max-width: 700px) calc(100vw - 48px), 520px" width="1600" height="900" loading="lazy" decoding="async"></a><figcaption>${escape(img.caption)}.</figcaption></figure>`).join('')}</div><a class="feature-back" href="#guide-video">Back to video ↑</a></section>`).join('')}
  </div>`;
}
