import { cid, newId, q, rows, one } from './_client';

const TABLE = 'invoice_items';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  invoiceId: r.invoice_id,
  productId: r.product_id,
  variantId: r.variant_id,
  name: r.name,
  hsn: r.hsn,
  unit: r.unit,
  qty: r.qty,
  rate: r.rate,
  basePrice: r.base_price,
  gstRate: r.gst_rate,
  itemDiscountPct: r.item_discount_pct,
  productName: r.product_name,
  packSize: r.pack_size,
  costAtSale: r.cost_at_sale,
  purchasePriceSnapshot: r.purchase_price_snapshot,
  sellingPrice: r.selling_price,
  barcodeSnapshot: r.barcode_snapshot,
});

export const toRow = (d) => {
  const out = {};
  if ('invoiceId' in d) out.invoice_id = d.invoiceId;
  if ('productId' in d) out.product_id = d.productId || null;
  if ('variantId' in d) out.variant_id = d.variantId || null;
  if ('name' in d) out.name = d.name || null;
  if ('hsn' in d) out.hsn = d.hsn || null;
  if ('unit' in d) out.unit = d.unit || null;
  if ('qty' in d) out.qty = d.qty ?? 0;
  if ('rate' in d) out.rate = d.rate ?? null;
  if ('basePrice' in d) out.base_price = d.basePrice ?? null;
  if ('gstRate' in d) out.gst_rate = d.gstRate ?? null;
  if ('itemDiscountPct' in d) out.item_discount_pct = d.itemDiscountPct ?? null;
  if ('productName' in d) out.product_name = d.productName || null;
  if ('packSize' in d) out.pack_size = d.packSize ?? null;
  if ('costAtSale' in d) out.cost_at_sale = d.costAtSale ?? null;
  if ('purchasePriceSnapshot' in d) out.purchase_price_snapshot = d.purchasePriceSnapshot ?? null;
  if ('sellingPrice' in d) out.selling_price = d.sellingPrice ?? null;
  if ('barcodeSnapshot' in d) out.barcode_snapshot = d.barcodeSnapshot || null;
  return out;
};

export const listInvoiceItems = async () =>
  (await rows(q(TABLE).select('*').order('id'))).map(fromRow);

export const listItemsByInvoice = async (invoiceId) =>
  (await rows(q(TABLE).select('*').eq('invoice_id', invoiceId).order('id'))).map(fromRow);

export const getInvoiceItem = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createInvoiceItem = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateInvoiceItem = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteInvoiceItem = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const deleteItemsByInvoice = async (invoiceId) => {
  const { error } = await q(TABLE).delete().eq('invoice_id', invoiceId);
  if (error) throw new Error(error.message);
};
