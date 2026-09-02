import { cid, newId, q, rows, one } from './_client';

const TABLE = 'transactions';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  date: r.date,
  partyId: r.party_id,
  invoiceId: r.invoice_id,
  type: r.type,
  amount: r.amount,
  method: r.method,
  reference: r.reference,
  notes: r.notes,
  autoRecorded: r.auto_recorded,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('date' in d) out.date = d.date;
  if ('partyId' in d) out.party_id = d.partyId || null;
  if ('invoiceId' in d) out.invoice_id = d.invoiceId || null;
  if ('type' in d) out.type = d.type;
  if ('amount' in d) out.amount = d.amount ?? 0;
  if ('method' in d) out.method = d.method || null;
  if ('reference' in d) out.reference = d.reference || null;
  if ('notes' in d) out.notes = d.notes || null;
  if ('autoRecorded' in d) out.auto_recorded = d.autoRecorded ?? false;
  return out;
};

export const listTransactions = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const listTransactionsByParty = async (partyId) =>
  (await rows(q(TABLE).select('*').eq('party_id', partyId).order('date', { ascending: false }))).map(fromRow);

export const listTransactionsByInvoice = async (invoiceId) =>
  (await rows(q(TABLE).select('*').eq('invoice_id', invoiceId).order('date', { ascending: false }))).map(fromRow);

export const getTransaction = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createTransaction = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateTransaction = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteTransaction = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
