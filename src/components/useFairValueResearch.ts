import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchFairValueData } from '../services/fairValueData';
import { factFields, finiteNumber, normalizeTicker, readResearch, validTicker, type InputField, type Research } from '../utils/fairValue';

export type ResearchCacheSetter = Dispatch<SetStateAction<Record<string, any>>>;
type Draft = { ticker: string; research: Research; dirty: boolean };

export function useFairValueResearch(cache: Record<string, any>, onSaveCache: ResearchCacheSetter) {
  const [draft, setDraft] = useState<Draft>(() => ({ ticker: '', research: readResearch(), dirty: false }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef(draft);
  const drafts = useRef(new Map<string, Draft>());
  const revisions = useRef<Partial<Record<InputField, number>>>({});
  const request = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  const saveCache = useRef(onSaveCache);
  saveCache.current = onSaveCache;

  useEffect(() => () => {
    request.current.id++;
    request.current.controller?.abort();
  }, []);

  function update(next: Draft) {
    current.current = next;
    setDraft(next);
    if (next.ticker) drafts.current.set(next.ticker, next);
  }

  function changeTicker(value: string) {
    const ticker = normalizeTicker(value);
    if (ticker === current.current.ticker) return;
    request.current.controller?.abort();
    request.current = { id: request.current.id + 1 };
    revisions.current = {};
    setBusy(false);
    setMessage('');
    update(drafts.current.get(ticker) ?? { ticker, research: readResearch(Object.hasOwn(cache, ticker) ? cache[ticker] : undefined), dirty: false });
  }

  function edit(field: InputField, raw: string) {
    const value = finiteNumber(raw) ?? '';
    revisions.current[field] = (revisions.current[field] ?? 0) + 1;
    const old = current.current;
    const sources = { ...old.research.sources };
    if ((factFields as readonly string[]).includes(field)) sources[field] = { name: 'Entered manually', retrievedAt: new Date().toISOString() };
    update({ ...old, dirty: true, research: { ...old.research, inputs: { ...old.research.inputs, [field]: value }, sources,
      ...(field === 'expectedDiv' ? { dividendMode: 'manual' as const, dividendSource: null } : {}) } });
  }

  function useSourceDividend() {
    const old = current.current;
    const dividend = old.research.reportedDividend;
    if (!dividend) return;
    revisions.current.expectedDiv = (revisions.current.expectedDiv ?? 0) + 1;
    update({ ...old, dirty: true, research: { ...old.research, inputs: { ...old.research.inputs, expectedDiv: dividend.value }, dividendMode: 'source', dividendSource: dividend } });
  }

  function persist(next: Draft) {
    const research: Research = { ...next.research, savedAt: new Date().toISOString() };
    // Keep entries saved for other companies while this request was running.
    saveCache.current(previous => ({ ...previous, [next.ticker]: research }));
    update({ ...next, research, dirty: false });
  }

  function save() {
    if (!validTicker(current.current.ticker)) return;
    persist({ ...current.current, research: { ...current.current.research, needsReview: false } });
    setMessage('Research saved. Your assumptions will be kept when you refresh company figures.');
  }

  async function refresh(canFetch: () => boolean = () => true) {
    const ticker = current.current.ticker;
    if (!validTicker(ticker) || request.current.controller) return;
    if (!canFetch()) return;
    const controller = new AbortController();
    const id = request.current.id + 1;
    request.current = { id, controller };
    const startingRevisions = { ...revisions.current };
    setBusy(true);
    setMessage('');
    try {
      const fetched = await fetchFairValueData(ticker, controller.signal);
      if (request.current.id !== id || current.current.ticker !== ticker) return;
      const old = current.current;
      const inputs = { ...old.research.inputs };
      const sources = { ...old.research.sources };
      let keptEdits = false;
      for (const field of factFields) {
        if (fetched.facts[field] === undefined) continue;
        if (revisions.current[field] !== startingRevisions[field]) { keptEdits = true; continue; }
        inputs[field] = fetched.facts[field];
        sources[field] = fetched.sources[field];
      }
      let dividendSource = old.research.dividendSource;
      if (old.research.dividendMode === 'source' && fetched.reportedDividend && revisions.current.expectedDiv === startingRevisions.expectedDiv) {
        inputs.expectedDiv = fetched.reportedDividend.value;
        dividendSource = fetched.reportedDividend;
      }
      persist({ ...old, research: { ...old.research, inputs, sources, dividendSource, reportedDividend: fetched.reportedDividend ?? old.research.reportedDividend } });
      setMessage(['Available company figures refreshed and research saved.', keptEdits ? 'Edits made during loading were kept.' : '', ...fetched.warnings].filter(Boolean).join(' '));
    } catch (error) {
      if (request.current.id === id && !controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not refresh company figures. Please retry.');
    } finally {
      if (request.current.id === id) {
        request.current = { id };
        setBusy(false);
      }
    }
  }

  return { ...draft, busy, message, changeTicker, edit, save, refresh, useSourceDividend };
}
