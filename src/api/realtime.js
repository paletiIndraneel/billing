import { supabase } from './_client';

export const TABLES = {
  parties: 'parties', products: 'products', product_variants: 'variants',
  invoices: 'invoices', invoice_items: 'invoiceItems', transactions: 'transactions',
  expenses: 'expenses', purchases: 'purchases', stock_ledger: 'stockLedger',
  batches: 'batches', leads: 'leads', price_history: 'priceHistory',
  orders: 'orders', order_items: 'orderItems',
};

// canonical query keys — pages MUST key useTable/useEntity on one of these.
// `company` is here for 2b's Settings; it has no realtime subscription
// (companies has no company_id column) — updateCompany invalidates it directly.
export const QK = {
  ...Object.fromEntries(Object.values(TABLES).map(k => [k, k])),
  company: 'company',
};

let channel = null;

export function startRealtime(queryClient) {
  const companyId = localStorage.getItem('lekhya_company_id');
  if (!companyId || channel) return;
  channel = supabase.channel('lekhya-rt');
  for (const [pgTable, key] of Object.entries(TABLES)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: pgTable, filter: `company_id=eq.${companyId}` },
      () => queryClient.invalidateQueries({ queryKey: [key] }),
    );
  }
  channel.subscribe();
}

export function stopRealtime() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}
