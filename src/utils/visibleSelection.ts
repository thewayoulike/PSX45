export function visibleSelection(selected: string[], visible: string[]): string[] {
  const allow = new Set(visible);
  return selected.filter(id => allow.has(id));
}
