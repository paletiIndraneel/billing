import { cid, newId, q, rows, one } from './_client';

const TABLE = 'stock_ledger';

// APPEND-ONLY: no update/delete.
export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  variantId: r.variant_id,
  productId: r.product_id,
  type: r.type,
  packs: r.packs,
  baseQtyDelta: r.base_qty_delta,
  balanceQty: r.balance_qty,
  unitCost: r.unit_cost,
  batchNo: r.batch_no,
  reference: r.reference,
  note: r.note,
  date: r.date,
});

export const toRow = (d) => {
  const out = {};
  if ('variantId' in d) out.variant_id = d.variantId;
  if ('productId' in d) out.product_id = d.productId || null;
  if ('type' in d) out.type = d.type;
  if ('packs' in d) out.packs = d.packs ?? null;
  if ('baseQtyDelta' in d) out.base_qty_delta = d.baseQtyDelta ?? null;
  if ('balanceQty' in d) out.balance_qty = d.balanceQty ?? null;
  if ('unitCost' in d) out.unit_cost = d.unitCost ?? null;
  if ('batchNo' in d) out.batch_no = d.batchNo || null;
  if ('reference' in d) out.reference = d.reference || null;
  if ('note' in d) out.note = d.note || null;
  if ('date' in d) out.date = d.date;
  return out;
};

export const listStockLedger = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const listLedgerByVariant = async (variantId) =>
  (await rows(q(TABLE).select('*').eq('variant_id', variantId).order('date', { ascending: false }))).map(fromRow);

export const createStockLedgerEntry = async (entry) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(entry) }).select().single()
  ));
