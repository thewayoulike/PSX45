import React, { useState } from 'react';
import { Building2, ExternalLink, Link2, Loader2, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import type { CompanyInfoData } from '../services/financials';
import { equitySnapshotFromSections } from '../utils/companyInfoParse';

interface Props {
  companyInfo: CompanyInfoData | null;
  loading: boolean;
  onRefresh: () => void;
}

/** Profile-only: description, website, governance, equity listing — no financials. */
export const CompanyInfoPanel: React.FC<Props> = ({ companyInfo, loading, onRefresh }) => {
  const [descExpanded, setDescExpanded] = useState(false);
  const equitySnap = equitySnapshotFromSections(companyInfo?.fundamentals || []);
  const hasProfile =
    !!companyInfo?.businessDescription || (companyInfo?.fundamentals?.length ?? 0) > 0 || !!equitySnap.website;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Building2 size={20} />
          </div>
          <h3 className="font-display font-black text-xl text-slate-900 dark:text-white tracking-tight">Company Info</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <Card className="!p-12 flex items-center justify-center gap-3 text-slate-400 font-medium text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading company info…
        </Card>
      )}

      {!loading && !hasProfile && (
        <Card className="!p-12 text-center text-slate-400 font-medium text-sm">
          No company profile available for this symbol right now.
        </Card>
      )}

      {!loading && companyInfo?.businessDescription && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Business Description
            </h4>
          </div>
          <div className="p-5">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {descExpanded || companyInfo.businessDescription.length <= 420
                ? companyInfo.businessDescription
                : `${companyInfo.businessDescription.slice(0, 420).trim()}…`}
            </p>
            {companyInfo.businessDescription.length > 420 && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {descExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        </Card>
      )}

      {!loading && equitySnap.website && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Website</h4>
          </div>
          <div className="p-5">
            <a
              href={equitySnap.website.startsWith('http') ? equitySnap.website : `https://${equitySnap.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline break-all"
            >
              <Link2 size={14} /> {equitySnap.website} <ExternalLink size={12} />
            </a>
          </div>
        </Card>
      )}

      {!loading &&
        (companyInfo?.fundamentals ?? [])
          .map((section) => {
            const items =
              section.category === 'Profile'
                ? section.items.filter((i) => !/website/i.test(i.label))
                : section.items;
            if (!items.length) return null;
            return (
              <Card key={section.category} className="!p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
                  <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    {section.category}
                  </h4>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((item) => (
                    <div
                      key={`${section.category}-${item.label}-${item.value}`}
                      className="grid grid-cols-1 sm:grid-cols-[minmax(140px,34%)_1fr] gap-1 sm:gap-4 px-5 py-3.5"
                    >
                      <dt className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        {item.label}
                      </dt>
                      <dd className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            );
          })}
    </div>
  );
};
