export const SITE_URL = 'https://nexauraglobal.site';
export const COMPANY_NAME = 'KANARA CLOUD SOLUTIONS Pvt. Ltd.';
export const CONTACT_EMAIL = 'contact@kanaracloudsolutions.dpdns.org';
export const OG_IMAGE = `${SITE_URL}/favicon.png`;

// Primary public navigation, shared by header + footer + sitemap generation source of truth.
export const NAV_LINKS = [
  { to: '/features/', label: 'Features' },
  { to: '/gst-billing/', label: 'GST Billing' },
  { to: '/inventory-management/', label: 'Inventory' },
  { to: '/crm/', label: 'CRM' },
  { to: '/pricing/', label: 'Pricing' },
  { to: '/about/', label: 'About' },
];

// SEO metadata per public route. `path` matches the sitemap/canonical form (trailing slash, except home).
export const SEO_META = {
  home: {
    path: '/',
    title: 'NEXAURA — Business Management Software for Indian Businesses',
    description: 'NEXAURA helps you manage GST billing, invoicing, inventory, CRM, purchases, expenses, payments and business reports — all in one connected platform.',
  },
  features: {
    path: '/features/',
    title: 'NEXAURA Features — Business Management Software for Indian Businesses',
    description: 'Explore NEXAURA’s features: GST billing & invoicing, inventory management, CRM, purchases, expenses & payments, orders, ledger and reports — in one platform.',
  },
  gstBilling: {
    path: '/gst-billing/',
    title: 'GST Billing Software for Indian Businesses | NEXAURA',
    description: 'Create GST invoices with CGST, SGST and IGST, track payments, manage GST rates per product, and keep a complete invoice history with NEXAURA.',
  },
  inventoryManagement: {
    path: '/inventory-management/',
    title: 'Inventory Management Software for Small Businesses | NEXAURA',
    description: 'Track products, stock levels, purchases and reorder levels in one place. See how sales and purchases affect your inventory in real time with NEXAURA.',
  },
  crm: {
    path: '/crm/',
    title: 'CRM Software for Small Businesses in India | NEXAURA',
    description: 'Manage customer details, purchase history, outstanding balances and ledgers — connected to your billing and payments — with NEXAURA’s simple CRM.',
  },
  payments: {
    path: '/payments/',
    title: 'Payment & Expense Management Software | NEXAURA',
    description: 'Track customer payments, outstanding invoices, supplier payments and business expenses in one place, with NEXAURA’s reports for full financial visibility.',
  },
  pricing: {
    path: '/pricing/',
    title: 'NEXAURA Pricing — Business Management Software',
    description: 'Simple pricing for growing businesses. Contact NEXAURA to find the right plan for your business.',
  },
  about: {
    path: '/about/',
    title: 'About NEXAURA | KANARA CLOUD SOLUTIONS',
    description: 'NEXAURA is a business management platform developed by KANARA CLOUD SOLUTIONS Pvt. Ltd., built to simplify billing, inventory, customers and reports for Indian businesses.',
  },
  contact: {
    path: '/contact/',
    title: 'Contact NEXAURA | KANARA CLOUD SOLUTIONS',
    description: 'Get in touch with the NEXAURA team at KANARA CLOUD SOLUTIONS Pvt. Ltd.',
  },
  blog: {
    path: '/blog/',
    title: 'NEXAURA Blog — Business, GST Billing & Inventory Guides',
    description: 'Guides on GST billing, inventory management and running a small business in India. New articles are on the way.',
  },
};

