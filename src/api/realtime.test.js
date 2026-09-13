import { describe, it, expect } from 'vitest';
import { QK, TABLES } from './realtime';

const EXPECTED = [
  'parties', 'products', 'variants', 'invoices', 'invoiceItems', 'transactions',
  'expenses', 'purchases', 'stockLedger', 'batches', 'leads', 'company', 'priceHistory',
  'orders', 'orderItems',
];

describe('realtime QK', () => {
  it('has exactly the canonical query keys', () => {
    expect(Object.keys(QK).sort()).toEqual([...EXPECTED].sort());
  });
  it('every value equals its key', () => {
    for (const [k, v] of Object.entries(QK)) expect(v).toBe(k);
  });
  it('TABLES (the realtime subscription loop) does not include companies', () => {
    // companies has no company_id column — a filtered binding on it would fail the channel join
    expect(Object.keys(TABLES)).not.toContain('companies');
  });
});
