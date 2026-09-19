import React from 'react';
import { HowItWorksPage } from './HowItWorksPage';
import { useTheme } from '../hooks/useTheme';

// An older service worker may return the app shell for a newly added public URL.
// Show the guide without mounting authentication or clearing any account state.
export default function PublicGuideFallback() {
  useTheme();
  return <main className="max-w-[1160px] mx-auto p-5 sm:p-8">
    <a href="/holdings" className="inline-block min-h-[44px] py-3 mb-5 text-emerald-700 dark:text-emerald-400 underline">Open PSX Tracker</a>
    <HowItWorksPage />
  </main>;
}
