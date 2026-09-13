-- Bug fix: price_history.variant_id had a real FK to product_variants, unlike
-- every other historical/log table (stock_ledger, purchases, batches,
-- invoice_items) which intentionally leaves variant_id unconstrained so a
-- variant can be deleted while its history survives. This FK blocked variant
-- deletion once a price change had been logged. Also add the missing
-- ON DELETE CASCADE on company_id, matching every other table's convention.
begin;

alter table price_history drop constraint if exists price_history_variant_id_fkey;

alter table price_history drop constraint if exists price_history_company_id_fkey;
alter table price_history add constraint price_history_company_id_fkey
  foreign key (company_id) references companies(id) on delete cascade;

commit;
