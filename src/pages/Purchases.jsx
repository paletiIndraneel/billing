import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, getNextInvoiceNumber } from '../db/db';
import { adjustStock } from '../services/stockService';
import { Plus, Trash2, Eye, Download, Package, TrendingDown, BarChart2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function getStateCode(gstin) {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

function fmtPDF(n) {
  const neg = n < 0;
  const [i, d] = Math.abs(n || 0).toFixed(2).split('.');
  let result = i.length <= 3 ? i : (() => {
    let r = i.slice(-3), rem = i.slice(0, -3);
    while (rem.length > 2) { r = rem.slice(-2) + ',' + r; rem = rem.slice(0, -2); }
    return rem + ',' + r;
  })();
  return (neg ? '-' : '') + result + '.' + d;
}

async function buildPurchasePDF(invoice, vendor, lineItems, company) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 14, R = W - 14;
  const primary = [17, 24, 39];

  doc.setFillColor(...primary);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('PURCHASE ORDER', L, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('ORIGINAL COPY', R, 14, { align: 'right' });

  doc.setTextColor(30, 30, 30);
  let y = 30;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(company.name || 'Your Company', L, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  if (company.gstin) { doc.text(`GSTIN: ${company.gstin}`, L, y); y += 4.5; }
  if (company.address) { doc.text(company.address, L, y); y += 4.5; }
  if (company.phone) { doc.text(`Phone: ${company.phone}`, L, y); y += 4.5; }

  const mx = W / 2 + 10;
  let my = 30;
  doc.setTextColor(30, 30, 30);
  [
    ['PO Number', invoice.invoiceNumber || `PO-${invoice.id}`],
    ['Date', fmtDate(invoice.date)],
    ['Status', invoice.status || 'Pending'],
  ].forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(label + ':', mx, my);
    doc.setFont('helvetica', 'normal'); doc.text(val, mx + 28, my);
    my += 5;
  });

  const sepY = Math.max(y, my) + 3;
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
  doc.line(L, sepY, R, sepY);

  let by = sepY + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
  doc.text('VENDOR / SUPPLIER', L, by); by += 4.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  doc.text(vendor.name, L, by); by += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  if (vendor.gstin) { doc.text(`GSTIN: ${vendor.gstin}`, L, by); by += 4.5; }
  if (vendor.address) { doc.text(vendor.address, L, by); by += 4.5; }
  if (vendor.phone) { doc.text(`Phone: ${vendor.phone}`, L, by); by += 4.5; }
  doc.line(L, by + 3, R, by + 3);

  const tableBody = lineItems.map((item, i) => {
    const gross = (item.rate || item.basePrice) * item.qty;
    const disc = gross * (item.itemDiscountPct || 0) / 100;
    const lineAmt = gross - disc;
    return [i + 1, item.name, item.hsn || '-', item.qty, item.unit || 'PCS',
      fmtPDF(item.rate || item.basePrice),
      (item.itemDiscountPct || 0) > 0 ? `${item.itemDiscountPct}%` : '-',
      fmtPDF(lineAmt)];
  });

  autoTable(doc, {
    startY: by + 6,
    head: [['Sr.', 'Item', 'HSN', 'Qty', 'Unit', 'Rate', 'Disc%', 'Amount']],
    body: tableBody, theme: 'grid',
    headStyles: { fillColor: primary, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 9 }, 4: { halign: 'center', cellWidth: 10 },
      5: { halign: 'right', cellWidth: 22 }, 6: { halign: 'center', cellWidth: 11 },
      7: { halign: 'right', cellWidth: 28 }
    },
    margin: { left: L, right: 14 }
  });

  const totalsX = R - 80;
  let ty = doc.lastAutoTable.finalY + 6;
  const draw = (label, val, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9.5 : 8.5);
    doc.setTextColor(bold ? 30 : 80, bold ? 30 : 80, bold ? 30 : 80);
    doc.text(label, totalsX, ty); doc.text(val, R, ty, { align: 'right' }); ty += 5;
  };
  draw('Subtotal', fmtPDF(invoice.subtotal || 0));
  doc.setDrawColor(200, 200, 200); doc.line(totalsX, ty, R, ty); ty += 4;
  draw('Grand Total', fmtPDF(invoice.total || 0), true);

  if (invoice.notes) {
    ty += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('NOTES', L, ty); ty += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    doc.splitTextToSize(invoice.notes, R - L - 60).forEach(l => { doc.text(l, L, ty); ty += 4; });
  }

  doc.setDrawColor(...primary); doc.setLineWidth(0.5); doc.line(L, 287, R, 287);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
  doc.text('This is a computer-generated purchase order.', W / 2, 291, { align: 'center' });
  return doc;
}

