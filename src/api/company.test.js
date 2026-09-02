import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber } from './company';

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
