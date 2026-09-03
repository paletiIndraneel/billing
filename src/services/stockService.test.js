import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake for the src/api/* layer. Fields are camelCase (what fromRow produces).
const store = { variants: new Map(), products: new Map(), ledger: [] };

vi.mock('../api/variants.js', () => ({
  getVariant: async (id) => store.variants.get(id) ?? null,
  updateVariant: async (id, patch) => { store.variants.set(id, { ...store.variants.get(id), ...patch }); },
  listVariantsByProduct: async (pid) => [...store.variants.values()].filter((v) => v.productId === pid),
}));
vi.mock('../api/products.js', () => ({
  getProduct: async (id) => store.products.get(id) ?? null,
  updateProduct: async (id, patch) => { store.products.set(id, { ...store.products.get(id), ...patch }); },
}));
vi.mock('../api/stockLedger.js', () => ({
  createStockLedgerEntry: async (e) => { store.ledger.push(e); },
}));

const { adjustStock, packageStock } = await import('./stockService.js');

beforeEach(() => { store.variants.clear(); store.products.clear(); store.ledger.length = 0; });

const putVariant = (v) => store.variants.set(v.id, v);
const putProduct = (p) => store.products.set(p.id, p);

describe('adjustStock — packed mode', () => {
  it('stock-in raises stockQty, appends ledger, sets WAC', async () => {
    putProduct({ id: 'p1', inventoryMode: 'packed' });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 0, averageCost: 0 });

    const res = await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: 10, type: 'purchase', unitCost: 5 });

    expect(store.variants.get('v1').stockQty).toBe(10);
    expect(store.variants.get('v1').averageCost).toBe(5);
    expect(store.ledger).toHaveLength(1);
    expect(store.ledger[0].balanceQty).toBe(10);
    expect(res).toMatchObject({ newBalance: 10, isBulk: false, isHybridSale: false, packSz: 1, averageCost: 5 });
  });

  it('blends weighted-average cost on a second stock-in', async () => {
    putProduct({ id: 'p1', inventoryMode: 'packed' });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 10, averageCost: 5 });

    await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: 10, type: 'purchase', unitCost: 9 });

    // (10*5 + 10*9) / 20 = 7
    expect(store.variants.get('v1').averageCost).toBe(7);
    expect(store.variants.get('v1').stockQty).toBe(20);
  });

  it('throws when a deduction would drive the balance below zero', async () => {
    putProduct({ id: 'p1', inventoryMode: 'packed' });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 2 });

    await expect(
      adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: -5, type: 'sale' })
    ).rejects.toThrow(/Insufficient stock/);
  });
});

describe('adjustStock — bulk mode', () => {
  it('stock-in raises masterStock and propagates WAC to sibling variants', async () => {
    putProduct({ id: 'p1', inventoryMode: 'bulk', masterStock: 0 });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1 });
    putVariant({ id: 'v2', productId: 'p1', packSize: 2 });

    await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: 100, type: 'purchase', unitCost: 50 });

    expect(store.products.get('p1').masterStock).toBe(100);
    // costPerBase = 50 / packSize(1) = 50 ; sibling v2 averageCost = 50 * packSize(2) = 100
    expect(store.variants.get('v2').averageCost).toBe(100);
    expect(store.variants.get('v1').averageCost).toBe(50);
  });

  it('hybrid sale deducts from variant.stockQty, leaving masterStock untouched', async () => {
    putProduct({ id: 'p1', inventoryMode: 'bulk', masterStock: 200 });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 20 });

    const res = await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: -5, type: 'sale' });

    expect(store.variants.get('v1').stockQty).toBe(15);
    expect(store.products.get('p1').masterStock).toBe(200);
    expect(res.isHybridSale).toBe(true);
  });
});

describe('packageStock', () => {
  it('moves masterStock into variant.stockQty and writes a ledger row', async () => {
    putProduct({ id: 'p1', inventoryMode: 'bulk', masterStock: 100 });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 0 });

    const res = await packageStock({ productId: 'p1', packagingItems: [{ variantId: 'v1', qty: 10 }] });

    expect(store.products.get('p1').masterStock).toBe(90);
    expect(store.variants.get('v1').stockQty).toBe(10);
    expect(store.ledger).toHaveLength(1);
    expect(res.newMasterStock).toBe(90);
  });

  it('throws when packaging exceeds available bulk stock', async () => {
    putProduct({ id: 'p1', inventoryMode: 'bulk', masterStock: 5 });
    putVariant({ id: 'v1', productId: 'p1', packSize: 1, stockQty: 0 });

    await expect(
      packageStock({ productId: 'p1', packagingItems: [{ variantId: 'v1', qty: 10 }] })
    ).rejects.toThrow(/[Ii]nsufficient/);
  });
});
