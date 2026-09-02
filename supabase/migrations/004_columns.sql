-- Phase 2b: columns the page audit found missing from 001_schema.
begin;
alter table transactions add column if not exists expense_id uuid;
alter table invoices     add column if not exists ref_invoice_number text;
alter table companies    add column if not exists default_terms text;
alter table companies    add column if not exists credit_note_seq int not null default 0;
alter table companies    add column if not exists debit_note_seq  int not null default 0;
commit;
