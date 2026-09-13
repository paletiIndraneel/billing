# Supabase

Schema for the Lekhya web app. Single project: `lekhya-production`
(`pfnlpatvjkjykvvswouz`), Postgres 17.

## Migrations

`migrations/NNN_name.sql` — applied via the Supabase MCP `apply_migration`
tool (migration name = the file's basename without extension), **not** the
Supabase CLI. Files are kept here for version history and review.

Order: `001_schema` → `002_rls` → `003_realtime` → `004_columns` → `005_billing_gst_and_expense_enhancements` → `006_orders_shipment`.

There are no stored procedures / RPCs. Multi-table operations (invoice save,
stock adjustment) run client-side with compensating cleanup — see
`docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` §4.

## Applied

- `001_schema` — applied to lekhya-production on 2026-09-02
- `002_rls` — applied to lekhya-production on 2026-09-02
- `003_realtime` — applied to lekhya-production on 2026-09-02 (publication + replica identity full for Realtime)
- `004_columns` — applied to lekhya-production on 2026-09-02
- `005_billing_gst_and_expense_enhancements` — applied to lekhya-production on 2026-09-13 (parties.gst_type, invoices ship-to/billing-period columns, price_history table, expenses.frequency)
- `006_orders_shipment` — applied to lekhya-production on 2026-09-13 (orders + order_items tables for Sales/Purchase order + shipment tracking)
