import { useState, useMemo } from 'react';
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { getCompany } from '../api/company';
import { listInvoices } from '../api/invoices';
import { listInvoiceItems } from '../api/invoiceItems';
import { listExpenses } from '../api/expenses';
import { listParties } from '../api/parties';
import { listTransactions } from '../api/transactions';
import { listVariants } from '../api/variants';
import { listProducts } from '../api/products';
import { listStockLedger } from '../api/stockLedger';
import { BarChart2, FileText, IndianRupee, TrendingUp, TrendingDown, AlertTriangle, Download, Clock, BookOpen, Package } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function fmtINR0(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function monthLabel(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}
function daysDiff(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function DateFilters({ dateFrom, dateTo, setDateFrom, setDateTo }) {
  return (
    <div className="card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>Date Range:</span>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>to</span>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && (
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'var(--primary)', icon: Icon }) {
  return (
    <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        {Icon && <Icon size={16} style={{ color }} />}
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.1rem', color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'gst', label: 'GST Report', icon: FileText },
  { id: 'aging', label: 'Aging Analysis', icon: Clock },
  { id: 'sales', label: 'Sales Report', icon: TrendingUp },
  { id: 'pl', label: 'P&L Statement', icon: IndianRupee },
  { id: 'daybook', label: 'Daybook', icon: BookOpen },
  { id: 'inventory', label: 'Inventory', icon: Package },
];

export default function Reports() {
  const invoicesRaw = useTable(QK.invoices, listInvoices);
  const invoiceItems = useTable(QK.invoiceItems, listInvoiceItems);
  // invoices table has no lineItems column — attach invoice_items rows so all report math resolves.
  const invoices = useMemo(() => {
    const byInv = {};
    for (const it of invoiceItems) (byInv[it.invoiceId] ||= []).push(it);
    return invoicesRaw.map(inv => ({ ...inv, lineItems: byInv[inv.id] || [] }));
  }, [invoicesRaw, invoiceItems]);
  const expenses = useTable(QK.expenses, listExpenses);
  const parties = useTable(QK.parties, listParties);
  const transactions = useTable(QK.transactions, listTransactions);
  const variants = useTable(QK.variants, listVariants);
  const products = useTable(QK.products, listProducts);
  const stockLedger = useTable(QK.stockLedger, listStockLedger);

  const toast = useToast();

  const [tab, setTab] = useState('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deadStockDays, setDeadStockDays] = useState(90);

  // Draft/Cancelled invoices are not real sales — exclude them from all reports.
  const isCountedSale = i => i.status !== 'Draft' && i.status !== 'Cancelled';
  const salesInvoices = useMemo(() => (invoices || []).filter(i => (i.type === 'Sales' || !i.type) && isCountedSale(i)), [invoices]);
  const salesReturns = useMemo(() => (invoices || []).filter(i => i.type === 'CreditNote'), [invoices]);
  const purchaseInvoices = useMemo(() => (invoices || []).filter(i => i.type === 'Purchase' && isCountedSale(i)), [invoices]);
  const purchaseReturns = useMemo(() => (invoices || []).filter(i => i.type === 'DebitNote'), [invoices]);

  const filterByDate = (arr, field = 'date') => {
    let res = arr;
    if (dateFrom) res = res.filter(r => r[field] >= dateFrom);
    if (dateTo) res = res.filter(r => r[field] <= dateTo + 'T23:59:59');
    return res;
  };

  const filteredSales = useMemo(() => filterByDate(salesInvoices), [salesInvoices, dateFrom, dateTo]);
  const filteredSalesReturns = useMemo(() => filterByDate(salesReturns), [salesReturns, dateFrom, dateTo]);
  const filteredPurchases = useMemo(() => filterByDate(purchaseInvoices), [purchaseInvoices, dateFrom, dateTo]);
  const filteredPurchaseReturns = useMemo(() => filterByDate(purchaseReturns), [purchaseReturns, dateFrom, dateTo]);
  const filteredExpenses = useMemo(() => filterByDate(expenses || [], 'date'), [expenses, dateFrom, dateTo]);
  const filteredTransactions = useMemo(() => filterByDate(transactions || [], 'date'), [transactions, dateFrom, dateTo]);

  // Revenue and purchase amounts are ex-GST (subtotal only).
  // GST collected/paid are government liabilities/credits, not business income/cost.
  const totalRevenue = filteredSales.reduce((s, i) => s + (i.subtotal || 0) + (i.shipping || 0), 0);
  const totalGSTCollected = filteredSales.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const totalSalesReturns = filteredSalesReturns.reduce((s, i) => s + (i.subtotal || 0), 0);
  const totalSalesReturnsGST = filteredSalesReturns.reduce((s, i) => s + (i.taxAmount || 0), 0);

  const totalPurchases = filteredPurchases.reduce((s, i) => s + (i.subtotal || 0), 0);
  const totalGSTPaid = filteredPurchases.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const totalPurchaseReturns = filteredPurchaseReturns.reduce((s, i) => s + (i.subtotal || 0), 0);
  const totalPurchaseReturnsGST = filteredPurchaseReturns.reduce((s, i) => s + (i.taxAmount || 0), 0);

  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const recurringExpenses = filteredExpenses
    .filter(e => ['Weekly', 'Monthly', 'Quarterly', 'Yearly'].includes(e.frequency))
    .reduce((s, e) => s + (e.amount || 0), 0);

  const netRevenue = totalRevenue - totalSalesReturns;
  const netGSTCollected = totalGSTCollected - totalSalesReturnsGST;
  const netPurchases = totalPurchases - totalPurchaseReturns;
  const netGSTPaid = totalGSTPaid - totalPurchaseReturnsGST;

  const grossProfit = netRevenue - netPurchases;
  const netProfit = grossProfit - totalExpenses;
  const netGSTLiability = netGSTCollected - netGSTPaid;

  // Accrual COGS using costAtSale snapshots (populated on invoices after inventory costing fix)
  const trueCOGS = filteredSales.reduce((t, inv) =>
    t + (inv.lineItems || []).reduce((s, item) => s + (item.costAtSale ?? 0) * (item.qty || 0), 0), 0)
    - filteredSalesReturns.reduce((t, inv) =>
    t + (inv.lineItems || []).reduce((s, item) => s + (item.costAtSale ?? 0) * (item.qty || 0), 0), 0);
  const grossProfitByCOGS = netRevenue - trueCOGS;

  // Monthly grouping for sales/purchases
  function groupByMonth(arr) {
    const map = {};
    arr.forEach(item => {
      const key = new Date(item.date).toISOString().slice(0, 7);
      if (!map[key]) map[key] = { count: 0, taxable: 0, tax: 0, total: 0 };
      map[key].count++;
      map[key].taxable += item.subtotal || 0;
      map[key].tax += item.taxAmount || 0;
      map[key].total += item.total || 0;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }

  // HSN grouping from line items (IGST-aware)
  const hsnSummary = useMemo(() => {
    const map = {};
    filteredSales.forEach(inv => {
      const isIGST = inv.taxType === 'IGST';
      (inv.lineItems || []).forEach(item => {
        const key = item.hsn || 'N/A';
        if (!map[key]) map[key] = { hsn: key, desc: item.name, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
        const rate = item.rate || item.basePrice || 0;
        const itemDiscPct = item.itemDiscountPct || 0;
        const invDiscPct = inv.discountPct || 0;
        const gross = rate * (item.qty || 1);
        const afterItemDisc = gross * (1 - itemDiscPct / 100);
        const taxable = afterItemDisc * (1 - invDiscPct / 100);
        const tax = taxable * ((item.gstRate || 0) / 100);
        map[key].qty += item.qty || 1;
        map[key].taxable += taxable;
        if (isIGST) {
          map[key].igst += tax;
        } else {
          map[key].cgst += tax / 2;
          map[key].sgst += tax / 2;
        }
        map[key].total += taxable + tax;
      });
    });
    return Object.values(map).sort((a, b) => b.taxable - a.taxable);
  }, [filteredSales]);

  // Aging for receivables
  const receivablesAging = useMemo(() => {
    const pending = salesInvoices.filter(i => i.status === 'Pending');
    const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    pending.forEach(inv => {
      const days = daysDiff(inv.dueDate || inv.date);
      if (days <= 30) buckets['0-30'].push(inv);
      else if (days <= 60) buckets['31-60'].push(inv);
      else if (days <= 90) buckets['61-90'].push(inv);
      else buckets['90+'].push(inv);
    });
    return buckets;
  }, [salesInvoices]);

  const payablesAging = useMemo(() => {
    const pending = purchaseInvoices.filter(i => i.status === 'Pending');
    const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    pending.forEach(inv => {
      const days = daysDiff(inv.dueDate || inv.date);
      if (days <= 30) buckets['0-30'].push(inv);
      else if (days <= 60) buckets['31-60'].push(inv);
      else if (days <= 90) buckets['61-90'].push(inv);
      else buckets['90+'].push(inv);
    });
    return buckets;
  }, [purchaseInvoices]);

  // Top customers by revenue
  const topCustomers = useMemo(() => {
    const map = {};
    filteredSales.forEach(inv => {
      map[inv.partyId] = (map[inv.partyId] || 0) + (inv.total || 0);
    });
    return Object.entries(map)
      .map(([id, amt]) => ({ party: parties?.find(p => p.id === id), amt }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 10);
  }, [filteredSales, parties]);

  const monthlyData = useMemo(() => groupByMonth(filteredSales), [filteredSales]);
  const monthlyPurchases = useMemo(() => groupByMonth(filteredPurchases), [filteredPurchases]);

  // Product profitability: group all filtered sales line items by variant
  const productProfitability = useMemo(() => {
    const map = {};
    filteredSales.forEach(inv => {
      (inv.lineItems || []).forEach(item => {
        const key = item.variantId ?? item.productId;
        if (!map[key]) map[key] = { name: item.name || item.productName || '—', variantId: item.variantId, productId: item.productId, qty: 0, revenue: 0, cogs: 0 };
        const rate = item.rate || item.basePrice || 0;
        const itemDisc = item.itemDiscountPct || 0;
        const invDisc = inv.discountPct || 0;
        const lineRev = rate * (item.qty || 0) * (1 - itemDisc / 100) * (1 - invDisc / 100);
        const lineCOGS = (item.costAtSale ?? 0) * (item.qty || 0);
        map[key].qty += item.qty || 0;
        map[key].revenue += lineRev;
        map[key].cogs += lineCOGS;
      });
    });
    return Object.values(map)
      .map(p => ({ ...p, grossProfit: p.revenue - p.cogs, margin: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales]);

  // ABC classification: A = top 70% revenue, B = next 20%, C = bottom 10%
  const abcData = useMemo(() => {
    if (productProfitability.length === 0) return { A: [], B: [], C: [] };
    const totalRev = productProfitability.reduce((s, p) => s + p.revenue, 0);
    let cum = 0;
    const result = { A: [], B: [], C: [] };
    productProfitability.forEach(p => {
      cum += p.revenue;
      const cumPct = totalRev > 0 ? (cum / totalRev) * 100 : 100;
      if (cumPct <= 70) result.A.push(p);
      else if (cumPct <= 90) result.B.push(p);
      else result.C.push(p);
    });
    return result;
  }, [productProfitability]);

  // Dead stock: variants with on-hand stock but no sale recorded in stockLedger within N days
  const deadStock = useMemo(() => {
    if (!variants || !products || !stockLedger) return [];
    const lastSale = {};
    stockLedger.forEach(e => {
      if (e.type === 'sale' && e.variantId != null) {
        if (!lastSale[e.variantId] || e.date > lastSale[e.variantId]) {
          lastSale[e.variantId] = e.date;
        }
      }
    });
    const prodMap = Object.fromEntries((products || []).map(p => [p.id, p]));
    return (variants || [])
      .filter(v => (v.stockQty || 0) > 0)
      .map(v => {
        const prod = prodMap[v.productId];
        const last = lastSale[v.id] || null;
        const daysSinceSale = last ? daysDiff(last) : null;
        return {
          ...v,
          productName: prod?.name || '—',
          lastSaleDate: last,
          daysSinceSale,
          stockValue: (v.stockQty || 0) * (v.averageCost || v.purchasePrice || 0),
        };
      })
      .filter(v => v.daysSinceSale === null || v.daysSinceSale >= deadStockDays)
      .sort((a, b) => {
        if (a.daysSinceSale === null && b.daysSinceSale === null) return 0;
        if (a.daysSinceSale === null) return -1;
        if (b.daysSinceSale === null) return 1;
        return b.daysSinceSale - a.daysSinceSale;
      });
  }, [variants, products, stockLedger, deadStockDays]);

  // Daybook: all money movements chronologically
  const daybookEntries = useMemo(() => {
    const entries = [];

    filteredSales.forEach(inv => {
      const party = parties?.find(p => p.id === inv.partyId);
      entries.push({
        date: inv.date,
        type: 'Sale',
        ref: inv.invoiceNumber || `INV-${inv.id}`,
        party: party?.name || '—',
        debit: inv.total || 0,
        credit: 0,
        note: `${inv.lineItems?.length || 0} item(s)`,
        status: inv.status,
      });
    });

    filteredPurchases.forEach(inv => {
      const party = parties?.find(p => p.id === inv.partyId);
      entries.push({
        date: inv.date,
        type: 'Purchase',
        ref: inv.invoiceNumber || `PUR-${inv.id}`,
        party: party?.name || '—',
        debit: 0,
        credit: inv.total || 0,
        note: `${inv.lineItems?.length || 0} item(s)`,
        status: inv.status,
      });
    });

    filteredExpenses.forEach(exp => {
      entries.push({
        date: exp.date,
        type: 'Expense',
        ref: exp.category || 'Expense',
        party: exp.vendor || '—',
        debit: 0,
        credit: exp.amount || 0,
        note: exp.description || '',
        status: 'Paid',
      });
    });

    filteredTransactions.forEach(txn => {
      const party = parties?.find(p => p.id === txn.partyId);
      entries.push({
        date: txn.date,
        type: txn.type === 'receipt' ? 'Receipt' : 'Payment',
        ref: txn.reference || `TXN-${txn.id}`,
        party: party?.name || txn.partyName || '—',
        debit: txn.type === 'receipt' ? txn.amount || 0 : 0,
        credit: txn.type === 'payment' ? txn.amount || 0 : 0,
        note: txn.method || txn.notes || '',
        status: 'Done',
      });
    });

    return entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredSales, filteredPurchases, filteredExpenses, filteredTransactions, parties]);

  const exportGSTReport = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('GST REPORT', 14, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 196, 12, { align: 'right' });

    let y = 26;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('OUTWARD SUPPLIES (Sales)', 14, y);
    y += 4;

    const salesMonths = groupByMonth(filteredSales);
    autoTable(doc, {
      startY: y,
      head: [['Month', 'Invoices', 'Taxable Amount', 'CGST', 'SGST', 'Total Tax']],
      body: salesMonths.map(([mo, d]) => [
        monthLabel(mo + '-01'), d.count,
        d.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (d.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (d.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        d.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]),
      foot: [['Total', filteredSales.length,
        filteredSales.reduce((s, i) => s + (i.subtotal || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (totalGSTCollected / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (totalGSTCollected / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        totalGSTCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]],
      headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
      footStyles: { fillColor: [240, 240, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    const y2 = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('INWARD SUPPLIES (Purchases / ITC)', 14, y2);

    const purchMonths = groupByMonth(filteredPurchases);
    autoTable(doc, {
      startY: y2 + 4,
      head: [['Month', 'Bills', 'Taxable Amount', 'CGST (ITC)', 'SGST (ITC)', 'Total ITC']],
      body: purchMonths.map(([mo, d]) => [
        monthLabel(mo + '-01'), d.count,
        d.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (d.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (d.tax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        d.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]),
      foot: [['Total', filteredPurchases.length,
        filteredPurchases.reduce((s, i) => s + (i.subtotal || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (totalGSTPaid / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        (totalGSTPaid / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        totalGSTPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]],
      headStyles: { fillColor: [5, 150, 105], fontSize: 8 },
      footStyles: { fillColor: [240, 255, 240], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    const y3 = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Net GST Liability: ${fmtINR(netGSTLiability)} (${netGSTLiability >= 0 ? 'Payable to Govt' : 'Credit Available'})`, 14, y3);

    if (hsnSummary.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('HSN-wise Summary (Sales)', 14, y3 + 8);
      autoTable(doc, {
        startY: y3 + 12,
        head: [['HSN/SAC', 'Description', 'Qty', 'Taxable Amt', 'CGST', 'SGST', 'Total']],
        body: hsnSummary.map(h => [
          h.hsn, h.desc, h.qty,
          h.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          h.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          h.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          h.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })
        ]),
        headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
        margin: { left: 14, right: 14 }
      });
    }

    doc.save(`gst-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportPLReport = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFIT & LOSS STATEMENT', 14, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 196, 12, { align: 'right' });

    const rows = [
      ['Revenue (Sales, ex-GST)', '', fmtINR(totalRevenue)],
      ['  No. of Invoices', filteredSales.length.toString(), ''],
      ['Less: Sales Returns (CN)', '', `(${fmtINR(totalSalesReturns)})`],
      ['Net Revenue', '', fmtINR(netRevenue)],
      ['', '', ''],
      ['Cost of Purchases (ex-GST)', '', `(${fmtINR(totalPurchases)})`],
      ['  No. of Bills', filteredPurchases.length.toString(), ''],
      ['Less: Purchase Returns (DN)', '', fmtINR(totalPurchaseReturns)],
      ['', '', ''],
      ['Gross Profit', '', fmtINR(grossProfit)],
      ['Gross Margin', `${netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : 0}%`, ''],
      ...(trueCOGS > 0 ? [
        ['Gross Profit (COGS Method)', '', fmtINR(grossProfitByCOGS)],
        ['  COGS from cost snapshots', fmtINR(trueCOGS), ''],
      ] : []),
      ['', '', ''],
      ['Operating Expenses', '', `(${fmtINR(totalExpenses)})`],
      ['  No. of Expense Records', filteredExpenses.length.toString(), ''],
      ['', '', ''],
      ['Net Profit / (Loss)', '', fmtINR(netProfit)],
      ['Net Margin', `${netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : 0}%`, ''],
      ['', '', ''],
      ['GST Position', '', ''],
      ['Output Tax (Collected)', '', fmtINR(totalGSTCollected)],
      ['Input Tax Credit (ITC)', '', `(${fmtINR(totalGSTPaid)})`],
      ['Net GST Liability', '', fmtINR(netGSTLiability)],
    ];

    autoTable(doc, {
      startY: 26,
      head: [['Description', 'Details', 'Amount (₹)']],
      body: rows,
      headStyles: { fillColor: [79, 70, 229], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    doc.save(`pl-statement-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportGSTR1JSON = async () => {
    try {
      const company = await getCompany() ?? {};
      const companyGstin = company?.gstin || '';
      const companyStateCode = companyGstin?.slice(0, 2) || '00';

      // Determine filing period from filtered data or current month
      const refDate = dateFrom ? new Date(dateFrom) : new Date();
      const fp = String(refDate.getMonth() + 1).padStart(2, '0') + refDate.getFullYear();

      const b2bMap = {};
      const b2csList = [];

      filteredSales.forEach(inv => {
        const party = parties?.find(p => p.id === inv.partyId);
        const buyerGstin = party?.gstin?.trim();
        const isIGST = inv.taxType === 'IGST';
        const pos = isIGST ? (buyerGstin?.slice(0, 2) || '00') : companyStateCode;

        const itms = (inv.lineItems || []).map((item, idx) => {
          const rate = item.rate || item.basePrice || 0;
          const itemDiscPct = item.itemDiscountPct || 0;
          const invDiscPct = inv.discountPct || 0;
          const gross = rate * (item.qty || 1);
          const afterItemDisc = gross * (1 - itemDiscPct / 100);
          const txval = Math.round(afterItemDisc * (1 - invDiscPct / 100) * 100) / 100;
          const gstRate = item.gstRate || 0;
          const totalTax = Math.round(txval * gstRate / 100 * 100) / 100;
          return {
            num: idx + 1,
            itm_det: {
              txval,
              rt: gstRate,
              iamt: isIGST ? totalTax : 0,
              camt: isIGST ? 0 : Math.round(totalTax / 2 * 100) / 100,
              samt: isIGST ? 0 : Math.round(totalTax / 2 * 100) / 100,
              csamt: 0,
            },
          };
        });

        const invDate = new Date(inv.date);
        const idt = `${String(invDate.getDate()).padStart(2, '0')}-${String(invDate.getMonth() + 1).padStart(2, '0')}-${invDate.getFullYear()}`;

        if (buyerGstin && buyerGstin.length >= 15) {
          if (!b2bMap[buyerGstin]) b2bMap[buyerGstin] = { ctin: buyerGstin, inv: [] };
          b2bMap[buyerGstin].inv.push({
            inum: inv.invoiceNumber || inv.id,
            idt,
            val: Math.round((inv.total || 0) * 100) / 100,
            pos,
            rchrg: 'N',
            inv_typ: 'R',
            itms,
          });
        } else {
          const splyTp = isIGST ? 'INTER' : 'INTRA';
          const gstRate = inv.lineItems?.[0]?.gstRate || 0;
          const subtotal = inv.subtotal || 0;
          const taxAmt = inv.taxAmount || 0;
          b2csList.push({
            sply_tp: splyTp,
            pos,
            typ: 'OE',
            rt: gstRate,
            txval: Math.round(subtotal * 100) / 100,
            iamt: isIGST ? Math.round(taxAmt * 100) / 100 : 0,
            camt: isIGST ? 0 : Math.round(taxAmt / 2 * 100) / 100,
            samt: isIGST ? 0 : Math.round(taxAmt / 2 * 100) / 100,
            csamt: 0,
          });
        }
      });

      const hsnData = hsnSummary.map((h, idx) => ({
        num: idx + 1,
        hsn_sc: h.hsn,
        desc: h.desc,
        uqc: 'NOS',
        qty: Math.round(h.qty * 100) / 100,
        val: Math.round(h.total * 100) / 100,
        txval: Math.round(h.taxable * 100) / 100,
        iamt: Math.round(h.igst * 100) / 100,
        camt: Math.round(h.cgst * 100) / 100,
        samt: Math.round(h.sgst * 100) / 100,
        csamt: 0,
      }));

      const gstr1 = {
        gstin: companyGstin,
        fp,
        b2b: Object.values(b2bMap),
        b2cs: b2csList,
        hsn: { data: hsnData },
        _meta: { generated: new Date().toISOString(), app: 'NEXAURA v1.0' },
      };

      downloadJSON(gstr1, `GSTR1-${fp}-${companyGstin || 'export'}.json`);
      toast('GSTR-1 JSON exported successfully', 'success');
    } catch (err) {
      toast('Failed to export GSTR-1: ' + err.message, 'error');
    }
  };

  const exportGSTR3BJSON = async () => {
    try {
      const company = await getCompany() ?? {};
      const companyGstin = company?.gstin || '';
      const refDate = dateFrom ? new Date(dateFrom) : new Date();
      const retPeriod = String(refDate.getMonth() + 1).padStart(2, '0') + refDate.getFullYear();

      const outIGST = filteredSales.filter(i => i.taxType === 'IGST').reduce((s, i) => s + (i.taxAmount || 0), 0);
      const outCGST = filteredSales.filter(i => i.taxType !== 'IGST').reduce((s, i) => s + (i.taxAmount || 0) / 2, 0);
      const outSGST = outCGST;
      const outTaxable = filteredSales.reduce((s, i) => s + (i.subtotal || 0), 0);

      const itcIGST = filteredPurchases.filter(i => i.taxType === 'IGST').reduce((s, i) => s + (i.taxAmount || 0), 0);
      const itcCGST = filteredPurchases.filter(i => i.taxType !== 'IGST').reduce((s, i) => s + (i.taxAmount || 0) / 2, 0);
      const itcSGST = itcCGST;

      const r = (n) => Math.round((n || 0) * 100) / 100;

      const gstr3b = {
        gstin: companyGstin,
        ret_period: retPeriod,
        sup_details: {
          osup_det: {
            txval: r(outTaxable),
            iamt: r(outIGST),
            camt: r(outCGST),
            samt: r(outSGST),
            csamt: 0,
          },
          osup_zero: { txval: 0, iamt: 0, csamt: 0 },
          osup_nil_exmp: { txval: 0 },
          isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
          osup_nongst: { txval: 0 },
        },
        inter_sup: { unreg_details: [], comp_details: [], uin_details: [] },
        itc_elg: {
          itc_avl: [
            { ty: 'IMPG', iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { ty: 'IMPS', iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { ty: 'ISRC', iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { ty: 'ISD', iamt: 0, camt: 0, samt: 0, csamt: 0 },
            { ty: 'OTH', iamt: r(itcIGST), camt: r(itcCGST), samt: r(itcSGST), csamt: 0 },
          ],
          itc_rev: [],
          itc_net: [{ ty: 'OTH', iamt: r(itcIGST), camt: r(itcCGST), samt: r(itcSGST), csamt: 0 }],
          itc_inelg: [],
        },
        intr_ltfee: {
          intr_details: { ty: '01', intr: 0 },
          ltfee_details: { ty: '02', ltfee: 0 },
        },
        _meta: {
          generated: new Date().toISOString(),
          app: 'NEXAURA v1.0',
          outward_invoices: filteredSales.length,
          inward_bills: filteredPurchases.length,
          taxable_turnover: r(outTaxable),
          itc_claimed: r(itcIGST + itcCGST + itcSGST),
        },
      };

      downloadJSON(gstr3b, `GSTR3B-${retPeriod}-${companyGstin || 'export'}.json`);
      toast('GSTR-3B JSON exported successfully', 'success');
    } catch (err) {
      toast('Failed to export GSTR-3B: ' + err.message, 'error');
    }
  };

  const agingBucketColor = (bucket) => {
    const map = { '0-30': 'var(--success)', '31-60': 'var(--warning)', '61-90': '#F97316', '90+': 'var(--danger)' };
    return map[bucket] || 'var(--text-muted)';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Business Reports</h1>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard label="Total Revenue" value={fmtINR0(netRevenue)} sub={`Gross: ${fmtINR0(totalRevenue)} | Returns: -${fmtINR0(totalSalesReturns)}`} color="var(--primary)" icon={TrendingUp} />
            <StatCard label="Total Purchases" value={fmtINR0(netPurchases)} sub={`Gross: ${fmtINR0(totalPurchases)} | Returns: -${fmtINR0(totalPurchaseReturns)}`} color="var(--warning)" icon={TrendingDown} />
            <StatCard label="Total Expenses" value={fmtINR0(totalExpenses)} sub={`${filteredExpenses.length} records · Recurring: ${fmtINR0(recurringExpenses)}`} color="var(--danger)" icon={TrendingDown} />
            <StatCard label="Gross Profit" value={fmtINR0(grossProfit)} sub={netRevenue > 0 ? `${((grossProfit / netRevenue) * 100).toFixed(1)}% margin` : '—'} color={grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'} icon={TrendingUp} />
            <StatCard label="Net Profit" value={fmtINR0(netProfit)} sub={netRevenue > 0 ? `${((netProfit / netRevenue) * 100).toFixed(1)}% margin` : '—'} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} icon={IndianRupee} />
            <StatCard label="GST Collected (Net)" value={fmtINR0(netGSTCollected)} sub={`Gross: ${fmtINR0(totalGSTCollected)}`} color="#8B5CF6" icon={FileText} />
            <StatCard label="ITC (Net Paid)" value={fmtINR0(netGSTPaid)} sub={`Gross: ${fmtINR0(totalGSTPaid)}`} color="#06B6D4" icon={FileText} />
            <StatCard label="Net GST Liability" value={fmtINR0(netGSTLiability)} sub={netGSTLiability >= 0 ? 'Payable' : 'Credit'} color={netGSTLiability >= 0 ? 'var(--danger)' : 'var(--success)'} icon={AlertTriangle} />
          </div>

          {/* WhatsApp Owner Sharing Panel */}
          <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center', borderColor: 'rgba(79,70,229,0.3)', background: 'rgba(79,70,229,0.02)' }}>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Send Report to Owner</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Share a formatted financial summary of this period ({dateFrom || 'Start'} to {dateTo || 'Today'}) directly via WhatsApp.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="tel"
                className="form-input"
                style={{ width: '180px', padding: '0.375rem 0.625rem', fontSize: '0.85rem' }}
                placeholder="Owner phone (e.g. 9876543210)"
                defaultValue={localStorage.getItem('lekhya_owner_phone') || ''}
                onChange={e => localStorage.setItem('lekhya_owner_phone', e.target.value)}
                id="owner-phone-input"
              />
              <button
                className="btn btn-primary"
                style={{ padding: '0.375rem 0.875rem', fontSize: '0.85rem' }}
                onClick={() => {
                  const phoneNum = document.getElementById('owner-phone-input')?.value || '';
                  if (!phoneNum) {
                    toast('Please enter owner\'s phone number', 'warning');
                    return;
                  }
                  
                  let formattedPhone = phoneNum.replace(/\D/g, '');
                  if (formattedPhone.length === 10) {
                    formattedPhone = '91' + formattedPhone;
                  }

                  const periodStr = `${dateFrom ? dateFrom : 'Start'} to ${dateTo ? dateTo : 'Today'}`;
                  const pad = (str, len) => String(str).padEnd(len, ' ');
                  const rpad = (str, len) => String(str).padStart(len, ' ');
                  const divider = '─'.repeat(38);
                  const msg = `*NEXAURA — Business Summary* 📊\nPeriod: ${periodStr}\n\n\`\`\`\n${divider}\n FINANCIALS SUMMARY\n${divider}\n${pad('Description', 20)} ${rpad('Amount', 17)}\n${divider}\n${pad('Total Revenue', 20)} ${rpad(fmtINR(totalRevenue), 17)}\n${pad('Sales Returns', 20)} ${rpad('-' + fmtINR(totalSalesReturns), 17)}\n${pad('Net Revenue', 20)} ${rpad(fmtINR(netRevenue), 17)}\n${pad('Cost of Purchases', 20)} ${rpad('-' + fmtINR(totalPurchases), 17)}\n${pad('Operating Expenses', 20)} ${rpad('-' + fmtINR(totalExpenses), 17)}\n${divider}\n${pad('Net Profit', 20)} ${rpad(fmtINR(netProfit), 17)}\n${divider}\n\n GST POSITION\n${divider}\n${pad('Output GST (Collected)', 20)} ${rpad(fmtINR(totalGSTCollected), 17)}\n${pad('Input GST / ITC', 20)} ${rpad('-' + fmtINR(totalGSTPaid), 17)}\n${divider}\n${pad('Net GST Liability', 20)} ${rpad(fmtINR(netGSTLiability), 17)}\n${divider}\n\`\`\`\n_Generated: ${new Date().toLocaleString('en-IN')}_`;
                  
                  window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`, '_blank');
                }}
              >
                Send Summary
              </button>
            </div>
          </div>

          {/* Monthly trend */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Monthly Sales Trend</h2>
            {monthlyData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data for selected period.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Month</th><th>Invoices</th><th style={{ textAlign: 'right' }}>Taxable Amount</th><th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Total Revenue</th></tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(([mo, d]) => (
                      <tr key={mo}>
                        <td style={{ fontWeight: 500 }}>{monthLabel(mo + '-01')}</td>
                        <td>{d.count}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.taxable)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtINR(d.tax)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{fmtINR(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── GST REPORT ── */}
      {tab === 'gst' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={exportGSTR1JSON} disabled={filteredSales.length === 0}>
              <Download size={15} /> GSTR-1 JSON
            </button>
            <button className="btn btn-secondary" onClick={exportGSTR3BJSON} disabled={filteredSales.length === 0 && filteredPurchases.length === 0}>
              <Download size={15} /> GSTR-3B JSON
            </button>
            <button className="btn btn-primary" onClick={exportGSTReport} disabled={filteredSales.length === 0 && filteredPurchases.length === 0}>
              <Download size={15} /> GST Report PDF
            </button>
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard label="Output Tax (Collected)" value={fmtINR0(totalGSTCollected)} sub={`CGST: ${fmtINR0(totalGSTCollected / 2)} | SGST: ${fmtINR0(totalGSTCollected / 2)}`} color="var(--danger)" />
            <StatCard label="Input Tax Credit (ITC)" value={fmtINR0(totalGSTPaid)} sub={`CGST: ${fmtINR0(totalGSTPaid / 2)} | SGST: ${fmtINR0(totalGSTPaid / 2)}`} color="var(--success)" />
            <StatCard label="Net GST Liability" value={fmtINR0(netGSTLiability)} sub={netGSTLiability >= 0 ? 'Payable to Government' : 'Input Credit Available'} color={netGSTLiability >= 0 ? 'var(--warning)' : 'var(--success)'} />
          </div>

          {/* Outward Supplies */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--danger)' }}>Outward Supplies (Sales) — GSTR-1</h2>
            {monthlyData.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sales data.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Month</th><th>Invoices</th><th style={{ textAlign: 'right' }}>Taxable Amount</th><th style={{ textAlign: 'right' }}>CGST</th><th style={{ textAlign: 'right' }}>SGST</th><th style={{ textAlign: 'right' }}>Total Tax</th></tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(([mo, d]) => (
                      <tr key={mo}>
                        <td style={{ fontWeight: 500 }}>{monthLabel(mo + '-01')}</td>
                        <td>{d.count}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.taxable)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.tax / 2)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.tax / 2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>{fmtINR(d.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700 }}>Total</td>
                      <td>{filteredSales.length}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(filteredSales.reduce((s, i) => s + (i.subtotal || 0), 0))}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(totalGSTCollected / 2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(totalGSTCollected / 2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{fmtINR(totalGSTCollected)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Inward Supplies */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--success)' }}>Inward Supplies (Purchases / ITC) — GSTR-2</h2>
            {monthlyPurchases.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No purchase data.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Month</th><th>Bills</th><th style={{ textAlign: 'right' }}>Taxable Amount</th><th style={{ textAlign: 'right' }}>CGST (ITC)</th><th style={{ textAlign: 'right' }}>SGST (ITC)</th><th style={{ textAlign: 'right' }}>Total ITC</th></tr>
                  </thead>
                  <tbody>
                    {monthlyPurchases.map(([mo, d]) => (
                      <tr key={mo}>
                        <td style={{ fontWeight: 500 }}>{monthLabel(mo + '-01')}</td>
                        <td>{d.count}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.taxable)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.tax / 2)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(d.tax / 2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmtINR(d.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700 }}>Total</td>
                      <td>{filteredPurchases.length}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(filteredPurchases.reduce((s, i) => s + (i.subtotal || 0), 0))}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(totalGSTPaid / 2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtINR(totalGSTPaid / 2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmtINR(totalGSTPaid)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* HSN Summary */}
          {hsnSummary.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>HSN-wise Summary (Sales)</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>HSN/SAC</th><th>Item Description</th><th>Qty</th>
                      <th style={{ textAlign: 'right' }}>Taxable Amt</th>
                      <th style={{ textAlign: 'right' }}>IGST</th>
                      <th style={{ textAlign: 'right' }}>CGST</th>
                      <th style={{ textAlign: 'right' }}>SGST</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hsnSummary.map(h => (
                      <tr key={h.hsn}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.hsn}</td>
                        <td>{h.desc}</td>
                        <td>{h.qty}</td>
                        <td style={{ textAlign: 'right' }}>{fmtINR(h.taxable)}</td>
                        <td style={{ textAlign: 'right', color: h.igst > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{h.igst > 0 ? fmtINR(h.igst) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{h.cgst > 0 ? fmtINR(h.cgst) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{h.sgst > 0 ? fmtINR(h.sgst) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtINR(h.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── AGING ANALYSIS ── */}
      {tab === 'aging' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Receivables */}
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--primary)' }}>Receivables Aging (Money Owed to You)</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  {Object.entries(receivablesAging).map(([bucket, invs]) => (
                    <div key={bucket} style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: 8, border: `2px solid ${agingBucketColor(bucket)}20` }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{bucket} days</div>
                      <div style={{ fontWeight: 700, color: agingBucketColor(bucket), fontSize: '0.95rem' }}>{fmtINR0(invs.reduce((s, i) => s + (i.total || 0), 0))}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{invs.length} inv.</div>
                    </div>
                  ))}
                </div>
              </div>
              {Object.entries(receivablesAging).map(([bucket, invs]) => invs.length > 0 && (
                <div key={bucket} className="card">
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: agingBucketColor(bucket) }}>
                    {bucket} days overdue ({invs.length})
                  </h3>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                      <tbody>
                        {invs.map(inv => (
                          <tr key={inv.id}>
                            <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                            <td style={{ fontSize: '0.8rem' }}>{parties?.find(p => p.id === inv.partyId)?.name || '—'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtDate(inv.date)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: agingBucketColor(bucket) }}>{fmtINR(inv.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Payables */}
            <div>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--warning)' }}>Payables Aging (Money You Owe)</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  {Object.entries(payablesAging).map(([bucket, invs]) => (
                    <div key={bucket} style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: 8, border: `2px solid ${agingBucketColor(bucket)}20` }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{bucket} days</div>
                      <div style={{ fontWeight: 700, color: agingBucketColor(bucket), fontSize: '0.95rem' }}>{fmtINR0(invs.reduce((s, i) => s + (i.total || 0), 0))}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{invs.length} bills</div>
                    </div>
                  ))}
                </div>
              </div>
              {Object.entries(payablesAging).map(([bucket, invs]) => invs.length > 0 && (
                <div key={bucket} className="card">
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: agingBucketColor(bucket) }}>
                    {bucket} days overdue ({invs.length})
                  </h3>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Bill</th><th>Vendor</th><th>Date</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                      <tbody>
                        {invs.map(inv => (
                          <tr key={inv.id}>
                            <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                            <td style={{ fontSize: '0.8rem' }}>{parties?.find(p => p.id === inv.partyId)?.name || '—'}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtDate(inv.date)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: agingBucketColor(bucket) }}>{fmtINR(inv.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── SALES REPORT ── */}
      {tab === 'sales' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="card">
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Monthly Sales</h2>
              {monthlyData.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data.</p>
              ) : (() => {
                const maxTotal = Math.max(...monthlyData.map(([, d]) => d.total), 1);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {monthlyData.map(([mo, d]) => {
                      const pct = (d.total / maxTotal) * 100;
                      return (
                        <div key={mo}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
                            <span style={{ fontWeight: 500 }}>{monthLabel(mo + '-01')}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtINR(d.total)} ({d.count} inv.)</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Top Customers by Revenue</h2>
              {topCustomers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data.</p>
              ) : (() => {
                const maxAmt = Math.max(...topCustomers.map(c => c.amt), 1);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {topCustomers.map(({ party, amt }, i) => {
                      const pct = (amt / maxAmt) * 100;
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
                            <span style={{ fontWeight: 500 }}>{party?.name || 'Unknown'}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtINR(amt)}</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: '#10B981', borderRadius: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── DAYBOOK ── */}
      {tab === 'daybook' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Daybook — All Transactions</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{daybookEntries.length} entries</div>
            </div>
            {daybookEntries.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No transactions in selected period.</p>
            ) : (() => {
              let runningBalance = 0;
              const rows = [...daybookEntries].reverse().map((e, i) => {
                runningBalance += e.debit - e.credit;
                return { ...e, balance: runningBalance, idx: i };
              }).reverse();

              const totalDebit = daybookEntries.reduce((s, e) => s + e.debit, 0);
              const totalCredit = daybookEntries.reduce((s, e) => s + e.credit, 0);

              const typeColor = {
                Sale: 'var(--primary)', Purchase: 'var(--warning)',
                Expense: 'var(--danger)', Receipt: 'var(--success)', Payment: '#F97316',
              };

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                    <StatCard label="Total In (Debits)" value={fmtINR0(totalDebit)} color="var(--success)" icon={TrendingUp} />
                    <StatCard label="Total Out (Credits)" value={fmtINR0(totalCredit)} color="var(--danger)" icon={TrendingDown} />
                    <StatCard label="Net Position" value={fmtINR0(totalDebit - totalCredit)} color={totalDebit >= totalCredit ? 'var(--success)' : 'var(--danger)'} icon={IndianRupee} />
                  </div>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th><th>Type</th><th>Reference</th><th>Party</th><th>Note</th>
                          <th style={{ textAlign: 'right' }}>Debit (In)</th>
                          <th style={{ textAlign: 'right' }}>Credit (Out)</th>
                          <th style={{ textAlign: 'right' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                            <td>
                              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: (typeColor[e.type] || 'var(--text-muted)') + '18', color: typeColor[e.type] || 'var(--text-muted)', fontWeight: 600 }}>
                                {e.type}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>{e.ref}</td>
                            <td style={{ fontSize: '0.8rem' }}>{e.party}</td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note}</td>
                            <td style={{ textAlign: 'right', fontWeight: 500, color: e.debit > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                              {e.debit > 0 ? fmtINR(e.debit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500, color: e.credit > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                              {e.credit > 0 ? fmtINR(e.credit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: e.balance >= 0 ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                              {fmtINR(Math.abs(e.balance))}{e.balance < 0 ? ' Cr' : ' Dr'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid var(--border)' }}>
                          <td colSpan={5} style={{ fontWeight: 700 }}>Total</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmtINR(totalDebit)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{fmtINR(totalCredit)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: totalDebit >= totalCredit ? 'var(--success)' : 'var(--danger)' }}>
                            {fmtINR(Math.abs(totalDebit - totalCredit))}{totalDebit < totalCredit ? ' Cr' : ' Dr'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* ── P&L STATEMENT ── */}
      {tab === 'pl' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={exportPLReport}>
              <Download size={15} /> Export P&L PDF
            </button>
          </div>

          <div style={{ maxWidth: 600 }}>
            <div className="card">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '2px solid var(--border)' }}>
                Profit & Loss Statement
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { label: 'Revenue (Sales, ex-GST)', value: totalRevenue, sub: `${filteredSales.length} invoices`, bold: false, color: 'var(--primary)', indent: 0 },
                  { label: 'Less: Sales Returns (CN)', value: -totalSalesReturns, sub: `${filteredSalesReturns.length} credit notes`, bold: false, color: 'var(--danger)', indent: 1 },
                  { label: 'Net Revenue', value: netRevenue, sub: '', bold: true, color: 'var(--primary)', indent: 0, sep: true },
                  { label: 'Cost of Purchases (ex-GST)', value: -totalPurchases, sub: `${filteredPurchases.length} bills`, bold: false, color: 'var(--warning)', indent: 0 },
                  { label: 'Less: Purchase Returns (DN)', value: totalPurchaseReturns, sub: `${filteredPurchaseReturns.length} debit notes`, bold: false, color: 'var(--success)', indent: 1 },
                  { label: 'Gross Profit', value: grossProfit, sub: netRevenue > 0 ? `${((grossProfit / netRevenue) * 100).toFixed(1)}% margin` : '', bold: true, color: grossProfit >= 0 ? 'var(--success)' : 'var(--danger)', indent: 0, sep: true },
                  ...(trueCOGS > 0 ? [{ label: 'Gross Profit (COGS Method)', value: grossProfitByCOGS, sub: `COGS from cost snapshots: ${fmtINR(trueCOGS)}`, bold: false, color: grossProfitByCOGS >= 0 ? 'var(--success)' : 'var(--danger)', indent: 1 }] : []),
                  { label: 'Operating Expenses', value: -totalExpenses, sub: `${filteredExpenses.length} records`, bold: false, color: 'var(--danger)', indent: 0 },
                  { label: 'Net Profit / (Loss)', value: netProfit, sub: netRevenue > 0 ? `${((netProfit / netRevenue) * 100).toFixed(1)}% net margin` : '', bold: true, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)', indent: 0, sep: true },
                ].map((row, i) => (
                  <div key={i}>
                    {row.sep && <div style={{ height: 1, background: 'var(--border)', margin: '0.5rem 0' }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `0.5rem ${row.indent ? '1.5rem' : '0'}`, paddingRight: 0 }}>
                      <div>
                        <div style={{ fontWeight: row.bold ? 700 : 500, fontSize: row.bold ? '0.95rem' : '0.875rem', color: 'var(--text-main)' }}>{row.label}</div>
                        {row.sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.sub}</div>}
                      </div>
                      <div style={{ fontWeight: row.bold ? 700 : 500, fontSize: row.bold ? '1rem' : '0.875rem', color: row.color, whiteSpace: 'nowrap' }}>
                        {row.value < 0 ? `(${fmtINR(-row.value)})` : fmtINR(row.value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1rem', background: netProfit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 8, border: `1px solid ${netProfit >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span style={{ fontWeight: 700, fontSize: '1.25rem', color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtINR(Math.abs(netProfit))}</span>
                </div>
                {netRevenue > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Net Margin: {((netProfit / netRevenue) * 100).toFixed(2)}%
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(79,70,229,0.06)', borderRadius: 8, border: '1px solid rgba(79,70,229,0.15)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>GST Position</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>Output Tax: {fmtINR(totalGSTCollected)}</span>
                  <span>ITC Available: {fmtINR(totalGSTPaid)}</span>
                  <span style={{ fontWeight: 700 }}>Payable: {fmtINR(netGSTLiability)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INVENTORY REPORTS ── */}
      {tab === 'inventory' && (
        <>
          <DateFilters dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <StatCard
              label="Products Tracked"
              value={productProfitability.length}
              sub="with sales in selected period"
              icon={TrendingUp}
            />
            <StatCard
              label="Dead Stock Items"
              value={deadStock.length}
              sub={`No sale in ${deadStockDays}+ days`}
              color="var(--warning)"
              icon={AlertTriangle}
            />
            <StatCard
              label="Dead Stock Value"
              value={fmtINR0(deadStock.reduce((s, v) => s + v.stockValue, 0))}
              sub="at average cost"
              color="var(--danger)"
              icon={Package}
            />
          </div>

          {/* Product Profitability */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Product Profitability</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ABC: A = top 70% revenue · B = next 20% · C = bottom 10%</span>
            </div>
            {productProfitability.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No sales data for the selected period.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Product / Variant</th>
                      <th style={{ textAlign: 'center' }}>ABC</th>
                      <th style={{ textAlign: 'right' }}>Qty Sold</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                      <th style={{ textAlign: 'right' }}>COGS</th>
                      <th style={{ textAlign: 'right' }}>Gross Profit</th>
                      <th style={{ textAlign: 'right' }}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productProfitability.map((p, i) => {
                      const cls = abcData.A.includes(p) ? 'A' : abcData.B.includes(p) ? 'B' : 'C';
                      const clsColor = cls === 'A' ? 'var(--success)' : cls === 'B' ? 'var(--warning)' : 'var(--text-muted)';
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{p.name}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: clsColor, fontSize: '0.8rem' }}>{cls}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{p.qty}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{fmtINR0(p.revenue)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {p.cogs > 0 ? fmtINR0(p.cogs) : <span style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>no cost data</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: p.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {p.cogs > 0 ? fmtINR0(p.grossProfit) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.875rem', color: p.margin >= 20 ? 'var(--success)' : p.margin >= 0 ? 'var(--warning)' : 'var(--danger)' }}>
                            {p.cogs > 0 ? `${p.margin.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dead Stock */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Dead Stock</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                No sale in:
                {[30, 60, 90, 180].map(d => (
                  <button key={d}
                    className={`btn ${deadStockDays === d ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.25rem 0.625rem', fontSize: '0.78rem' }}
                    onClick={() => setDeadStockDays(d)}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {deadStock.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)', fontSize: '0.875rem' }}>
                No dead stock — all items with on-hand stock have been sold within {deadStockDays} days.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th style={{ textAlign: 'right' }}>Stock (packs)</th>
                      <th style={{ textAlign: 'right' }}>Stock Value</th>
                      <th style={{ textAlign: 'right' }}>Last Sale</th>
                      <th style={{ textAlign: 'right' }}>Days Idle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadStock.map((v, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{v.productName}</td>
                        <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{v.name || `${v.packSize} ${v.unit}`}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{(v.stockQty || 0).toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{fmtINR0(v.stockValue)}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          {v.lastSaleDate ? fmtDate(v.lastSaleDate) : <span style={{ color: 'var(--danger)', fontStyle: 'italic' }}>Never sold</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: v.daysSinceSale === null || v.daysSinceSale > 90 ? 'var(--danger)' : 'var(--warning)' }}>
                          {v.daysSinceSale === null ? '∞' : v.daysSinceSale}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ fontWeight: 700, fontSize: '0.85rem' }}>Total Dead Stock Value</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger)' }}>
                        {fmtINR0(deadStock.reduce((s, v) => s + v.stockValue, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
