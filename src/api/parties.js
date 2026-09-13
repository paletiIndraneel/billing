import { cid, newId, q, rows, one } from './_client';

const TABLE = 'parties';

// DB row (snake_case) -> app object (camelCase)
export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  name: r.name,
  gstin: r.gstin,
  phone: r.phone,
  address: r.address,
  email: r.email,
  type: r.type,
  creditLimit: r.credit_limit,
  creditDays: r.credit_days,
  activities: r.activities ?? [],
  gstType: r.gst_type,
  createdAt: r.created_at,
});

// app object (camelCase) -> DB columns (snake_case). Only defined keys are sent.
export const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('gstin' in d) out.gstin = d.gstin || null;
  if ('phone' in d) out.phone = d.phone || null;
  if ('address' in d) out.address = d.address || null;
  if ('email' in d) out.email = d.email || null;
  if ('type' in d) out.type = d.type;
  if ('creditLimit' in d) out.credit_limit = d.creditLimit ?? null;
  if ('creditDays' in d) out.credit_days = d.creditDays ?? null;
  if ('activities' in d) out.activities = d.activities ?? [];
  if ('gstType' in d) out.gst_type = d.gstType || null;
  return out;
};

export const listParties = async () =>
  (await rows(q(TABLE).select('*').order('name'))).map(fromRow);

export const getParty = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createParty = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateParty = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteParty = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
