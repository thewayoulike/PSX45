import React from 'react';
import { CirclePlay } from 'lucide-react';

export const VideoGuideLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick}
    aria-label="Video guide — how PSX Tracker works"
    title="Watch how PSX Tracker works"
    className="inline-flex items-center justify-center gap-2 min-h-[44px] shrink-0 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-colors">
    <CirclePlay size={19} aria-hidden="true" />
    <span>Video guide</span>
  </button>
);
