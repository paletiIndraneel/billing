# Supabase

Schema for the Lekhya web app. Single project: `lekhya-production`
(`pfnlpatvjkjykvvswouz`), Postgres 17.

## Migrations

`migrations/NNN_name.sql` — applied via the Supabase MCP `apply_migration`
tool (migration name = the file's basename without extension), **not** the
Supabase CLI. Files are kept here for version history and review.

Order: `001_schema` → `002_rls`.

There are no stored procedures / RPCs. Multi-table operations (invoice save,
stock adjustment) run client-side with compensating cleanup — see
`docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` §4.
