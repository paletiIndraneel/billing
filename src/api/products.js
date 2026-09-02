import { cid, newId, q, rows, one } from './_client';

const TABLE = 'products';

export const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  name: r.name,
  hsn: r.hsn,
  inventoryMode: r.inventory_mode,
  masterStock: r.master_stock,
  baseUnit: r.base_unit,
  avgCostPerBase: r.avg_cost_per_base,
  createdAt: r.created_at,
});

export const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('hsn' in d) out.hsn = d.hsn || null;
  if ('inventoryMode' in d) out.inventory_mode = d.inventoryMode;
  if ('masterStock' in d) out.master_stock = d.masterStock ?? 0;
  if ('baseUnit' in d) out.base_unit = d.baseUnit || null;
  if ('avgCostPerBase' in d) out.avg_cost_per_base = d.avgCostPerBase ?? null;
  return out;
};

export const listProducts = async () =>
  (await rows(q(TABLE).select('*').order('name'))).map(fromRow);

export const getProduct = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createProduct = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateProduct = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteProduct = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
