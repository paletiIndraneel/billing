import { cid, newId, q, rows, one } from './_client';

const TABLE = 'expenses';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  date: r.date,
  category: r.category,
  amount: r.amount,
  paymentMethod: r.payment_method,
  vendorName: r.vendor_name,
  description: r.description,
  frequency: r.frequency,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('date' in d) out.date = d.date;
  if ('category' in d) out.category = d.category;
  if ('amount' in d) out.amount = d.amount ?? 0;
  if ('paymentMethod' in d) out.payment_method = d.paymentMethod || null;
  if ('vendorName' in d) out.vendor_name = d.vendorName || null;
  if ('description' in d) out.description = d.description || null;
  if ('frequency' in d) out.frequency = d.frequency || 'One-time';
  return out;
};

export const listExpenses = async () =>
  (await rows(q(TABLE).select('*').order('date', { ascending: false }))).map(fromRow);

export const getExpense = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createExpense = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateExpense = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteExpense = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
