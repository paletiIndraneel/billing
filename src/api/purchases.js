import { cid, newId, q, rows, one } from './_client';

const TABLE = 'purchases';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  productId: r.product_id,
  variantId: r.variant_id,
  vendorId: r.vendor_id,
  date: r.date,
  qty: r.qty,
  purchasePrice: r.purchase_price,
  notes: r.notes,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('productId' in d) out.product_id = d.productId || null;
  if ('variantId' in d) out.variant_id = d.variantId || null;
  if ('vendorId' in d) out.vendor_id = d.vendorId || null;
  if ('date' in d) out.date = d.date;
  if ('qty' in d) out.qty = d.qty ?? 0;
  if ('purchasePrice' in d) out.purchase_price = d.purchasePrice ?? null;
  if ('notes' in d) out.notes = d.notes || null;
  return out;
};

export const listPurchases = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const listPurchasesByVariant = async (variantId) =>
  (await rows(q(TABLE).select('*').eq('variant_id', variantId).order('date', { ascending: false }))).map(fromRow);

export const getPurchase = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createPurchase = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updatePurchase = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deletePurchase = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
