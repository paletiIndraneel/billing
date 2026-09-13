import { cid, newId, q, rows, one } from './_client';

const TABLE = 'price_history';

const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  variantId: r.variant_id,
  oldPrice: r.old_price,
  newPrice: r.new_price,
  note: r.note,
  changedAt: r.changed_at,
});

export const listPriceHistoryByVariant = async (variantId) =>
  (await rows(q(TABLE).select('*').eq('variant_id', variantId).order('changed_at', { ascending: false }))).map(fromRow);

export const listRecentPriceHistory = async (limit = 5) =>
  (await rows(q(TABLE).select('*').order('changed_at', { ascending: false }).limit(limit))).map(fromRow);

export const createPriceHistoryEntry = async ({ variantId, oldPrice, newPrice, note = '' }) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), variant_id: variantId, old_price: oldPrice, new_price: newPrice, note: note || null }).select().single()
  ));
