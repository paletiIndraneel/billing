import { cid, newId, q, rows, one } from './_client';

const TABLE = 'order_items';

const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  orderId: r.order_id,
  productId: r.product_id,
  variantId: r.variant_id,
  productName: r.product_name,
  unit: r.unit,
  qty: r.qty,
  rate: r.rate,
});

const toRow = (d) => {
  const out = {};
  if ('orderId' in d) out.order_id = d.orderId;
  if ('productId' in d) out.product_id = d.productId || null;
  if ('variantId' in d) out.variant_id = d.variantId || null;
  if ('productName' in d) out.product_name = d.productName || null;
  if ('unit' in d) out.unit = d.unit || null;
  if ('qty' in d) out.qty = Number(d.qty) || 0;
  if ('rate' in d) out.rate = Number(d.rate) || 0;
  return out;
};

export const listItemsByOrder = async (orderId) =>
  (await rows(q(TABLE).select('*').eq('order_id', orderId))).map(fromRow);

export const listOrderItems = async () =>
  (await rows(q(TABLE).select('*'))).map(fromRow);

export const createOrderItem = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const deleteItemsByOrder = async (orderId) => {
  const { error } = await q(TABLE).delete().eq('order_id', orderId);
  if (error) throw new Error(error.message);
};
