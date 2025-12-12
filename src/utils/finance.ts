// Utility to calculate XIRR (Extended Internal Rate of Return)
// Uses the Newton-Raphson method to solve for the rate of return.

interface CashFlow {
    amount: number; // Negative for outflow (Deposit), Positive for inflow (Withdrawal/Value)
    date: Date;
}

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export const calculateXIRR = (cashFlows: CashFlow[], guess = 0.1): number => {
    // 1. Sanitize Data
    const flows = cashFlows
        .filter(cf => cf.amount !== 0 && !isNaN(cf.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (flows.length < 2) return 0;

    const hasPositive = flows.some(f => f.amount > 0);
    const hasNegative = flows.some(f => f.amount < 0);
    if (!hasPositive || !hasNegative) return 0;

    const startDate = flows[0].date;

    let rate = guess;
    const maxIterations = 50;
    const tolerance = 1e-7;

    for (let i = 0; i < maxIterations; i++) {
        let fValue = 0; 
        let fDerivative = 0; 

        for (const flow of flows) {
            const days = (flow.date.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY;
            const years = days / 365;

            if (rate <= -1) rate = -0.99999999;

            const base = 1 + rate;
            const discountFactor = Math.pow(base, -years);

            fValue += flow.amount * discountFactor;
            fDerivative += -years * flow.amount * Math.pow(base, -years - 1);
        }

        if (Math.abs(fValue) < tolerance) {
            return rate * 100; 
        }

        if (Math.abs(fDerivative) < 1e-9) {
            break;
        }

        const nextRate = rate - fValue / fDerivative;
        if (isNaN(nextRate) || !isFinite(nextRate)) break;
        
        rate = nextRate;
    }

    return isFinite(rate) ? rate * 100 : 0;
};

// --- NEW STATISTICS UTILS ---

export const calculateReturns = (prices: number[]): number[] => {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i-1] === 0) returns.push(0);
    else returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
};

export const calculateVariance = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (values.length - 1);
};

export const calculateCovariance = (x: number[], y: number[]): number => {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (x[i] - meanX) * (y[i] - meanY);
  }
  return sum / (n - 1);
};

export const calculateBeta = (assetReturns: number[], marketReturns: number[]): number => {
    const cov = calculateCovariance(assetReturns, marketReturns);
    const varM = calculateVariance(marketReturns);
    return varM === 0 ? 0 : cov / varM;
};
