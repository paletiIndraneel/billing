import { cid, newId, q, rows, one } from './_client';

const TABLE = 'leads';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  name: r.name,
  source: r.source,
  contactDetails: r.contact_details,
  opportunityValue: r.opportunity_value,
  stage: r.stage,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('source' in d) out.source = d.source || null;
  if ('contactDetails' in d) out.contact_details = d.contactDetails || null;
  if ('opportunityValue' in d) out.opportunity_value = d.opportunityValue ?? null;
  if ('stage' in d) out.stage = d.stage || null;
  return out;
};

export const listLeads = async () =>
  (await rows(q(TABLE).select('*').order('created_at'))).map(fromRow);

export const getLead = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createLead = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateLead = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteLead = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
