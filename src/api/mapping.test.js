import { describe, it, expect } from 'vitest';
import * as variants from './variants';
import * as invoices from './invoices';
import * as stockLedger from './stockLedger';

describe('variants mapping', () => {
  it('fromRow maps snake_case to camelCase', () => {
    const app = variants.fromRow({
      id: 'v1', company_id: 'c1', product_id: 'p1', pack_size: 12,
      unit: 'KG', purchase_price: 100, selling_price: 150, gst_rate: 18,
      stock_qty: 240, reorder_point: 10, barcode: 'X', average_cost: 100,
      created_at: '2026-01-01',
    });
    expect(app).toMatchObject({
      id: 'v1', productId: 'p1', packSize: 12, gstRate: 18, stockQty: 240,
      sellingPrice: 150, averageCost: 100,
    });
  });
  it('toRow drops undefined keys and maps names', () => {
    expect(variants.toRow({ stockQty: 5, gstRate: 12 }))
      .toEqual({ stock_qty: 5, gst_rate: 12 });
  });
});

describe('invoices mapping', () => {
  it('round-trips core fields', () => {
    const row = { id: 'i1', company_id: 'c1', invoice_number: 'INV-1',
      type: 'Sales', party_id: 'p1', tax_type: 'IGST', total: 500,
      payment_status: 'Pending', date: '2026-01-01', payments: [] };
    const app = invoices.fromRow(row);
    expect(app).toMatchObject({ invoiceNumber: 'INV-1', taxType: 'IGST', partyId: 'p1', paymentStatus: 'Pending' });
  });
});

describe('stockLedger mapping', () => {
  it('fromRow maps snake_case to camelCase', () => {
    const app = stockLedger.fromRow({
      id: 's1', company_id: 'c1', variant_id: 'v1', product_id: 'p1',
      type: 'in', packs: 2, base_qty_delta: 24, balance_qty: 100,
      unit_cost: 50, batch_no: 'B1', reference: 'PO-1', note: 'x',
      date: '2026-01-01',
    });
    expect(app).toMatchObject({
      id: 's1', variantId: 'v1', productId: 'p1', baseQtyDelta: 24,
      balanceQty: 100, unitCost: 50, batchNo: 'B1',
    });
  });
  it('toRow drops undefined keys, maps names, empty string -> null', () => {
    expect(stockLedger.toRow({ variantId: 'v1', baseQtyDelta: -5, note: '' }))
      .toEqual({ variant_id: 'v1', base_qty_delta: -5, note: null });
  });
});
