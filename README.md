# Lekhya One v1.0

**Web GST billing & business-management app for Indian businesses**

Lekhya One is a single-page web app for GST invoicing, inventory management,
purchase orders, expense tracking, and compliance reporting. Sign in on any
device — Supabase is the single source of truth and your data is always
there.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Routing | react-router-dom 7 (`HashRouter`) |
| Database / Auth / Realtime | Supabase (Postgres 17) — single source of truth |
| Server-state cache | `@tanstack/react-query` 5 |
| Live invalidation | Supabase Realtime (cross-tab / cross-device) |
| PDF generation | jsPDF + jspdf-autotable |
| Excel export | SheetJS (`xlsx`) |
| QR codes | qrcode |
| Icons | lucide-react |
| Dates | date-fns |

---

## Features

- GST invoicing — CGST+SGST / IGST auto-routing, A4 PDFs, UPI QR codes
- Product catalogue with variants (SKU), packed/bulk inventory modes, barcode support
- Batch/lot tracking with expiry dates and an append-only stock ledger
- Purchase order management with auto stock adjustment and double-entry transactions
- Expense tracking across categories with PDF statements
- GSTR-1 and GSTR-3B JSON exports (government portal compatible)
- Party-level account ledger with PDF export
- Reports: P&L, Aging Analysis, Sales Report, Daybook, Inventory snapshot
- Multi-device: sign in anywhere; changes sync live via Supabase Realtime
- Subscription: trial → paid via license key

---

## Getting Started

```bash
# Install dependencies
npm.cmd install

# Run the dev server
npm.cmd run dev

# Build a static SPA into dist/ (deployable to any static host)
npm.cmd run build
```

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:5173
```

The Supabase anon key is public by design — it is safe to ship in the client
bundle. Row-Level Security is what protects tenant data.

Other scripts: `npm.cmd run lint` (eslint), `npm.cmd run preview` (serve the
build), `npm.cmd test` (vitest).

---

## Data Model

All business data lives in Supabase (Postgres). Every table is protected by
per-tenant Row-Level Security keyed on the `company_members` table, so a
signed-in user only ever sees rows for companies they belong to.

Key tables: `parties`, `products`, `product_variants`, `invoices`, `invoice_items`,
`transactions`, `expenses`, `purchases`, `stock_ledger`, `batches`, `leads`,
plus company / membership tables.

The schema is defined by the migrations in `supabase/migrations/`:

| File | Contents |
|---|---|
| `001_schema.sql` | Tables and relationships |
| `002_rls.sql` | Row-Level Security policies |
| `003_realtime.sql` | Realtime publication setup |
| `004_columns.sql` | Follow-up column additions |

---

## Project Structure

```
src/
├── pages/            # Route-level page components
│   ├── Dashboard.jsx  Billing.jsx  CRM.jsx  Inventory.jsx
│   ├── Expenses.jsx   Purchases.jsx  Payments.jsx  Reports.jsx
│   ├── Ledger.jsx     Settings.jsx  Login.jsx  Landing.jsx
│   └── SetupWizard.jsx
├── api/              # Supabase data layer — one module per table
│   ├── parties.js  products.js  variants.js  invoices.js
│   ├── invoiceItems.js  transactions.js  expenses.js
│   ├── purchases.js  stockLedger.js  batches.js  leads.js
│   ├── company.js   useTable.js  useEntity.js
│   └── realtime.js  _client.js
├── services/
│   └── stockService.js
├── lib/
│   ├── supabase.js       # Supabase client
│   ├── subscription.js   # trial / license-key logic
│   └── theme.js
├── components/       # Shared UI (Modal, Toast, etc.)
└── utils/            # validators.js, unitConversion.js

supabase/
└── migrations/       # 001_schema, 002_rls, 003_realtime, 004_columns
```

---

## License

Proprietary — Lekhya One. All rights reserved.
