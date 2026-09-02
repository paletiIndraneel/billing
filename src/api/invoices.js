import { cid, newId, q, rows, one } from './_client';

const TABLE = 'invoices';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  invoiceNumber: r.invoice_number,
  type: r.type,
  partyId: r.party_id,
  date: r.date,
  dueDate: r.due_date,
  taxType: r.tax_type,
  grossSubtotal: r.gross_subtotal,
  itemDiscountAmt: r.item_discount_amt,
  discountPct: r.discount_pct,
  discountAmt: r.discount_amt,
  subtotal: r.subtotal,
  taxAmount: r.tax_amount,
  shipping: r.shipping,
  total: r.total,
  status: r.status,
  paymentStatus: r.payment_status,
  notes: r.notes,
  terms: r.terms,
  theme: r.theme,
  payments: r.payments ?? [],
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('invoiceNumber' in d) out.invoice_number = d.invoiceNumber;
  if ('type' in d) out.type = d.type;
  if ('partyId' in d) out.party_id = d.partyId || null;
  if ('date' in d) out.date = d.date;
  if ('dueDate' in d) out.due_date = d.dueDate || null;
  if ('taxType' in d) out.tax_type = d.taxType || null;
  if ('grossSubtotal' in d) out.gross_subtotal = d.grossSubtotal ?? null;
  if ('itemDiscountAmt' in d) out.item_discount_amt = d.itemDiscountAmt ?? null;
  if ('discountPct' in d) out.discount_pct = d.discountPct ?? null;
  if ('discountAmt' in d) out.discount_amt = d.discountAmt ?? null;
  if ('subtotal' in d) out.subtotal = d.subtotal ?? 0;
  if ('taxAmount' in d) out.tax_amount = d.taxAmount ?? 0;
  if ('shipping' in d) out.shipping = d.shipping ?? null;
  if ('total' in d) out.total = d.total ?? 0;
  if ('status' in d) out.status = d.status || null;
  if ('paymentStatus' in d) out.payment_status = d.paymentStatus || null;
  if ('notes' in d) out.notes = d.notes || null;
  if ('terms' in d) out.terms = d.terms || null;
  if ('theme' in d) out.theme = d.theme || null;
  if ('payments' in d) out.payments = d.payments ?? [];
  return out;
};

export const listInvoices = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const listInvoicesByParty = async (partyId) =>
  (await rows(q(TABLE).select('*').eq('party_id', partyId).order('date', { ascending: false }))).map(fromRow);

export const getInvoice = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createInvoice = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateInvoice = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteInvoice = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
