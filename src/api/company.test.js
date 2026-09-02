import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber, formatNoteNumber } from './company';

describe('formatInvoiceNumber', () => {
  it('zero-pads the sequence to 4 digits', () => {
    expect(formatInvoiceNumber('INV', 2026, 42)).toBe('INV-2026-0042');
  });
  it('keeps sequences over 9999 intact', () => {
    expect(formatInvoiceNumber('INV', 2026, 12345)).toBe('INV-2026-12345');
  });
  it('uses the given prefix', () => {
    expect(formatInvoiceNumber('BILL', 2025, 1)).toBe('BILL-2025-0001');
  });
});

describe('formatNoteNumber', () => {
  it('uses the CN prefix and zero-pads for credit notes', () => {
    expect(formatNoteNumber('CreditNote', 2026, 7)).toBe('CN-2026-0007');
  });
  it('uses the DN prefix and keeps long sequences intact', () => {
    expect(formatNoteNumber('DebitNote', 2026, 12345)).toBe('DN-2026-12345');
  });
});
