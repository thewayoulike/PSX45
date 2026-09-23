/** Fund redemption tax is CGT withheld at source. Stock sale tax is sales tax. */
export function sellTaxAllocation(isFund: boolean, tax: number): { salesTax: number; cgt: number; withheld: number } {
  if (isFund && tax > 0) return { salesTax: 0, cgt: tax, withheld: tax };
  return { salesTax: tax, cgt: 0, withheld: 0 };
}
