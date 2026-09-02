import { cid, newId, q, rows, one } from './_client';

const TABLE = 'batches';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  variantId: r.variant_id,
  productId: r.product_id,
  batchNo: r.batch_no,
  mfgDate: r.mfg_date,
  expiryDate: r.expiry_date,
  status: r.status,
  receivedQty: r.received_qty,
  remainingQty: r.remaining_qty,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('variantId' in d) out.variant_id = d.variantId;
  if ('productId' in d) out.product_id = d.productId || null;
  if ('batchNo' in d) out.batch_no = d.batchNo || null;
  if ('mfgDate' in d) out.mfg_date = d.mfgDate || null;
  if ('expiryDate' in d) out.expiry_date = d.expiryDate || null;
  if ('status' in d) out.status = d.status;
  if ('receivedQty' in d) out.received_qty = d.receivedQty ?? null;
  if ('remainingQty' in d) out.remaining_qty = d.remainingQty ?? null;
  return out;
};

export const listBatches = async () =>
  (await rows(q(TABLE).select('*').order('expiry_date'))).map(fromRow);

export const listBatchesByVariant = async (variantId) =>
  (await rows(q(TABLE).select('*').eq('variant_id', variantId).order('expiry_date'))).map(fromRow);

export const listActiveBatches = async () =>
  (await rows(q(TABLE).select('*').eq('status', 'active').order('expiry_date'))).map(fromRow);

export const getBatch = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createBatch = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateBatch = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteBatch = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
