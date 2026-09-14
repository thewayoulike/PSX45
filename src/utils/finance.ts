interface CashFlow { amount: number; date: Date }

/** Annualized percentage, or null when no unique converged root is found.
 * Solve in log(1 + rate) space so rates never cross the -100% boundary.
 */
export const calculateXIRR = (cashFlows: CashFlow[], _guess = 0.1): number | null => {
  if (cashFlows.some(f => !Number.isFinite(f.amount) || !Number.isFinite(f.date.getTime()))) return null;
  const flows = cashFlows.filter(f => f.amount !== 0).sort((a, b) => +a.date - +b.date);
  if (flows.length < 2 || !flows.some(f => f.amount > 0) || !flows.some(f => f.amount < 0)) return null;
  const start = +flows[0].date;
  if (+flows[flows.length - 1].date === start) return null;
  const scale = flows.reduce((max, f) => Math.max(max, Math.abs(f.amount)), 0);
  const amounts = flows.map(f => f.amount / scale);
  const years = flows.map(f => (+f.date - start) / (365 * 86400000));
  const value = (x: number) => amounts.reduce((sum, amount, i) => sum + amount * Math.exp(-years[i] * x), 0);
  const roots: number[] = [];
  const addRoot = (x: number) => {
    if (!roots.some(r => Math.abs(r - x) < 1e-7)) roots.push(x);
  };
  let left = -18, fl = value(left);
  for (let right = -17.75; right <= 18; right += 0.25) {
    const fr = value(right);
    if (fl === 0) addRoot(left);
    if (fr === 0) addRoot(right);
    if (Number.isFinite(fl) && Number.isFinite(fr) && Math.sign(fl) !== Math.sign(fr) && fl !== 0 && fr !== 0) {
      let lo = left, hi = right, flo = fl;
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2, fm = value(mid);
        if (Math.abs(fm) < 1e-12) { lo = hi = mid; break; }
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
      }
      const root = (lo + hi) / 2;
      if (Math.abs(value(root)) < 1e-9) addRoot(root);
    }
    left = right; fl = fr;
  }
  return roots.length === 1 ? Math.expm1(roots[0]) * 100 : null;
};
