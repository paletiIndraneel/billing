import { cid, newId, q, rows, one } from './_client';

const TABLE = 'product_variants';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  productId: r.product_id,
  packSize: r.pack_size,
  unit: r.unit,
  purchasePrice: r.purchase_price,
  sellingPrice: r.selling_price,
  gstRate: r.gst_rate,
  stockQty: r.stock_qty,
  reorderPoint: r.reorder_point,
  barcode: r.barcode,
  averageCost: r.average_cost,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('productId' in d) out.product_id = d.productId;
  if ('packSize' in d) out.pack_size = Number(d.packSize) || 0;
  if ('unit' in d) out.unit = d.unit;
  if ('purchasePrice' in d) out.purchase_price = Number(d.purchasePrice) || 0;
  if ('sellingPrice' in d) out.selling_price = Number(d.sellingPrice) || 0;
  if ('gstRate' in d) out.gst_rate = Number(d.gstRate) || 0;
  if ('stockQty' in d) out.stock_qty = Number(d.stockQty) || 0;
  if ('reorderPoint' in d) out.reorder_point = d.reorderPoint ?? null;
  if ('barcode' in d) out.barcode = d.barcode || null;
  if ('averageCost' in d) out.average_cost = d.averageCost ?? null;
  return out;
};

export const listVariants = async () =>
  (await rows(q(TABLE).select('*').order('created_at'))).map(fromRow);

export const listVariantsByProduct = async (productId) =>
  (await rows(q(TABLE).select('*').eq('product_id', productId).order('created_at'))).map(fromRow);

export const getVariant = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createVariant = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateVariant = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteVariant = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
