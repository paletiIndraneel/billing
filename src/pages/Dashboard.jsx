import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { listInvoices } from '../api/invoices';
import { listProducts } from '../api/products';
import { listVariants } from '../api/variants';
import { listParties } from '../api/parties';
import { listExpenses } from '../api/expenses';
import { listRecentPriceHistory } from '../api/priceHistory';
import { listOrders } from '../api/orders';
import { IndianRupee, FileText, Package, AlertTriangle, TrendingUp, TrendingDown, Bell, Clock, ShoppingCart, Truck, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { useToast } from '../components/Toast';

function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isOverdue(inv) {
  if (inv.status !== 'Pending') return false;
  if (inv.dueDate) return new Date(inv.dueDate) < new Date();
  return daysSince(inv.date) > 30;
}

function greetingForHour(h) {
  if (h < 12) return { text: 'Good morning', Icon: Sunrise };
  if (h < 17) return { text: 'Good afternoon', Icon: Sun };
  if (h < 20) return { text: 'Good evening', Icon: Sunset };
  return { text: 'Good night', Icon: Moon };
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getDateBounds(range, customFrom, customTo) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (range === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: today };
  }
  if (range === 'quarter') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3);
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (range === 'fy') {
    const fyStart = now.getMonth() >= 3
      ? new Date(now.getFullYear(), 3, 1)
      : new Date(now.getFullYear() - 1, 3, 1);
    return { from: fyStart.toISOString().slice(0, 10), to: today };
  }
  return { from: customFrom || '', to: customTo || today };
}

