// Utility to calculate XIRR (Extended Internal Rate of Return)
// Uses the Newton-Raphson method to solve for the rate of return.

interface CashFlow {
    amount: number; // Negative for outflow (Deposit), Positive for inflow (Withdrawal/Value)
    date: Date;
}

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export const calculateXIRR = (cashFlows: CashFlow[], guess = 0.1): number => {
    // 1. Sanitize Data
    // Filter out zero amounts and ensure dates are valid objects
    const flows = cashFlows
        .filter(cf => cf.amount !== 0 && !isNaN(cf.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (flows.length < 2) return 0;

    // Check if we have at least one positive and one negative value
    const hasPositive = flows.some(f => f.amount > 0);
    const hasNegative = flows.some(f => f.amount < 0);
    if (!hasPositive || !hasNegative) return 0;

    const startDate = flows[0].date;

    // 2. Newton-Raphson Solver
    let rate = guess;
    const maxIterations = 50;
    const tolerance = 1e-7;

    for (let i = 0; i < maxIterations; i++) {
        let fValue = 0; // The Net Present Value (NPV)
        let fDerivative = 0; // The derivative of NPV with respect to rate

        for (const flow of flows) {
            // Calculate time in years relative to start date
            const days = (flow.date.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY;
            const years = days / 365;

            // Avoid division by zero if rate is -1 (100% loss)
            if (rate <= -1) rate = -0.99999999;

            const base = 1 + rate;
            const discountFactor = Math.pow(base, -years);

            fValue += flow.amount * discountFactor;
            
            // Derivative: -years * amount * (1+r)^(-years-1)
            fDerivative += -years * flow.amount * Math.pow(base, -years - 1);
        }

        if (Math.abs(fValue) < tolerance) {
            return rate * 100; // Return as percentage
        }

        if (Math.abs(fDerivative) < 1e-9) {
            // Derivative too close to zero, cannot continue Newton method
            break;
        }

        const nextRate = rate - fValue / fDerivative;
        
        // Safety check for wild jumps
        if (isNaN(nextRate) || !isFinite(nextRate)) break;
        
        rate = nextRate;
    }

    return isFinite(rate) ? rate * 100 : 0;
};
