import { cid, newId, q, rows, one } from './_client';

const TABLE = 'orders';

const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  orderType: r.order_type,
  orderNumber: r.order_number,
  partyId: r.party_id,
  date: r.date,
  expectedDate: r.expected_date,
  status: r.status,
  carrier: r.carrier,
  trackingNumber: r.tracking_number,
  notes: r.notes,
  linkedInvoiceId: r.linked_invoice_id,
  createdAt: r.created_at,
});

const toRow = (d) => {
  const out = {};
  if ('orderType' in d) out.order_type = d.orderType;
  if ('orderNumber' in d) out.order_number = d.orderNumber;
  if ('partyId' in d) out.party_id = d.partyId || null;
  if ('date' in d) out.date = d.date;
  if ('expectedDate' in d) out.expected_date = d.expectedDate || null;
  if ('status' in d) out.status = d.status;
  if ('carrier' in d) out.carrier = d.carrier || null;
  if ('trackingNumber' in d) out.tracking_number = d.trackingNumber || null;
  if ('notes' in d) out.notes = d.notes || null;
  if ('linkedInvoiceId' in d) out.linked_invoice_id = d.linkedInvoiceId || null;
  return out;
};

export const listOrders = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const getOrder = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createOrder = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateOrder = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteOrder = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