const STATUS_OPTIONS = ['Pending', 'Received', 'Cancelled'];
const PAGE_SIZE = 50;

export default function Purchases() {
  const vendors = useLiveQuery(() => db.parties.where('type').equals('Vendor').toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const productVariants = useLiveQuery(() => db.productVariants.toArray());
  const purchaseBills = useLiveQuery(() =>
    db.invoices.where('type').equals('Purchase').reverse().sortBy('id')
  );

  const [tab, setTab] = useState('new');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [items, setItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantityStr, setQuantityStr] = useState('1');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [viewBill, setViewBill] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [companyGstin, setCompanyGstin] = useState('');
  const [vendorModal, setVendorModal] = useState(null);
  const [productModal, setProductModal] = useState(null);

  const variantsForPurchase = useMemo(() => {
    if (!productVariants || !products) return [];
    return productVariants.map(v => {
      const prod = products.find(p => p.id === v.productId);
      const packLabel = v.packSize ? `${v.packSize} ${v.unit} Pack` : v.unit;
      const displayName = prod ? (v.packSize ? `${prod.name} - ${packLabel}` : prod.name) : '';
      const isBulk = (prod?.inventoryMode || 'packed') === 'bulk';
      const masterStock = prod?.masterStock || 0;
      const packSz = Number(v.packSize) > 0 ? Number(v.packSize) : 1;
      const currentStock = isBulk ? masterStock / packSz : v.stockQty / packSz;
      return {
        ...v,
        variantId: v.id,
        productId: v.productId,
        productName: prod?.name || '',
        hsn: prod?.hsn || '',
        name: displayName,
        inventoryMode: isBulk ? 'bulk' : 'packed',
        masterStock,
        currentStock,
      };
    });
  }, [productVariants, products]);

  const toast = useToast();

  useEffect(() => {
    getSetting('company', {}).then(c => setCompanyGstin(c?.gstin || ''));
  }, []);

  const saveVendor = async (e) => {
    e.preventDefault();
    try {
      await db.parties.add({ ...vendorModal, type: 'Vendor', activities: [] });
      toast(`Vendor "${vendorModal.name}" added`, 'success');
      setVendorModal(null);
    } catch (err) {
      toast('Failed to add vendor: ' + err.message, 'error');
    }
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    const packSizeNum = Number(productModal.packSize) || 1;
    const sellingPrice = Number(productModal.sellingPrice);
    if (sellingPrice <= 0) { toast('Selling price must be > 0', 'warning'); return; }
    if (!productModal.productName.trim()) { toast('Product name is required', 'warning'); return; }
    try {
      const allProds = await db.products.toArray();
      let prod = allProds.find(p => p.name.trim().toLowerCase() === productModal.productName.trim().toLowerCase());
      let productId;
      if (prod) {
        productId = prod.id;
      } else {
        productId = await db.products.add({
          name: productModal.productName.trim(),
          hsn: productModal.hsn || '',
          inventoryMode: 'packed',
          masterStock: 0,
          baseUnit: null,
        });
      }
      const variantId = await db.productVariants.add({
        productId,
        packSize: packSizeNum,
        unit: productModal.unit,
        purchasePrice: Number(productModal.purchasePrice) || 0,
        sellingPrice,
        gstRate: Number(productModal.gstRate),
        stockQty: 0,
        reorderPoint: 10,
        barcode: '',
      });
      const initialPacks = Number(productModal.initialStock) || 0;
      if (initialPacks > 0) {
        await adjustStock({
          variantId, productId,
          packsDelta: initialPacks, type: 'opening', reference: 'Opening stock',
          unitCost: Number(productModal.purchasePrice) || 0,
        });
      }
      toast(`Product "${productModal.productName}" added`, 'success');
      setProductModal(null);
    } catch (err) {
      toast('Failed to add product: ' + err.message, 'error');
    }
  };

  const addItem = () => {
    if (!selectedProduct) return;
    const v = variantsForPurchase.find(x => x.variantId.toString() === selectedProduct);
    if (!v) return;
    const qty = Math.max(1, parseInt(quantityStr) || 1);
    const existing = items.findIndex(i => i.variantId === v.variantId);
    if (existing >= 0) {
      const updated = [...items];
      const newQty = updated[existing].qty + qty;
      updated[existing] = { ...updated[existing], qty: newQty, qtyStr: String(newQty) };
      setItems(updated);
    } else {
      const rate = v.purchasePrice ?? 0;
      setItems([...items, { ...v, rate, rateStr: String(rate), qty, qtyStr: String(qty), itemDiscountPct: 0, discStr: '0' }]);
    }
    setSelectedProduct('');
    setQuantityStr('1');
  };

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  // Free-edit qty: store raw string, parse on blur
  const updateQtyStr = (i, raw) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setItems(prev => prev.map((item, idx) => idx !== i ? item : {
      ...item, qtyStr: digits, qty: digits === '' ? 0 : (parseInt(digits) || 0),
    }));
  };

  const finalizeQty = (i) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const finalQty = Math.max(1, parseInt(item.qtyStr) || 1);
      return { ...item, qty: finalQty, qtyStr: String(finalQty) };
    }));
  };

  // Free-edit rate: allow decimal during typing
  const updateRateStr = (i, raw) => {
    const clean = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setItems(prev => prev.map((item, idx) => idx !== i ? item : {
      ...item, rateStr: clean, rate: parseFloat(clean) || 0,
    }));
  };

  const finalizeRate = (i) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const finalRate = Math.max(0, parseFloat(item.rateStr) || 0);
      return { ...item, rate: finalRate, rateStr: String(finalRate) };
    }));
  };

  const updateDiscount = (i, raw) => {
    const clean = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setItems(prev => prev.map((item, idx) => idx !== i ? item : {
      ...item, discStr: clean, itemDiscountPct: parseFloat(clean) || 0,
    }));
  };

  const finalizeDiscount = (i) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const v = Math.min(100, Math.max(0, parseFloat(item.discStr) || 0));
      return { ...item, itemDiscountPct: v, discStr: String(v) };
    }));
  };

  const updateBatch = (i, field, val) => {
    setItems(prev => prev.map((item, idx) => idx !== i ? item : { ...item, [field]: val }));
  };

  // No GST auto-calc: total = sum(rate × qty - discount)
  const totals = items.reduce((acc, item) => {
    const gross = (item.rate || 0) * (item.qty || 0);
    const discAmt = gross * (item.itemDiscountPct || 0) / 100;
    const lineAmt = gross - discAmt;
    return { gross: acc.gross + gross, subtotal: acc.subtotal + lineAmt };
  }, { gross: 0, subtotal: 0 });

  const grandTotal = totals.subtotal;

  const vendorObj = vendors?.find(v => v.id.toString() === selectedVendor);
  const isInterState = !!(getStateCode(vendorObj?.gstin) && getStateCode(companyGstin) && getStateCode(vendorObj?.gstin) !== getStateCode(companyGstin));

  const handleSave = async () => {
    if (!vendorObj) { toast('Select a vendor first', 'warning'); return; }
    if (items.length === 0) { toast('Add at least one item', 'warning'); return; }
    for (const item of items) {
      if (!item.qty || item.qty < 1) { toast(`Qty for "${item.name}" must be at least 1`, 'warning'); return; }
    }
    setSaving(true);
    try {
      const company = await getSetting('company', {});
      const poNumber = await getNextInvoiceNumber();

      const lineItems = items.map(item => ({
        variantId: item.variantId, productId: item.productId,
        name: item.name, hsn: item.hsn,
        purchasePriceSnapshot: item.purchasePrice || 0,
        barcodeSnapshot: item.barcode || '',
        purchasePrice: item.purchasePrice, rate: item.rate, gstRate: item.gstRate,
        qty: item.qty, unit: item.unit, itemDiscountPct: item.itemDiscountPct || 0,
        batchNo: item.batchNo || null,
        mfgDate: item.mfgDate || null,
        expiryDate: item.expiryDate || null,
      }));

      const freshCompanyState = getStateCode(company?.gstin || '');
      const freshVendorState = getStateCode(vendorObj.gstin);
      const finalTaxType = (freshCompanyState && freshVendorState && freshCompanyState !== freshVendorState)
        ? 'IGST' : 'CGST_SGST';

      const record = {
        invoiceNumber: poNumber, type: 'Purchase',
        partyId: vendorObj.id, date: new Date().toISOString(),
        taxType: finalTaxType,
        grossSubtotal: totals.gross,
        subtotal: totals.subtotal,
        taxAmount: 0,
        total: grandTotal,
        status: 'Pending', notes: notes.trim() || null, lineItems,
      };

      await db.transaction('rw', db.invoices, db.productVariants, db.products, db.stockLedger, db.batches, async () => {
        await db.invoices.add(record);
        for (const item of items) {
          await adjustStock({
            variantId: item.variantId,
            productId: item.productId,
            packsDelta: item.qty,
            type: 'purchase',
            reference: poNumber,
            unitCost: item.rate ?? 0,
            batchNo: item.batchNo || null,
          });
          if (item.batchNo) {
            const existingBatch = await db.batches
              .where('batchNo').equals(item.batchNo)
              .filter(b => b.variantId === item.variantId)
              .first();
            if (existingBatch) {
              await db.batches.update(existingBatch.id, {
                totalQty: (existingBatch.totalQty || 0) + item.qty,
                remainingQty: (existingBatch.remainingQty || 0) + item.qty,
              });
            } else {
              await db.batches.add({
                variantId: item.variantId,
                productId: item.productId,
                batchNo: item.batchNo,
                mfgDate: item.mfgDate || null,
                expiryDate: item.expiryDate || null,
                purchaseDate: new Date().toISOString(),
                costPerPack: item.rate ?? 0,
                totalQty: item.qty,
                remainingQty: item.qty,
                purchaseRef: poNumber,
                status: 'active',
              });
            }
          }
        }
      });

      const saved = await db.invoices.where('invoiceNumber').equals(poNumber).first();

      // Auto-record payment transaction and mark invoice as Paid
      if (saved) {
        await db.transactions.add({
          date: new Date().toISOString().slice(0, 10),
          partyId: vendorObj.id,
          invoiceId: saved.id,
          type: 'Payment Out',
          amount: grandTotal,
          method: paymentMethod,
          reference: poNumber,
          notes: `Purchase order ${poNumber}`,
          autoRecorded: true,
        });
        await db.invoices.update(saved.id, { status: 'Paid' });
      }

      const doc = await buildPurchasePDF(saved || record, vendorObj, lineItems, company);
      doc.save(`${poNumber}.pdf`);

      setItems([]); setSelectedVendor(''); setNotes(''); setPaymentMethod('Bank Transfer');
      toast(`Purchase ${poNumber} saved! Stock updated.`, 'success');
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReprintPDF = async (bill) => {
    const vendor = vendors?.find(v => v.id === bill.partyId);
    if (!vendor || !bill.lineItems?.length) { toast('Cannot reprint: data missing', 'warning'); return; }
    const company = await getSetting('company', {});
    const doc = await buildPurchasePDF(bill, vendor, bill.lineItems, company);
    doc.save(`${bill.invoiceNumber || `PO-${bill.id}`}.pdf`);
    toast('PDF downloaded', 'success');
  };

  // Marking Paid must also settle the ledger — otherwise Payments/Ledger pages
  // never see the money and the bill looks paid with no matching transaction.
  const handleStatusChange = async (bill, newStatus) => {
    try {
      if (newStatus === 'Paid') {
        const relatedTxns = await db.transactions.where('invoiceId').equals(bill.id).toArray();
        const alreadyPaid = relatedTxns.reduce((s, t) => s + (t.amount || 0), 0);
        const remaining = (bill.total || 0) - alreadyPaid;
        if (remaining > 0.01) {
          await db.transaction('rw', db.transactions, db.invoices, async () => {
            await db.transactions.add({
              date: new Date().toISOString().slice(0, 10),
              partyId: bill.partyId,
              invoiceId: bill.id,
              type: 'Payment Out',
              amount: remaining,
              method: 'Other',
              reference: bill.invoiceNumber || `PO-${bill.id}`,
              notes: 'Balance settled — marked Paid from Purchase History',
              autoRecorded: true,
            });
            await db.invoices.update(bill.id, { status: newStatus });
          });
          toast(`Status updated to Paid — ₹${remaining.toLocaleString('en-IN')} recorded as payment`, 'success');
          return;
        }
      }
      await db.invoices.update(bill.id, { status: newStatus });
      toast(`Status updated to ${newStatus}`, 'success');
    } catch (err) {
      toast('Failed to update status: ' + err.message, 'error');
    }
  };

  const handleDelete = async (bill) => {
    try {
      const linkedTxn = await db.transactions.filter(t => t.invoiceId === bill.id && t.autoRecorded).first();
      if (bill.lineItems?.length) {
        await db.transaction('rw', db.invoices, db.productVariants, db.products, db.stockLedger, db.transactions, async () => {
          if (linkedTxn) await db.transactions.delete(linkedTxn.id);
          for (const item of bill.lineItems) {
            if (!item.variantId) continue;
            try {
              await adjustStock({
                variantId: item.variantId,
                productId: item.productId,
                packsDelta: -item.qty,
                type: 'void',
                reference: `VOID:${bill.invoiceNumber || bill.id}`,
                note: 'Purchase bill deleted',
              });
            } catch (stockErr) {
              console.warn(`[Delete] Stock reversal skipped for variant ${item.variantId}:`, stockErr.message);
            }
          }
          await db.invoices.delete(bill.id);
        });
      } else {
        if (linkedTxn) await db.transactions.delete(linkedTxn.id);
        await db.invoices.delete(bill.id);
      }
      setConfirmDeleteId(null);
      toast('Purchase bill deleted', 'success');
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
    }
  };

  const filtered = purchaseBills?.filter(b => statusFilter === 'All' || b.status === statusFilter) || [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const vendorSummary = (() => {
    if (!purchaseBills || !vendors) return [];
    const map = {};
    purchaseBills.forEach(b => {
      if (!map[b.partyId]) map[b.partyId] = { count: 0, total: 0, pending: 0 };
      map[b.partyId].count++;
      map[b.partyId].total += b.total || 0;
      if (b.status === 'Pending') map[b.partyId].pending += b.total || 0;
    });
    return vendors.map(v => ({ ...v, ...map[v.id] || { count: 0, total: 0, pending: 0 } }))
      .filter(v => v.count > 0)
      .sort((a, b) => b.total - a.total);
  })();

  const inlineInput = { padding: '0.2rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.8rem' };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Purchase Management</h1>
        {tab === 'history' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['All', ...STATUS_OPTIONS].map(s => (
              <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.375rem 0.875rem', fontSize: '0.8rem' }}
                onClick={() => { setStatusFilter(s); setPage(1); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>
          <Plus size={15} /> New Purchase
        </button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <Package size={15} /> Purchase Bills
          <span className="badge badge-secondary">{purchaseBills?.length || 0}</span>
        </button>
        <button className={`tab-btn ${tab === 'vendors' ? 'active' : ''}`} onClick={() => setTab('vendors')}>
          <BarChart2 size={15} /> Vendor Summary
        </button>
      </div>

      {/* ── New Purchase ── */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
          <div className="card">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem' }}>Purchase Details</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vendor</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="form-input" style={{ flex: 1 }} value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)}>
                    <option value="">— Select Vendor —</option>
                    {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap', padding: '0 0.625rem', fontSize: '0.8rem' }}
                    onClick={() => setVendorModal({ name: '', phone: '', gstin: '', address: '' })}>
                    <Plus size={14} /> New
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                {selectedVendor && (
                  <>
                    <label className="form-label">Tax Region</label>
                    <div style={{ paddingTop: '0.375rem' }}>
                      <span className={`badge ${isInterState ? 'badge-warning' : 'badge-primary'}`}>
                        {isInterState ? 'Inter-state' : 'Intra-state'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="form-label">Product</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="form-input" style={{ flex: 1 }} value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                    <option value="">— Select Product —</option>
                    {variantsForPurchase.map(v => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.name} — ₹{(v.purchasePrice || 0).toLocaleString('en-IN')} (Stock: {v.currentStock.toFixed(1)} Packs)
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap', padding: '0 0.625rem', fontSize: '0.8rem' }}
                    onClick={() => setProductModal({ productName: '', hsn: '', packSize: '1', unit: 'PCS', purchasePrice: '', sellingPrice: '', gstRate: 18, initialStock: '0' })}>
                    <Plus size={14} /> New
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ width: '80px', marginBottom: 0 }}>
                <label className="form-label">Qty</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  value={quantityStr}
                  onChange={e => setQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setQuantityStr(String(Math.max(1, parseInt(quantityStr) || 1)))}
                  placeholder="1"
                />
              </div>
              <button className="btn btn-secondary" onClick={addItem} disabled={!selectedProduct}>
                <Plus size={16} /> Add
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Rate (₹)</th>
                    <th>Disc%</th>
                    <th>Batch / Lot</th>
                    <th>Mfg Date</th>
                    <th>Expiry</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const gross = (item.rate || 0) * (item.qty || 0);
                    const discAmt = gross * (item.itemDiscountPct || 0) / 100;
                    const lineAmt = gross - discAmt;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.qtyStr !== undefined ? item.qtyStr : String(item.qty)}
                            onChange={e => updateQtyStr(i, e.target.value)}
                            onBlur={() => finalizeQty(i)}
                            style={{ width: '60px', ...inlineInput, fontSize: '0.875rem' }}
                          />
                          {' Packs'}
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.rateStr !== undefined ? item.rateStr : String(item.rate)}
                            onChange={e => updateRateStr(i, e.target.value)}
                            onBlur={() => finalizeRate(i)}
                            style={{ width: '90px', ...inlineInput, fontSize: '0.875rem' }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.discStr !== undefined ? item.discStr : String(item.itemDiscountPct || 0)}
                              onChange={e => updateDiscount(i, e.target.value)}
                              onBlur={() => finalizeDiscount(i)}
                              style={{ width: '50px', ...inlineInput }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                          </div>
                        </td>
                        <td>
                          <input type="text" placeholder="e.g. LOT-001" value={item.batchNo || ''} onChange={e => updateBatch(i, 'batchNo', e.target.value)}
                            style={{ width: '100px', ...inlineInput }} />
                        </td>
                        <td>
                          <input type="date" value={item.mfgDate || ''} onChange={e => updateBatch(i, 'mfgDate', e.target.value)}
                            style={{ width: '120px', ...inlineInput }} />
                        </td>
                        <td>
                          <input type="date" value={item.expiryDate || ''} onChange={e => updateBatch(i, 'expiryDate', e.target.value)}
                            style={{ width: '120px', ...inlineInput, color: item.expiryDate && new Date(item.expiryDate) < new Date(Date.now() + 30*24*60*60*1000) ? 'var(--warning)' : 'var(--text-main)' }} />
                        </td>
                        <td style={{ fontWeight: 600, textAlign: 'right' }}>{fmtINR(lineAmt)}</td>
                        <td>
                          <button className="btn" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeItem(i)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No items added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {items.length > 0 && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes for this purchase order." style={{ resize: 'vertical' }} />
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ position: 'sticky', top: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem' }}>Summary</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {totals.gross !== totals.subtotal && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Gross</span>
                      <span style={{ color: 'var(--text-main)' }}>{fmtINR(totals.gross)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                      <span>Discount</span>
                      <span>-{fmtINR(totals.gross - totals.subtotal)}</span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span style={{ color: 'var(--text-main)' }}>{fmtINR(totals.subtotal)}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  GST recorded per vendor bill — not auto-calculated
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--border)', fontWeight: 700, fontSize: '1.125rem' }}>
                <span>Grand Total</span>
                <span style={{ color: 'var(--primary)' }}>{fmtINR(grandTotal)}</span>
              </div>
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Payment Method</label>
                <select className="form-input" style={{ fontSize: '0.85rem' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  {['Bank Transfer', 'Cash', 'Cheque', 'UPI', 'Credit Card', 'Other'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '0.875rem', padding: '0.75rem' }}
                onClick={handleSave} disabled={items.length === 0 || !selectedVendor || saving}>
                {saving ? 'Saving…' : <><Download size={18} /> Save Purchase</>}
              </button>
              {items.length > 0 && (
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }}
                  onClick={() => { setItems([]); setSelectedVendor(''); setNotes(''); setPaymentMethod('Bank Transfer'); }}>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Purchase Bills ── */}
      {tab === 'history' && (
        <div className="card">
          {paged.length === 0 ? (
            <div className="empty-state">
              <Package size={48} className="empty-state-icon" />
              <p>No purchase bills found.</p>
            </div>
          ) : (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(bill => {
                      const vendor = vendors?.find(v => v.id === bill.partyId);
                      return (
                        <tr key={bill.id}>
                          <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{bill.invoiceNumber || `PO-${bill.id}`}</td>
                          <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{fmtDate(bill.date)}</td>
                          <td style={{ fontWeight: 500 }}>{vendor?.name || '—'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtINR(bill.total)}</td>
                          <td>
                            <select className="form-input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                              value={bill.status || 'Pending'} onChange={e => handleStatusChange(bill, e.target.value)}>
                              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setViewBill(bill)} title="View"><Eye size={14} /></button>
                              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleReprintPDF(bill)} title="PDF"><Download size={14} /></button>
                              {confirmDeleteId === bill.id ? (
                                <>
                                  <button className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDelete(bill)}>Yes</button>
                                  <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                                </>
                              ) : (
                                <button className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => setConfirmDeleteId(bill.id)}><Trash2 size={14} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.625rem' }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.625rem' }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Vendor Summary ── */}
      {tab === 'vendors' && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem' }}>Vendor Purchase Summary</h2>
          {vendorSummary.length === 0 ? (
            <div className="empty-state">
              <TrendingDown size={40} className="empty-state-icon" />
              <p>No purchase data yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>GSTIN</th>
                    <th style={{ textAlign: 'right' }}>Bills</th>
                    <th style={{ textAlign: 'right' }}>Total Purchased</th>
                    <th style={{ textAlign: 'right' }}>Pending Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorSummary.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600 }}>{v.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.gstin || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{v.count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{fmtINR(v.total)}</td>
                      <td style={{ textAlign: 'right', color: v.pending > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                        {v.pending > 0 ? fmtINR(v.pending) : 'Nil'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Vendor Modal ── */}
      {vendorModal && (
        <Modal title="Add New Vendor" onClose={() => setVendorModal(null)} size="sm">
          <form onSubmit={saveVendor}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div className="form-group">
                <label className="form-label">Vendor Name *</label>
                <input required type="text" className="form-input" autoFocus
                  value={vendorModal.name} onChange={e => setVendorModal(m => ({ ...m, name: e.target.value }))}
                  placeholder="Company or person name" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input"
                  value={vendorModal.phone} onChange={e => setVendorModal(m => ({ ...m, phone: e.target.value }))}
                  placeholder="9999999999" />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input type="text" className="form-input" maxLength={15}
                  value={vendorModal.gstin} onChange={e => setVendorModal(m => ({ ...m, gstin: e.target.value.toUpperCase() }))}
                  placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2}
                  value={vendorModal.address} onChange={e => setVendorModal(m => ({ ...m, address: e.target.value }))}
                  placeholder="City, State, PIN" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setVendorModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><Plus size={14} /> Add Vendor</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Add Product Modal ── */}
      {productModal && (
        <Modal title="Add New Product" onClose={() => setProductModal(null)}>
          <form onSubmit={saveProduct}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Product Name *</label>
                <input required type="text" className="form-input" autoFocus
                  value={productModal.productName} onChange={e => setProductModal(m => ({ ...m, productName: e.target.value }))}
                  placeholder="e.g. Basmati Rice, Surf Excel" />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  If this product already exists a new variant is added under it.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">HSN / SAC Code</label>
                <input type="text" className="form-input"
                  value={productModal.hsn} onChange={e => setProductModal(m => ({ ...m, hsn: e.target.value }))}
                  placeholder="e.g. 1006" />
              </div>
              <div className="form-group">
                <label className="form-label">GST Rate</label>
                <select className="form-input" value={productModal.gstRate} onChange={e => setProductModal(m => ({ ...m, gstRate: Number(e.target.value) }))}>
                  {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Pack Size *</label>
                <input required type="number" min="0.001" step="any" className="form-input"
                  value={productModal.packSize} onChange={e => setProductModal(m => ({ ...m, packSize: e.target.value }))}
                  placeholder="1" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-input" value={productModal.unit} onChange={e => setProductModal(m => ({ ...m, unit: e.target.value }))}>
                  {['PCS', 'KG', 'GM', 'LTR', 'ML', 'MTR', 'CM', 'BOX', 'PKT', 'SET', 'NOS', 'PAIR', 'ROLL', 'BAG', 'BUNDLE'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Price (₹/pack)</label>
                <input type="number" min="0" step="0.01" className="form-input"
                  value={productModal.purchasePrice} onChange={e => setProductModal(m => ({ ...m, purchasePrice: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Selling Price (₹/pack) *</label>
                <input required type="number" min="0.01" step="0.01" className="form-input"
                  value={productModal.sellingPrice} onChange={e => setProductModal(m => ({ ...m, sellingPrice: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Initial Stock (Packs)</label>
                <input type="number" min="0" step="any" className="form-input"
                  value={productModal.initialStock} onChange={e => setProductModal(m => ({ ...m, initialStock: e.target.value }))}
                  placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setProductModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><Plus size={14} /> Add Product</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── View Bill Modal ── */}
      {viewBill && (
        <Modal title={`Purchase Bill ${viewBill.invoiceNumber || `PO-${viewBill.id}`}`} onClose={() => setViewBill(null)} size="lg">
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Vendor</div>
                <div style={{ fontWeight: 600 }}>{vendors?.find(v => v.id === viewBill.partyId)?.name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Date</div>
                <div style={{ fontWeight: 600 }}>{fmtDate(viewBill.date)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Grand Total</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--primary)' }}>{fmtINR(viewBill.total)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Status</div>
                <span className={`badge ${viewBill.status === 'Received' ? 'badge-success' : viewBill.status === 'Cancelled' ? 'badge-danger' : 'badge-warning'}`}>
                  {viewBill.status || 'Pending'}
                </span>
              </div>
            </div>

            {viewBill.lineItems?.length > 0 && (
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Disc%</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {viewBill.lineItems.map((item, i) => {
                      const gross = (item.rate || item.basePrice) * item.qty;
                      const discAmt = gross * (item.itemDiscountPct || 0) / 100;
                      const lineAmt = gross - discAmt;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{item.name}</td>
                          <td>{item.qty} Packs</td>
                          <td>{fmtINR(item.rate || item.basePrice)}</td>
                          <td>{item.itemDiscountPct ? `${item.itemDiscountPct}%` : '—'}</td>
                          <td style={{ fontWeight: 600, textAlign: 'right' }}>{fmtINR(lineAmt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setViewBill(null)}>Close</button>
              {viewBill.lineItems?.length > 0 && (
                <button className="btn btn-primary" onClick={() => { handleReprintPDF(viewBill); setViewBill(null); }}>
                  <Download size={15} /> Download PDF
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
