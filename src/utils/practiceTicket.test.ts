import { describe, expect, it } from 'vitest';
import { practiceTicketLocked } from './practiceTicket';

describe('practice ticket', () => {
  it('stays editable while a review is open, while an order is sending, and with nothing pending', () => {
    expect(practiceTicketLocked({ busy: true, reviewing: true })).toBe(false);
    expect(practiceTicketLocked({ busy: true, reviewing: false })).toBe(false);
    expect(practiceTicketLocked({ busy: false, reviewing: true })).toBe(false);
    expect(practiceTicketLocked({ busy: false, reviewing: false })).toBe(false);
  });
});
