# Lekhya One v1.0

**Offline-First Desktop ERP for Indian Businesses**

Lekhya One is a Windows desktop application for GST billing, inventory management, purchase orders, expense tracking, and compliance reporting — built on Electron + React 19 + Vite with Dexie (IndexedDB) for local storage and Supabase for optional cloud sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 42 |
| Frontend | React 19 + Vite 8 |
| Local database | Dexie.js 4 (IndexedDB) |
| Cloud / Auth | Supabase |
| PDF generation | jsPDF + jspdf-autotable |
| Excel I/O | SheetJS (xlsx) |
| QR codes | qrcode |
| Icons | lucide-react |

---

## Features

- GST invoicing — CGST+SGST / IGST auto-routing, multi-theme A4 PDFs, UPI QR codes
- Product catalogue with variants (SKU), packed/bulk inventory modes, barcode support
- Batch/lot tracking with expiry dates and immutable stock ledger
- Purchase order management with auto stock adjustment and double-entry transactions
- Expense tracking across 12 categories with PDF statements
- GSTR-1 and GSTR-3B JSON exports (government portal compatible)
- Party-level account ledger with PDF export
- P&L, Aging Analysis, Sales Report, Daybook, Inventory snapshot
- Multi-device sync via Supabase (cloud) + Google Drive backup (Electron only)
- Subscription management: 14-day trial → Basic/Pro via license key

---

## Development

```bash
# Install dependencies
npm install

# Run in browser (Vite dev server only)
npm run dev

# Run as Electron desktop app
npm run electron:dev
```

---

## Build

```bash
# Build Windows installer (.exe via NSIS)
npm run dist:win
```

Output: `release/Lekhya One Setup 1.0.0.exe`

---

## Project Structure

```
src/
├── pages/          # Route-level page components
│   ├── Dashboard.jsx
│   ├── Billing.jsx
│   ├── CRM.jsx
│   ├── Inventory.jsx
│   ├── Expenses.jsx
│   ├── Purchases.jsx
│   ├── Payments.jsx
│   ├── Reports.jsx
│   ├── Ledger.jsx
│   ├── Settings.jsx
│   ├── Login.jsx
│   └── SetupWizard.jsx
├── db/
│   └── db.js       # Dexie schema (v15) + auth helpers
├── lib/
│   ├── supabase.js # Supabase client
│   └── subscription.js
├── services/
│   └── stockService.js
├── components/     # Shared UI (Modal, Toast, etc.)
└── utils/          # Validators, unit conversion
electron/
├── main.cjs        # Electron main process
└── preload.cjs     # Context bridge (appVersion, Google Drive API)
```

---

## Database Schema

Local IndexedDB managed by Dexie.js at schema version 15. Key tables: `parties`, `products`, `productVariants`, `invoices`, `transactions`, `expenses`, `purchases`, `stockLedger`, `batches`, `settings`.

All data tables carry `cloudId`, `syncStatus`, `lastModified`, and `deviceId` fields for multi-device Supabase sync.

---

## License

Proprietary — Lekhya One. All rights reserved.

To build the run : cd "c:\Users\kiran\OneDrive\Documents\Bizz-ledger" && npm run dist:win