function inRange(dateStr, from, to) {
  const d = (dateStr || '').slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
      No data for this period
    </div>
  );
  const maxVal = Math.max(...data.flatMap(d => [d.sales, d.purchases]), 1);
  const H = 90;
  const n = data.length;
  const BW = n > 20 ? 6 : n > 12 ? 10 : 16;
  const GAP = n > 20 ? 1 : 3;
  const GG = n > 20 ? 6 : 14;
  const totalW = n * (2 * BW + GAP + GG) + 10;
  return (
    <svg width="100%" height={H + 30} viewBox={`0 0 ${totalW} ${H + 30}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible', display: 'block', maxHeight: H + 30 }}>
      <line x1={0} y1={H} x2={totalW} y2={H} stroke="var(--border)" strokeWidth={1} />
      {data.map((d, i) => {
        const gx = 5 + i * (2 * BW + GAP + GG);
        const sh = Math.max(2, (d.sales / maxVal) * H);
        const ph = Math.max(2, (d.purchases / maxVal) * H);
        return (
          <g key={d.key}>
            <rect x={gx} y={H - sh} width={BW} height={sh} fill="var(--primary)" rx={2} opacity={0.82} />
            <rect x={gx + BW + GAP} y={H - ph} width={BW} height={ph} fill="#f59e0b" rx={2} opacity={0.82} />
            <text x={gx + BW} y={H + 16} textAnchor="middle" fontSize={n > 20 ? 7 : 9} fill="var(--text-muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Live snapshot of current stock quantity per product (top N by available packs).
function StockInventoryChart({ items }) {
  if (!items || items.length === 0) return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
      No inventory yet
    </div>
  );
  const maxQty = Math.max(...items.map(i => i.qty), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {items.map(i => (
        <div key={i.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>{i.qty % 1 === 0 ? i.qty : i.qty.toFixed(1)} packs</span>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${Math.max(2, (i.qty / maxQty) * 100)}%`, background: i.low ? 'var(--warning)' : 'var(--primary)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'Last 3 Mo.' },
  { key: 'fy', label: 'This FY' },
  { key: 'custom', label: 'Custom' },
];

export default function Dashboard() {
  const invoices        = useTable(QK.invoices, listInvoices);   // listInvoices orders date desc
  const products        = useTable(QK.products, listProducts);
  const productVariants = useTable(QK.variants, listVariants);
  const recentPriceChanges = useTable([QK.priceHistory], () => listRecentPriceHistory(5));
  const orders = useTable(QK.orders, listOrders);
  const parties         = useTable(QK.parties, listParties);
  const expenses        = useTable(QK.expenses, listExpenses);
  const toast           = useToast();

  const [username, setUsername] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data?.user?.user_metadata?.username || data?.user?.email?.split('@')[0] || '');
    });
  }, []);

  const [dateRange, setDateRange] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]   = useState('');

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => getDateBounds(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo]
  );

  // Draft/Cancelled invoices are not real sales — exclude them from all revenue figures.
  const isCountedSale    = i => i.status !== 'Draft' && i.status !== 'Cancelled';
  const salesInvoices    = useMemo(() => (invoices || []).filter(i => (i.type === 'Sales' || !i.type) && isCountedSale(i)), [invoices]);
  const salesReturns     = useMemo(() => (invoices || []).filter(i => i.type === 'CreditNote'), [invoices]);
  const purchaseInvoices = useMemo(() => (invoices || []).filter(i => i.type === 'Purchase' && isCountedSale(i)), [invoices]);
  const purchaseReturns  = useMemo(() => (invoices || []).filter(i => i.type === 'DebitNote'), [invoices]);

  // ── Filtered by date range ──────────────────────────────────────────────────
  const filteredSales     = useMemo(() => salesInvoices.filter(i => inRange(i.date, rangeFrom, rangeTo)), [salesInvoices, rangeFrom, rangeTo]);
  const filteredPurchases = useMemo(() => purchaseInvoices.filter(i => inRange(i.date, rangeFrom, rangeTo)), [purchaseInvoices, rangeFrom, rangeTo]);
  const filteredReturns   = useMemo(() => salesReturns.filter(i => inRange(i.date, rangeFrom, rangeTo)), [salesReturns, rangeFrom, rangeTo]);
  const filteredExpenses  = useMemo(() => (expenses || []).filter(e => inRange(e.date, rangeFrom, rangeTo)), [expenses, rangeFrom, rangeTo]);

  const grossSales       = useMemo(() => filteredSales.reduce((s, i) => s + (i.total || 0), 0), [filteredSales]);
  const totalSalesReturn = useMemo(() => filteredReturns.reduce((s, i) => s + (i.total || 0), 0), [filteredReturns]);
  const netSales         = useMemo(() => grossSales - totalSalesReturn, [grossSales, totalSalesReturn]);
  const totalPurchases   = useMemo(() => filteredPurchases.reduce((s, i) => s + (i.total || 0), 0), [filteredPurchases]);
  const grossProfit      = useMemo(() => netSales - totalPurchases, [netSales, totalPurchases]);
  const totalExpenses    = useMemo(() => filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0), [filteredExpenses]);

  // ── All-time pending (receivables/payables are not date-filtered) ────────────
  const pendingSales     = useMemo(() => salesInvoices.filter(i => i.status === 'Pending'), [salesInvoices]);
  const totalReceivable  = useMemo(() => pendingSales.reduce((s, i) => s + (i.total || 0), 0), [pendingSales]);
  const pendingPurchases = useMemo(() => purchaseInvoices.filter(i => i.status === 'Pending'), [purchaseInvoices]);
  const totalPayable     = useMemo(() => pendingPurchases.reduce((s, i) => s + (i.total || 0), 0), [pendingPurchases]);

  // ── Trend chart — follows the active date range filter ──────────────────────
  // ≤31 days → daily bars; >31 days → monthly bars
  const trendData = useMemo(() => {
    const from = rangeFrom || (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 5);
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    })();
    const to = rangeTo || new Date().toISOString().slice(0, 10);
    const fromDate = new Date(from);
    const toDate   = new Date(to);
    const diffDays = Math.ceil((toDate - fromDate) / 86400000) + 1;

    if (diffDays <= 31) {
      const days = [];
      const cur = new Date(from);
      while (cur <= toDate) {
        const key = cur.toISOString().slice(0, 10);
        days.push({ key, label: `${cur.getDate()}/${cur.getMonth() + 1}`, sales: 0, purchases: 0 });
        cur.setDate(cur.getDate() + 1);
      }
      const map = Object.fromEntries(days.map(d => [d.key, d]));
      salesInvoices.forEach(inv    => { const k = (inv.date || '').slice(0, 10); if (map[k]) map[k].sales     += inv.total || 0; });
      purchaseInvoices.forEach(inv => { const k = (inv.date || '').slice(0, 10); if (map[k]) map[k].purchases += inv.total || 0; });
      return days;
    } else {
      const months = [];
      const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
      const end = new Date(toDate.getFullYear(),   toDate.getMonth(),   1);
      while (cur <= end && months.length < 24) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        months.push({ key, label: cur.toLocaleDateString('en-IN', { month: 'short' }), sales: 0, purchases: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
      const map = Object.fromEntries(months.map(m => [m.key, m]));
      salesInvoices.forEach(inv    => { const k = (inv.date || '').slice(0, 7); if (map[k]) map[k].sales     += inv.total || 0; });
      purchaseInvoices.forEach(inv => { const k = (inv.date || '').slice(0, 7); if (map[k]) map[k].purchases += inv.total || 0; });
      return months;
    }
  }, [salesInvoices, purchaseInvoices, rangeFrom, rangeTo]);

  const trendIsDaily = useMemo(() => {
    if (!rangeFrom || !rangeTo) return false;
    return Math.ceil((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1 <= 31;
  }, [rangeFrom, rangeTo]);

  // ── Inventory ───────────────────────────────────────────────────────────────
  const variantsWithName = useMemo(() => {
    if (!productVariants || !products) return [];
    return productVariants.map(v => {
      const prod = products.find(p => p.id === v.productId);
      const packSz = Number(v.packSize) > 0 ? Number(v.packSize) : 1;
      const isBulk = (prod?.inventoryMode || 'packed') === 'bulk';
      const masterStock = prod?.masterStock || 0;
      const availablePacks = isBulk ? masterStock / packSz : v.stockQty / packSz;
      return { ...v, productName: prod?.name || '', packSz, availablePacks, inventoryMode: isBulk ? 'bulk' : 'packed' };
    });
  }, [productVariants, products]);

  const { inventoryCostValue, inventoryRetailValue } = useMemo(() => {
    const seenBulk = new Set();
    return variantsWithName.reduce((acc, v) => {
      if (v.inventoryMode === 'bulk') {
        if (seenBulk.has(v.productId)) return acc;
        seenBulk.add(v.productId);
      }
      acc.inventoryCostValue  += (v.averageCost ?? v.purchasePrice ?? 0) * v.availablePacks;
      acc.inventoryRetailValue += v.sellingPrice * (1 + v.gstRate / 100) * v.availablePacks;
      return acc;
    }, { inventoryCostValue: 0, inventoryRetailValue: 0 });
  }, [variantsWithName]);

  const lowStockProducts = useMemo(() => variantsWithName.filter(v => v.availablePacks <= (v.reorderPoint ?? 10)), [variantsWithName]);
  const stockInventoryItems = useMemo(() => {
    return [...variantsWithName]
      .sort((a, b) => b.availablePacks - a.availablePacks)
      .slice(0, 8)
      .map(v => ({ id: v.id, name: v.productName || v.name, qty: v.availablePacks, low: v.availablePacks <= (v.reorderPoint ?? 10) }));
  }, [variantsWithName]);
  const shippingStats = useMemo(() => {
    const list = orders || [];
    return {
      inTransit: list.filter(o => o.status === 'Shipped').length,
      pendingDispatch: list.filter(o => ['Placed', 'Confirmed'].includes(o.status)).length,
      deliveredTotal: list.filter(o => o.status === 'Delivered').length,
    };
  }, [orders]);
  const overdueInvoices  = useMemo(() => salesInvoices.filter(isOverdue).sort((a, b) => daysSince(b.dueDate || b.date) - daysSince(a.dueDate || a.date)), [salesInvoices]);
  const overdueAmount    = useMemo(() => overdueInvoices.reduce((s, i) => s + (i.total || 0), 0), [overdueInvoices]);
  const recentInvoices   = useMemo(() => (invoices || []).slice(0, 6), [invoices]);

  const topDebtors = useMemo(() => {
    const map = {};
    pendingSales.forEach(inv => { map[inv.partyId] = (map[inv.partyId] || 0) + (inv.total || 0); });
    return Object.entries(map).map(([id, amount]) => ({ partyId: id, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [pendingSales]);

  const topCreditors = useMemo(() => {
    const map = {};
    pendingPurchases.forEach(inv => { map[inv.partyId] = (map[inv.partyId] || 0) + (inv.total || 0); });
    return Object.entries(map).map(([id, amount]) => ({ partyId: id, amount }))
      .sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [pendingPurchases]);

  const copyReminder = (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    const msg = `Dear ${party?.name || 'Customer'},\n\nThis is a gentle reminder that invoice ${inv.invoiceNumber} for ₹${(inv.total || 0).toLocaleString('en-IN')} (dated ${fmtDate(inv.date)}) is currently outstanding.\n\nKindly arrange payment at your earliest convenience.\n\nThank you for your business.`;
    navigator.clipboard.writeText(msg).then(() => toast('Reminder copied to clipboard!', 'success'));
  };

  const rangeLabel  = DATE_RANGES.find(r => r.key === dateRange)?.label || 'Period';
  const profitColor = grossProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div>
      {/* ── Header + Date Filter ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {(() => { const { text, Icon } = greetingForHour(new Date().getHours()); return <><Icon size={22} />{text}{username ? `, ${username}` : ''}</>; })()}
          </h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {DATE_RANGES.map(r => (
            <button key={r.key}
              className={`btn ${dateRange === r.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
              onClick={() => setDateRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {dateRange === 'custom' && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <input type="date" className="form-input" style={{ width: 160, fontSize: '0.85rem' }}
            value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" className="form-input" style={{ width: 160, fontSize: '0.85rem' }}
            value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))' }}>
        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Net Sales <span style={{ opacity: 0.7 }}>· {rangeLabel}</span></div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{fmtINR(netSales)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filteredSales.length} invoices · {fmtINR(totalSalesReturn)} returns</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(79,70,229,0.1)', color: 'var(--primary)' }}><TrendingUp size={22} /></div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Purchases <span style={{ opacity: 0.7 }}>· {rangeLabel}</span></div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{fmtINR(totalPurchases)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filteredPurchases.length} bills</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}><ShoppingCart size={22} /></div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Gross Profit <span style={{ opacity: 0.7 }}>· {rangeLabel}</span></div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem', color: profitColor }}>{fmtINR(grossProfit)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {netSales > 0 ? `${((grossProfit / netSales) * 100).toFixed(1)}% margin` : '—'}
            </div>
          </div>
          <div className="stat-icon" style={{ background: grossProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: profitColor }}><TrendingUp size={22} /></div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Receivables</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{fmtINR(totalReceivable)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pendingSales.length} pending</div>
          </div>
          <div className="stat-icon" style={{ background: pendingSales.length > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(0,0,0,0.04)', color: pendingSales.length > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Payables</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{fmtINR(totalPayable)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pendingPurchases.length} pending</div>
          </div>
          <div className="stat-icon" style={{ background: totalPayable > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.04)', color: totalPayable > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            <TrendingDown size={22} />
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Inventory (Cost)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{fmtINR(inventoryCostValue)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Retail {fmtINR(inventoryRetailValue)} · {productVariants?.length || 0} SKUs</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}><Package size={22} /></div>
        </div>

        <div className="stat-card">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Shipping</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.2rem' }}>{shippingStats.inTransit} in transit</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{shippingStats.pendingDispatch} pending dispatch · {shippingStats.deliveredTotal} delivered</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.1)', color: '#06B6D4' }}><Truck size={22} /></div>
        </div>
      </div>

      {/* ── Monthly Trend + Stock Inventory ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Sales vs Purchases <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>· {rangeLabel} · {trendIsDaily ? 'Daily' : 'Monthly'}</span></h2>
            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)', display: 'inline-block' }} /> Sales
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} /> Purchases
              </span>
            </div>
          </div>
          <TrendChart data={trendData} />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
            {trendData.map(m => (
              <div key={m.key} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', minWidth: 64, flexShrink: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ color: 'var(--primary)' }}>{fmtINR(m.sales)}</div>
                <div style={{ color: '#f59e0b' }}>{fmtINR(m.purchases)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.875rem' }}>
            Stock Inventory <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>· top {stockInventoryItems.length} by quantity</span>
          </h2>
          <StockInventoryChart items={stockInventoryItems} />
        </div>
      </div>

      {/* ── Recent Price Changes ── */}
      {recentPriceChanges.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.875rem' }}>Recent Price Changes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentPriceChanges.map(p => {
              const v = variantsWithName.find(x => x.id === p.variantId);
              const up = (p.newPrice || 0) >= (p.oldPrice || 0);
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: 6, background: 'var(--bg-subtle, rgba(0,0,0,0.02))', fontSize: '0.85rem' }}>
                  <span>{v?.productName || 'Unknown product'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {fmtINR(p.oldPrice)} → <strong style={{ color: up ? 'var(--success)' : 'var(--danger)' }}>{fmtINR(p.newPrice)}</strong>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>{fmtDate(p.changedAt)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Overdue Reminders ── */}
      {overdueInvoices.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem', marginBottom: 0, borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <Bell size={18} style={{ color: 'var(--danger)' }} />
            <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
              {overdueInvoices.length} Overdue Invoice{overdueInvoices.length > 1 ? 's' : ''} — {fmtINR(overdueAmount)} Pending
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {overdueInvoices.slice(0, 5).map(inv => {
              const party = parties?.find(p => p.id === inv.partyId);
              const daysOld = daysSince(inv.dueDate || inv.date);
              return (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', borderRadius: 6, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.invoiceNumber}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{party?.name || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 500 }}>
                      <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{daysOld}d overdue
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.9rem' }}>{fmtINR(inv.total)}</span>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => copyReminder(inv)}>
                      <Bell size={11} /> Remind
                    </button>
                  </div>
                </div>
              );
            })}
            {overdueInvoices.length > 5 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>+{overdueInvoices.length - 5} more — check Billing page</div>
            )}
          </div>
        </div>
      )}

      {/* ── Low Stock ── */}
      {lowStockProducts.length > 0 && (
        <div className="card" style={{ marginTop: '1rem', marginBottom: 0, borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
            <span style={{ fontWeight: 600, color: 'var(--warning)' }}>
              {lowStockProducts.length} Product{lowStockProducts.length > 1 ? 's' : ''} Low on Stock
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {lowStockProducts.slice(0, 10).map(v => (
              <div key={v.id} style={{ padding: '0.3rem 0.7rem', borderRadius: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 600 }}>{v.productName}</span>
                <span style={{ marginLeft: '0.375rem', color: v.availablePacks <= 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700 }}>
                  {v.availablePacks <= 0 ? 'OUT' : `${v.availablePacks.toFixed(1)} packs`}
                </span>
              </div>
            ))}
            {lowStockProducts.length > 10 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>+{lowStockProducts.length - 10} more</div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Sales Report Card */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Sales Report <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>· {rangeLabel}</span></h2>
              <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              {[
                { label: 'Gross Sales', value: grossSales, color: 'var(--primary)' },
                { label: 'Sales Returns', value: totalSalesReturn, color: 'var(--danger)' },
                { label: 'Net Sales', value: netSales, color: 'var(--success)' },
                { label: 'Expenses', value: totalExpenses, color: 'var(--warning)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '0.6rem 0.8rem', borderRadius: 6, background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: s.color }}>{fmtINR(s.value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Purchase Report Card */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Purchase Report <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>· {rangeLabel}</span></h2>
              <ShoppingCart size={16} style={{ color: 'var(--warning)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 6, background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Total Purchased</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--warning)' }}>{fmtINR(totalPurchases)}</div>
              </div>
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 6, background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Gross Profit</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: profitColor }}>{fmtINR(grossProfit)}</div>
              </div>
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 6, background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Bills Count</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{filteredPurchases.length}</div>
              </div>
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 6, background: 'var(--bg-color)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>Profit Margin</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: profitColor }}>
                  {netSales > 0 ? `${((grossProfit / netSales) * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Recent Activity</h2>
              <FileText size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            {recentInvoices.length === 0 ? (
              <div className="empty-state"><FileText size={40} className="empty-state-icon" /><p>No invoices yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recentInvoices.map(inv => {
                  const party = parties?.find(p => p.id === inv.partyId);
                  const isPurchase = inv.type === 'Purchase';
                  const isCN = inv.type === 'CreditNote';
                  return (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', borderRadius: 7, border: '1px solid var(--border)', gap: '1rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {inv.invoiceNumber || `INV-${inv.id}`}
                          <span className={`badge ${isPurchase ? 'badge-warning' : isCN ? 'badge-danger' : 'badge-primary'}`} style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>
                            {isPurchase ? 'Purchase' : isCN ? 'Return' : 'Sales'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {party?.name || 'Unknown'} · {new Date(inv.date).toLocaleDateString('en-IN')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                        <span className={`badge ${{ Paid: 'badge-success', Pending: 'badge-warning', Cancelled: 'badge-danger' }[inv.status] || 'badge-secondary'}`}>{inv.status}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{fmtINR(inv.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Debtors */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Top Debtors</h2>
              <TrendingUp size={16} style={{ color: 'var(--success)' }} />
            </div>
            {topDebtors.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '0.75rem 0' }}>No outstanding receivables.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {topDebtors.map(({ partyId, amount }) => {
                  const party = parties?.find(p => p.id === partyId);
                  return (
                    <div key={partyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderRadius: 6, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{party?.name || `#${partyId}`}</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>{fmtINR(amount)}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  Total: <strong style={{ color: 'var(--success)' }}>{fmtINR(totalReceivable)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Creditors */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Top Creditors</h2>
              <TrendingDown size={16} style={{ color: 'var(--danger)' }} />
            </div>
            {topCreditors.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '0.75rem 0' }}>No outstanding payables.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {topCreditors.map(({ partyId, amount }) => {
                  const party = parties?.find(p => p.id === partyId);
                  return (
                    <div key={partyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{party?.name || `#${partyId}`}</span>
                      <span style={{ fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>{fmtINR(amount)}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  Total: <strong style={{ color: 'var(--danger)' }}>{fmtINR(totalPayable)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Contacts + Inventory snapshot */}
          <div className="card" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.875rem' }}>Contacts</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{parties?.filter(p => p.type === 'Customer').length || 0}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Customers</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{parties?.filter(p => p.type === 'Vendor').length || 0}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Vendors</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.875rem' }}>Inventory</h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warning)' }}>{productVariants?.length || 0}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SKUs</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: lowStockProducts.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{lowStockProducts.length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Low Stock</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>{fmtINR(inventoryCostValue)}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cost Value</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