export const CORE_FEATURES = [
  {
    slug: 'gst-billing',
    title: 'GST Billing & Invoicing',
    description: 'Create GST invoices with CGST, SGST and IGST, set GST rates per product, and keep a searchable invoice history.',
    href: '/gst-billing/',
  },
  {
    slug: 'inventory',
    title: 'Inventory Management',
    description: 'Track products, stock levels, purchases and reorder levels so you always know what you have on hand.',
    href: '/inventory-management/',
  },
  {
    slug: 'crm',
    title: 'Customer & CRM Management',
    description: 'Keep customer details, purchase history and outstanding balances connected to billing and payments.',
    href: '/crm/',
  },
  {
    slug: 'purchases',
    title: 'Purchases & Supplier Management',
    description: 'Record purchases and manage supplier accounts, with stock updated automatically as you receive goods.',
    href: '/features/',
  },
  {
    slug: 'expenses-payments',
    title: 'Expenses & Payments',
    description: 'Log business expenses and track customer and supplier payments against invoices in one place.',
    href: '/payments/',
  },
  {
    slug: 'orders',
    title: 'Orders & Shipment',
    description: 'Track orders from confirmation through to shipment alongside the rest of your business records.',
    href: '/features/',
  },
  {
    slug: 'ledger',
    title: 'Ledger Management',
    description: 'See a running account ledger for every customer and vendor, built from your invoices and payments.',
    href: '/features/',
  },
  {
    slug: 'reports',
    title: 'Reports & Analytics',
    description: 'Turn sales, expenses and GST data into reports that help you understand how the business is doing.',
    href: '/features/',
  },
];

export const GST_BILLING_FEATURES = [
  { title: 'CGST, SGST & IGST', description: 'Create invoices that split tax correctly for intra-state and inter-state sales.' },
  { title: 'GSTIN & product GST rates', description: 'Store customer GSTIN and set GST rates per product so invoices calculate tax automatically.' },
  { title: 'Invoice numbering & history', description: 'Every invoice is numbered and saved, so you can search and reprint past invoices any time.' },
  { title: 'Payment tracking', description: 'Mark invoices as paid, partially paid, or outstanding, and track payments against each one.' },
  { title: 'GST-related reports', description: 'Review sales and tax summaries drawn directly from the invoices you’ve created.' },
];

export const GST_BILLING_FAQS = [
  { q: 'What is GST billing software?', a: 'GST billing software helps you create invoices that correctly apply CGST, SGST or IGST based on the sale, instead of calculating tax manually.' },
  { q: 'Can NEXAURA create CGST and SGST invoices?', a: 'Yes. NEXAURA creates invoices with CGST and SGST for intra-state sales.' },
  { q: 'Can NEXAURA handle IGST invoices?', a: 'Yes. NEXAURA creates invoices with IGST for inter-state sales.' },
  { q: 'Can I track customer payments?', a: 'Yes. You can record payments against invoices and see what’s outstanding, from the Payments and Ledger sections.' },
  { q: 'Can I manage products and inventory with billing?', a: 'Yes. Products carry their own GST rate and stock level, and billing an invoice updates inventory automatically.' },
];

export const INVENTORY_FEATURES = [
  { title: 'Product catalog', description: 'Keep a single record for every product, including packaging/unit and GST rate.' },
  { title: 'Stock levels', description: 'See current stock for every product, updated automatically as you bill and purchase.' },
  { title: 'Purchases update stock', description: 'Recording a purchase adds to stock and tracks purchase cost against that product.' },
  { title: 'Reorder levels', description: 'Set a reorder level per product so low stock is easy to spot.' },
  { title: 'Sales & inventory together', description: 'Billing an invoice reduces stock automatically, keeping inventory and sales in sync.' },
];

export const INVENTORY_FAQS = [
  { q: 'What is inventory management software?', a: 'It’s software that tracks how much stock you have of each product, and how purchases and sales change that stock over time.' },
  { q: 'Can I track stock levels?', a: 'Yes. NEXAURA shows current stock per product, updated as you bill and purchase.' },
  { q: 'Can I set reorder levels?', a: 'Yes. Set a reorder level per product so you know when it’s time to restock.' },
  { q: 'Can purchases update inventory?', a: 'Yes. Recording a purchase adds the received quantity to that product’s stock.' },
];

export const BLOG_TOPICS = [
  'How to Create a GST Invoice in India',
  'GST Invoice vs Bill: What’s the Difference?',
  'CGST vs SGST vs IGST Explained',
  'How to Track Inventory for a Small Business',
  'What Is Inventory Management Software?',
  'How to Track Customer Payments and Outstanding Dues',
  'Billing Software vs Excel for Small Businesses',
  'How to Manage Business Expenses',
];
