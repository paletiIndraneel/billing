import { supabase } from './_client';

const TABLES = {
  parties: 'parties', products: 'products', product_variants: 'variants',
  invoices: 'invoices', invoice_items: 'invoiceItems', transactions: 'transactions',
  expenses: 'expenses', purchases: 'purchases', stock_ledger: 'stockLedger',
  batches: 'batches', leads: 'leads',
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
