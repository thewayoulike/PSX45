import React from 'react';
import { renderHowItWorksBody } from '../../lib/howItWorks.js';

// Static, authored guide content shared with the public page; no auth or Drive lifecycle.
const guideHtml = renderHowItWorksBody();
export const HowItWorksPage: React.FC = () => (
  <article className="app-feature-guide max-w-[1120px] mx-auto">
    <link rel="stylesheet" href="/feature-guide.css" />
    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">How it works</h1>
    <p className="mt-3 text-slate-600 dark:text-slate-300">Watch the walkthrough, then explore the written feature guide at your own pace.</p>
    <div dangerouslySetInnerHTML={{ __html: guideHtml }} />
  </article>
);
