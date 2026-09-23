/** Close-to-close % on shares already held at the previous close. Same kind of day change as KSE-100 and KMI-30. */
export function holdingsDailyReturn(
  heldAtPriorClose: Record<string, number>,
  prevClose: Record<string, number>,
  close: Record<string, number>,
): number | null {
  let yesterday = 0;
  let today = 0;
  for (const [ticker, qty] of Object.entries(heldAtPriorClose)) {
    const prev = prevClose[ticker];
    const now = close[ticker];
    if (!(qty > 0) || !(prev > 0) || !(now > 0)) continue;
    yesterday += prev * qty;
    today += now * qty;
  }
  if (!(yesterday > 0)) return null;
  return ((today - yesterday) / yesterday) * 100;
}
