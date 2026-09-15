import { Receipt, Boxes, Users, Truck, Wallet, BarChart3 } from 'lucide-react';

const FEATURES = [
  {
    icon: Receipt,
    title: 'GST Billing & Invoicing',
    description: 'Create professional GST-compliant invoices with CGST, SGST and IGST.',
  },
  {
    icon: Boxes,
    title: 'Inventory Management',
    description: 'Track products, variants, batches, stock and reorder levels.',
  },
  {
    icon: Users,
    title: 'Customer & CRM Management',
    description: 'Manage customers, ledgers, balances and purchase history.',
  },
  {
    icon: Truck,
    title: 'Purchases & Supplier Management',
    description: 'Record purchases and manage supplier accounts in one place.',
  },
  {
    icon: Wallet,
    title: 'Expenses & Payments',
    description: 'Log business expenses and track payments against invoices.',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    description: 'Turn sales, expenses and GST data into useful business reports.',
  },
];

export default function FeatureGrid() {
  return (
    <div className="landing-features">
      {FEATURES.map(({ icon: Icon, title, description }) => (
        <div className="landing-feature-card" key={title}>
          <div className="landing-feature-icon">
            <Icon size={18} />
          </div>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
