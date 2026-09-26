import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { useMobileLayout } from '../hooks/useMobileLayout';

const surface = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white';
const control = 'rounded-xl min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300';

// Both layouts receive the original controls and callbacks, including permissions.
export function ResponsivePortfolioHeader({ menu, guide, theme, selector, edit, create }: Record<'menu' | 'guide' | 'theme' | 'selector' | 'edit' | 'create', React.ReactNode>) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  if (!mobile) return <header className="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 sm:gap-4 mb-4 sm:mb-8 animate-in fade-in slide-in-from-top-5 duration-500">
    <div className="flex items-center justify-between w-full sm:w-auto gap-3">{menu}{guide}</div>
    <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 md:flex-none md:w-auto bg-white/80 dark:bg-slate-900/80 p-1 sm:p-2 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm backdrop-blur-md">
      {theme}{selector}<div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">{edit}{create}</div>
    </div>
  </header>;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <header ref={header} className="mobile-context-header" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
    <div className="mobile-context-row">{menu}<div className={`mobile-portfolio-selector ${surface} rounded-xl`}>{selector}</div><button ref={trigger} type="button" className={control} aria-label="Portfolio options" aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={20} /></button></div>
    {open && <div id={id} className={`mobile-context-options ${surface}`}>
      <div className="flex items-center justify-between"><strong className="text-sm">Portfolio & appearance</strong><button type="button" aria-label="Close portfolio options" className="p-2" onClick={close}><X size={18} /></button></div>
      <div className="mobile-context-tools"><div><span>Appearance</span>{theme}</div><div><span>Edit portfolio</span>{edit}</div><div><span>Create portfolio</span>{create}</div><div><span>How it works</span>{guide}</div></div>
    </div>}
  </header>;
}

export function ResponsivePortfolioActions({ primary, secondary }: { primary: React.ReactNode; secondary: React.ReactNode }) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  if (!mobile) return <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">{primary}{secondary}</div>;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="mobile-action-group" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
    <div className="mobile-primary-actions">{primary}<button ref={trigger} type="button" className={`${control} font-bold flex items-center justify-center gap-2`} aria-label="More actions" aria-controls={id} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} />More</button></div>
    <div id={id} hidden={!open} className={`mobile-secondary-actions ${surface}`}><div className="mobile-action-title"><strong>Portfolio actions</strong><button type="button" aria-label="Close more actions" onClick={close}><X size={18} /></button></div>{secondary}</div>
  </div>;
}

export function ResponsivePlanNotice({ label, children }: React.PropsWithChildren<{ label: string }>) {
  const mobile = useMobileLayout();
  if (!children) return null;
  return mobile ? <details className="mobile-plan-notice"><summary className="text-amber-600 dark:text-amber-400">{label}<ChevronDown size={12} /></summary><div className="mobile-plan-full">{children}</div></details> : <>{children}</>;
}

type MetricPanelProps = { title: string; icon: React.ReactNode; colorClass: string };
export function ResponsiveMetricPanels({ children }: React.PropsWithChildren) {
  const mobile = useMobileLayout();
  const [active, setActive] = useState(0);
  const id = useId();
  const panels = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<MetricPanelProps>[];
  if (!mobile) return <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>{children}</div>;
  return <section className={`mobile-metric-switcher ${surface} rounded-3xl shadow-card`} aria-label="Performance, Capital and Income">
    <div className="mobile-metric-tabs" role="tablist" aria-label="Portfolio metrics" onKeyDown={e => {
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? panels.length - 1 : e.key === 'ArrowRight' ? (active + 1) % panels.length : e.key === 'ArrowLeft' ? (active + panels.length - 1) % panels.length : -1;
      if (next < 0) return;
      e.preventDefault(); setActive(next); (e.currentTarget.children[next] as HTMLElement)?.focus();
    }}>
      {panels.map((panel, i) => <button type="button" key={panel.props.title} role="tab" tabIndex={active === i ? 0 : -1} id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={active === i} className={active === i ? `${panel.props.colorClass} bg-slate-50 dark:bg-slate-800` : 'text-slate-500 dark:text-slate-400'} onClick={() => setActive(i)}>{panel.props.icon}<span>{panel.props.title}</span></button>)}
    </div>
    {panels.map((panel, i) => <div key={panel.props.title} id={`${id}-panel-${i}`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-tab-${i}`} hidden={active !== i}>{panel}</div>)}
  </section>;
}

export function MobileSectionNavigator({ view }: { view: string }) {
  const mobile = useMobileLayout();
  const [sections, setSections] = useState<{ label: string; node: HTMLElement }[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile || ['DASHBOARD', 'HOLDINGS', 'CHARTS'].includes(view)) { setSections([]); return; }
    const main = ref.current?.closest('main');
    if (!main) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const seen = new Set<string>();
      const found = Array.from(main.querySelectorAll<HTMLElement>('h2,h3')).filter(node => {
        const label = node.textContent?.trim();
        if (!label || seen.has(label) || node.closest('.sticky,[hidden],[role="dialog"]') || !node.getClientRects().length) return false;
        seen.add(label); return true;
      }).slice(0, 24).map(node => ({ label: node.textContent!.trim(), node }));
      setSections(prev => prev.length === found.length && prev.every((s, i) => s.node === found[i].node && s.label === found[i].label) ? prev : found);
    };
    refresh();
    const observer = new MutationObserver(records => {
      if (records.every(record => ref.current?.contains(record.target))) return;
      clearTimeout(timer); timer = setTimeout(refresh, 250);
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [view, mobile]);
  return <div ref={ref} className="mobile-section-navigator">{mobile && sections.length > 1 && <nav aria-label="Page sections" className="mobile-section-chips">{sections.map(s => <button type="button" className={control} key={s.label} onClick={() => { s.node.style.scrollMarginTop = '135px'; s.node.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>{s.label}</button>)}</nav>}</div>;
}
