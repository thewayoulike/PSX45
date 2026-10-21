/** PSX lists Shariah-screened stocks in the KMI indices (KMI-30, KMI All Share) and the Meezan Pakistan index. */
export function isShariahCompliant(tags: string[]): boolean {
  return tags.some(tag => {
    const t = tag.trim().toUpperCase();
    return t.startsWith('KMI') || t === 'MZNPI';
  });
}

export const SHARIAH_TAG_CLASS = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/40';
