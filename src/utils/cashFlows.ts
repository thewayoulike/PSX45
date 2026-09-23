/** Share transfers move stock between portfolios. They change how much capital is invested, and they do not move cash. */
export function principalAndCash(parts: { deposits: number; withdrawals: number; transferIn: number; transferOut: number }) {
  return {
    principalIn: parts.deposits + parts.transferIn,
    principalOut: parts.withdrawals + parts.transferOut,
    cashIn: parts.deposits,
    cashOut: parts.withdrawals,
  };
}
