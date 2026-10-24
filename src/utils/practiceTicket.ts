/** The practice order ticket stays editable. A review never locks the form. */
export function practiceTicketLocked(_state: { busy: boolean; reviewing: boolean }): boolean {
  return false;
}
