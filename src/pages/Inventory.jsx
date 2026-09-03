import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { listProducts, createProduct, updateProduct, deleteProduct as apiDeleteProduct } from '../api/products';
import { listVariants, listVariantsByProduct, createVariant, updateVariant, deleteVariant as apiDeleteVariant } from '../api/variants';
import { listParties } from '../api/parties';
import { listActiveBatches } from '../api/batches';
import { createPurchase, listPurchasesByVariant } from '../api/purchases';
import { createTransaction } from '../api/transactions';
import { listLedgerByVariant } from '../api/stockLedger';
import { adjustStock, packageStock } from '../services/stockService';
import { convertUnit } from '../utils/unitConversion';
import { Plus, Edit2, Trash2, Search, TrendingDown, History, ShoppingCart, BookOpen, Package } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const UNITS = ['PCS', 'KG', 'GM', 'LTR', 'ML', 'MTR', 'CM', 'BOX', 'PKT', 'SET', 'NOS', 'PAIR', 'ROLL', 'BAG', 'BUNDLE'];
const GST_RATES = [0, 5, 12, 18, 28];

const EMPTY_FORM = {
  productName: '',
  hsn: '',
  inventoryMode: 'packed',
  baseUnit: '',
  packSize: '',
  unit: 'PCS',
  purchasePrice: '',
  sellingPrice: '',
  gstRate: 18,
  stockQty: '',       // initial stock in PACKS (converted to base units on save)
  reorderPoint: 10,
  barcode: '',
};

// packSize in display/base units, with unit conversion when product.baseUnit is set.
function ps(v) {
  const raw = Number(v.packSize) > 0 ? Number(v.packSize) : 1;
  if (!v.baseUnit || !v.unit) return raw;
  const from = v.unit.toUpperCase();
  const to = v.baseUnit.toUpperCase();
  if (from === to) return raw;
  try { return raw * convertUnit(1, from, to); } catch { return raw; }
}
// PACKED: stockQty / packSize
// BULK:   masterStock / packSize
// Hybrid: BULK product with packaged stock (variant.stockQty > 0) — use variant.stockQty
function effectivePacks(v) {
  if (v.inventoryMode === 'bulk' && v.stockQty === 0) return (v.masterStock || 0) / ps(v);
  return v.stockQty / ps(v);
}
function effectiveStock(v) {
  if (v.inventoryMode === 'bulk' && v.stockQty === 0) return v.masterStock || 0;
  return v.stockQty;
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

export default function Inventory() {
  const products = useTable(QK.products, listProducts);
  const variants = useTable(QK.variants, listVariants);
  const allParties = useTable(QK.parties, listParties);
  const vendors = useMemo(() => allParties.filter(p => p.type === 'Vendor'), [allParties]);
  const activeBatches = useTable(QK.batches, listActiveBatches);
  const qc = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editDelConfirm, setEditDelConfirm] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(null);
  const [outModal, setOutModal] = useState(null);
  const [historyVariantId, setHistoryVariantId] = useState(null);
  const [ledgerVariantId, setLedgerVariantId] = useState(null);
  const [packagingModal, setPackagingModal] = useState(null);
  // packagingModal = { product, variants: [...], items: [{ variant, qtyStr }], note }

  useEffect(() => { if (!editModal) setEditDelConfirm(false); }, [editModal]);

  const variantsWithProduct = useMemo(() => {
    if (!variants || !products) return [];
    return variants.map(v => {
      const p = products.find(pr => pr.id === v.productId);
      return {
        ...v,
        productName: p?.name || '',
        hsn: p?.hsn || '',
        inventoryMode: p?.inventoryMode || 'packed',
        masterStock: p?.masterStock || 0,
        baseUnit: p?.baseUnit || null,
      };
    });
  }, [variants, products]);

  const filtered = search
    ? variantsWithProduct.filter(v => {
        const q = search.toLowerCase();
        return v.productName.toLowerCase().includes(q) ||
          String(v.packSize || '').includes(q) ||
          (v.hsn && v.hsn.includes(q)) ||
          (v.barcode && v.barcode.includes(q));
      })
    : variantsWithProduct;

  // Header stats — effectivePacks handles both PACKED (variant.stockQty) and BULK (product.masterStock)
  const totalCostValue = variantsWithProduct.reduce((s, v) => s + (v.averageCost ?? v.purchasePrice ?? 0) * effectivePacks(v), 0);
  const totalRetailValue = variantsWithProduct.reduce((s, v) => s + v.sellingPrice * (1 + v.gstRate / 100) * effectivePacks(v), 0);
  const lowStockCount = variantsWithProduct.filter(v => effectivePacks(v) <= (v.reorderPoint ?? 10)).length;

  const setField = (f, val) => setEditModal(m => ({ ...m, data: { ...m.data, [f]: val } }));

  const saveVariant = async (e) => {
    e.preventDefault();
    const { mode, data } = editModal;
    const sellingPrice = Number(data.sellingPrice);
    if (sellingPrice <= 0) { toast('Selling price must be > 0', 'warning'); return; }
    if (!data.productName.trim()) { toast('Product name is required', 'warning'); return; }
    const packSizeNum = Number(data.packSize) || 1;
    if (packSizeNum <= 0) { toast('Pack size must be a positive number', 'warning'); return; }

    if (mode === 'add') {
      // Duplicate variant check (against in-memory lists)
      const prod = products.find(p => p.name.trim().toLowerCase() === data.productName.trim().toLowerCase());
      if (prod) {
        const dup = variants.find(v =>
          v.productId === prod.id &&
          Number(v.packSize) === packSizeNum &&
          v.unit === data.unit
        );
        if (dup) {
          toast(`A variant with pack size ${packSizeNum} ${data.unit} already exists for "${prod.name}"`, 'error');
          return;
        }
      }

      const initialPacks = Number(data.stockQty) || 0;
      // Inherit existing product's mode; new products use the form selection
      const effectiveMode = prod ? (prod.inventoryMode || 'packed') : (data.inventoryMode || 'packed');

      try {
        let productId = prod?.id ?? null;
        if (prod) {
          if (data.hsn && !prod.hsn) await updateProduct(prod.id, { hsn: data.hsn });
        } else {
          const p = await createProduct({
            name: data.productName.trim(),
            hsn: data.hsn || '',
            inventoryMode: effectiveMode,
            masterStock: 0,
            baseUnit: data.baseUnit?.trim().toUpperCase() || null,
          });
          productId = p.id;
        }
        const v = await createVariant({
          productId,
          packSize: packSizeNum,
          unit: data.unit,
          purchasePrice: Number(data.purchasePrice) || 0,
          sellingPrice,
          gstRate: Number(data.gstRate),
          stockQty: 0,
          reorderPoint: Number(data.reorderPoint) || 10,
          barcode: data.barcode?.trim() || '',
        });
        if (initialPacks > 0) {
          await adjustStock({
            variantId: v.id, productId,
            packsDelta: initialPacks, type: 'opening', reference: 'Opening stock',
            unitCost: Number(data.purchasePrice) || 0,
          });
        }
        toast('Product added', 'success');
      } catch (err) { toast('Save failed: ' + err.message, 'error'); }
    } else {
      const { variantId, productId } = editModal;
      try {
        await updateVariant(variantId, {
          packSize: packSizeNum,
          unit: data.unit,
          purchasePrice: Number(data.purchasePrice) || 0,
          sellingPrice,
          gstRate: Number(data.gstRate),
          reorderPoint: Number(data.reorderPoint) || 10,
          barcode: data.barcode?.trim() || '',
        });
        if (productId) await updateProduct(productId, { name: data.productName.trim(), hsn: data.hsn || '' });
        toast('Updated', 'success');
      } catch (err) { toast('Save failed: ' + err.message, 'error'); }
    }
    qc.invalidateQueries({ queryKey: [QK.products] });
    qc.invalidateQueries({ queryKey: [QK.variants] });
    qc.invalidateQueries({ queryKey: [QK.stockLedger] });
    setEditModal(null);
  };

  const deleteVariant = async () => {
    const { variantId, productId } = editModal;
    try {
      await apiDeleteVariant(variantId);
      const remaining = (await listVariantsByProduct(productId)).length;
      if (remaining === 0) await apiDeleteProduct(productId);
      toast('Deleted', 'success');
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.variants] });
    qc.invalidateQueries({ queryKey: [QK.products] });
    setEditModal(null);
  };

  const handlePurchase = async (e) => {
    e.preventDefault();
    const { variant, date, vendorId, qty, purchasePrice, notes } = purchaseModal;
    const packsNum = Number(qty);
    if (packsNum <= 0) { toast('Qty must be greater than 0', 'warning'); return; }
    const packSz = ps(variant);
    const baseQtyIn = packsNum * packSz;
    const priceNum = Number(purchasePrice) || 0;

    try {
      await createPurchase({
        productId: variant.productId,
        variantId: variant.id,
        vendorId: vendorId || null,
        date: new Date(date).toISOString(),
        qty: packsNum,
        purchasePrice: priceNum,
        notes: notes || '',
      });
      await adjustStock({
        variantId: variant.id, productId: variant.productId,
        packsDelta: packsNum, type: 'stock-in',
        reference: 'Manual stock-in', note: notes || '',
        unitCost: priceNum,
      });
      if (priceNum > 0) {
        await createTransaction({
          date: new Date(date).toISOString().slice(0, 10),
          partyId: vendorId || null,
          type: 'Payment Out',
          amount: priceNum * packsNum,
          method: 'Cash',
          reference: null,
          notes: `Stock-in: ${variant.productName} × ${packsNum} packs`,
          autoRecorded: true,
        });
      }
      toast(`Added ${packsNum} packs (${baseQtyIn} ${variant.unit}) of "${variant.productName}"`, 'success');
    } catch (err) { toast('Purchase failed: ' + err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.purchases] });
    qc.invalidateQueries({ queryKey: [QK.variants] });
    qc.invalidateQueries({ queryKey: [QK.products] });
    qc.invalidateQueries({ queryKey: [QK.stockLedger] });
    qc.invalidateQueries({ queryKey: [QK.transactions] });
    setPurchaseModal(null);
  };

  const handleOut = async (e) => {
    e.preventDefault();
    const { variant, qty } = outModal;
    const packSz = ps(variant);
    const baseQtyOut = Number(qty) * packSz;
    try {
      await adjustStock({
        variantId: variant.id, productId: variant.productId,
        packsDelta: -Number(qty), type: 'stock-out', reference: 'Manual stock-out',
      });
      toast(`Removed ${qty} packs (${baseQtyOut} ${variant.unit})`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.variants] });
    qc.invalidateQueries({ queryKey: [QK.products] });
    qc.invalidateQueries({ queryKey: [QK.stockLedger] });
    setOutModal(null);
  };

  const handlePackaging = async (e) => {
    e.preventDefault();
    const { product, items, note } = packagingModal;
    const packItems = items
      .filter(i => Number(i.qtyStr) > 0)
      .map(i => ({ variantId: i.variant.id, qty: Number(i.qtyStr) }));
    if (packItems.length === 0) { toast('Enter at least one packaging quantity', 'warning'); return; }
    try {
      await packageStock({ productId: product.id, packagingItems: packItems, note: note || '' });
      const totalPacked = packItems.reduce((s, i) => {
        const v = packagingModal.items.find(x => x.variant.id === i.variantId);
        const packSz = Number(v?.variant?.packSize) || 1;
        return s + i.qty * packSz;
      }, 0);
      toast(`Packaged ${totalPacked} ${packagingModal.items[0]?.variant?.unit || 'units'} from bulk stock`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
    qc.invalidateQueries({ queryKey: [QK.products] });
    qc.invalidateQueries({ queryKey: [QK.variants] });
    qc.invalidateQueries({ queryKey: [QK.stockLedger] });
    setPackagingModal(null);
  };

  const historyVariant = variantsWithProduct.find(v => v.id === historyVariantId);
  const purchaseHistory = useTable(
    [QK.purchases, historyVariantId],
    () => historyVariantId ? listPurchasesByVariant(historyVariantId) : Promise.resolve([]),
  );

  const ledgerVariant = variantsWithProduct.find(v => v.id === ledgerVariantId);
  const ledgerEntries = useTable(
    [QK.stockLedger, ledgerVariantId],
    () => ledgerVariantId ? listLedgerByVariant(ledgerVariantId) : Promise.resolve([]),
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <button className="btn btn-primary" onClick={() => setEditModal({ mode: 'add', data: { ...EMPTY_FORM } })}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ marginBottom: 0, flex: 1, minWidth: '160px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total SKUs</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{variantsWithProduct.length || 0}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, flex: 2, minWidth: '200px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cost Value (Purchase Price)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>₹{totalCostValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, flex: 2, minWidth: '200px', padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Retail Value (Sale Price incl. GST)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--success)' }}>₹{totalRetailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, flex: 1, minWidth: '140px', padding: '1rem 1.25rem', borderColor: lowStockCount > 0 ? 'rgba(245,158,11,0.4)' : undefined, background: lowStockCount > 0 ? 'rgba(245,158,11,0.04)' : undefined }}>
          <div style={{ fontSize: '0.75rem', color: lowStockCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>Low Stock</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: lowStockCount > 0 ? 'var(--warning)' : undefined }}>{lowStockCount}</div>
        </div>
      </div>

      {(() => {
        if (!activeBatches?.length) return null;
        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiring = activeBatches
          .filter(b => b.expiryDate && new Date(b.expiryDate) <= in30 && b.remainingQty > 0)
          .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        if (!expiring.length) return null;
        return (
          <div style={{ marginBottom: '1.5rem', padding: '0.875rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={15} /> {expiring.length} batch{expiring.length > 1 ? 'es' : ''} expiring within 30 days
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {expiring.map(b => {
                const v = variantsWithProduct.find(x => x.id === b.variantId);
                const expired = new Date(b.expiryDate) < now;
                return (
                  <span key={b.id} style={{ fontSize: '0.775rem', padding: '0.2rem 0.6rem', borderRadius: 3, background: expired ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.1)', color: expired ? 'var(--danger)' : 'var(--warning)', fontWeight: 500 }}>
                    {v?.productName || '?'} — Batch {b.batchNo} — {b.remainingQty} pks — Exp: {new Date(b.expiryDate).toLocaleDateString('en-IN')}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="card">
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input className="form-input search-input" placeholder="Search by product, HSN, barcode…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Pack Size</th>
                <th>HSN</th>
                <th>Barcode</th>
                <th>Purchase Price</th>
                <th>Sell Price</th>
                <th>GST</th>
                <th>Stock</th>
                <th>Available Packs</th>
                <th>Cost Value</th>
                <th>Retail Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const packSz = ps(v);
                const avail = effectivePacks(v);
                const isLow = avail <= (v.reorderPoint ?? 10);
                const isOut = avail <= 0;
                const costVal = (v.averageCost ?? v.purchasePrice ?? 0) * avail;
                const retailVal = v.sellingPrice * (1 + v.gstRate / 100) * avail;
                return (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.productName}</div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.03em', padding: '0.1rem 0.4rem', borderRadius: 3, background: v.inventoryMode === 'bulk' ? 'rgba(245,158,11,0.12)' : 'rgba(79,70,229,0.08)', color: v.inventoryMode === 'bulk' ? 'var(--warning)' : 'var(--primary)' }}>
                        {v.inventoryMode === 'bulk' ? 'BULK' : 'PACKED'}
                      </span>
                    </td>
                    <td>
                      {packSz > 0
                        ? <span style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--primary)', borderRadius: 4, padding: '0.125rem 0.5rem', fontSize: '0.8rem', fontWeight: 500 }}>{packSz} {v.unit}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{v.unit}</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.hsn || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.barcode || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>₹{(v.purchasePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 600 }}>₹{v.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>{v.gstRate}%</td>
                    <td>
                      {v.inventoryMode === 'bulk' ? (
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>Master Stock</div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {v.masterStock % 1 === 0 ? v.masterStock : v.masterStock.toFixed(2)} {v.baseUnit || v.unit}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {effectiveStock(v) % 1 === 0 ? effectiveStock(v) : effectiveStock(v).toFixed(2)} {v.baseUnit || v.unit}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)' }}>
                      {avail % 1 === 0 ? avail : avail.toFixed(2)} Packs
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>₹{costVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td style={{ fontWeight: 600 }}>₹{retailVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td>
                      {isOut ? <span className="badge badge-danger">Out of Stock</span>
                        : isLow ? <span className="badge badge-warning">Low Stock</span>
                        : <span className="badge badge-success">In Stock</span>}
                      {(() => {
                        const vBatches = (activeBatches || []).filter(b => b.variantId === v.id && b.expiryDate);
                        const soon = vBatches.filter(b => new Date(b.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
                        if (soon.length === 0) return null;
                        const nearest = soon.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
                        const expired = new Date(nearest.expiryDate) < new Date();
                        return (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span className={`badge ${expired ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                              {expired ? 'Expired' : 'Exp Soon'}: {new Date(nearest.expiryDate).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} title="Record Stock-In"
                          onClick={() => setPurchaseModal({ variant: v, date: todayISO(), vendorId: '', qty: 1, purchasePrice: v.purchasePrice || 0, notes: '' })}>
                          <ShoppingCart size={13} />
                        </button>
                        {v.inventoryMode === 'bulk' && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.5rem' }}
                            title="Package Bulk Stock into Variants"
                            onClick={() => {
                              const prod = products?.find(p => p.id === v.productId);
                              const siblings = variantsWithProduct.filter(x => x.productId === v.productId);
                              setPackagingModal({
                                product: prod,
                                variants: siblings,
                                items: siblings.map(s => ({ variant: s, qtyStr: '' })),
                                note: '',
                              });
                            }}
                          >
                            <Package size={13} />
                          </button>
                        )}
                        <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} title="Remove Stock"
                          onClick={() => setOutModal({ variant: v, qty: 1 })}>
                          <TrendingDown size={13} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} title="Stock Ledger"
                          onClick={() => setLedgerVariantId(v.id)}>
                          <BookOpen size={13} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} title="Purchase History"
                          onClick={() => setHistoryVariantId(v.id)}>
                          <History size={13} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} title="Edit"
                          onClick={() => setEditModal({
                            mode: 'edit',
                            variantId: v.id,
                            productId: v.productId,
                            data: {
                              productName: v.productName,
                              hsn: v.hsn,
                              baseUnit: v.baseUnit || '',
                              packSize: v.packSize || 1,
                              unit: v.unit,
                              purchasePrice: v.purchasePrice || 0,
                              sellingPrice: v.sellingPrice,
                              gstRate: v.gstRate,
                              stockQty: v.stockQty,
                              reorderPoint: v.reorderPoint ?? 10,
                              barcode: v.barcode || '',
                            }
                          })}>
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="13" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  {search ? 'No products match your search.' : 'No products yet. Add your first product.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {editModal && (
        <Modal title={editModal.mode === 'add' ? 'Add Product / Variant' : 'Edit Variant'} onClose={() => setEditModal(null)}>
          <form onSubmit={saveVariant}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Product Name *</label>
                <input
                  required type="text" className="form-input"
                  value={editModal.data.productName}
                  onChange={e => setField('productName', e.target.value)}
                  placeholder="e.g. Jeera, Chia Seeds, Paint"
                  readOnly={editModal.mode === 'edit'}
                  style={editModal.mode === 'edit' ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  autoFocus={editModal.mode === 'add'}
                />
                {editModal.mode === 'add' && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    If this product already exists, the new variant will be added under it.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">HSN / SAC Code</label>
                <input type="text" className="form-input" value={editModal.data.hsn} onChange={e => setField('hsn', e.target.value)} placeholder="e.g. 0909" />
              </div>
              {editModal.mode === 'add' ? (
                <>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Inventory Mode</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      {[
                        { value: 'packed', label: 'Packed', desc: 'Each variant tracks its own stock independently' },
                        { value: 'bulk',   label: 'Bulk',   desc: 'Product shares one master stock pool across all variants' },
                      ].map(opt => (
                        <label key={opt.value} style={{ flex: 1, display: 'flex', gap: '0.5rem', padding: '0.625rem 0.75rem', border: `1.5px solid ${editModal.data.inventoryMode === opt.value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: editModal.data.inventoryMode === opt.value ? 'rgba(79,70,229,0.06)' : 'transparent' }}>
                          <input type="radio" name="inventoryMode" value={opt.value} checked={editModal.data.inventoryMode === opt.value} onChange={() => setField('inventoryMode', opt.value)} style={{ marginTop: 3 }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{opt.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      Use <strong>Bulk</strong> for rice, grains, spices, seeds &amp; loose commodities. If adding a variant to an <em>existing</em> product, its current mode is preserved.
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Base Unit <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(canonical storage unit)</span>
                    </label>
                    <select className="form-input" value={editModal.data.baseUnit} onChange={e => setField('baseUnit', e.target.value)}>
                      <option value="">— same as variant unit —</option>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Set this when variants use different units (e.g. KG &amp; GM). All stock quantities are stored in this unit and converted automatically.
                    </div>
                  </div>
                </>
              ) : (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Inventory Mode</label>
                  {(() => {
                    const prod = products?.find(p => p.id === editModal.productId);
                    const mode = prod?.inventoryMode || 'packed';
                    const bu = prod?.baseUnit || null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '0.2rem 0.625rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, background: mode === 'bulk' ? 'rgba(245,158,11,0.12)' : 'rgba(79,70,229,0.08)', color: mode === 'bulk' ? 'var(--warning)' : 'var(--primary)' }}>
                          {mode === 'bulk' ? 'BULK' : 'PACKED'}
                        </span>
                        {bu && (
                          <span style={{ padding: '0.2rem 0.625rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, background: 'rgba(5,150,105,0.1)', color: 'var(--success)' }}>
                            Base: {bu}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {mode === 'bulk' ? 'Shared master stock pool across all variants' : 'Each variant tracks its own stock'}
                          {bu ? ` · All quantities stored in ${bu}` : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Barcode</label>
                <input type="text" className="form-input" value={editModal.data.barcode} onChange={e => setField('barcode', e.target.value)} placeholder="e.g. 8901234567890" />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Pack Size <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(quantity of {editModal.data.unit || 'unit'} per pack)</span>
                </label>
                <input
                  type="number" min="0.001" step="any" className="form-input"
                  value={editModal.data.packSize}
                  onChange={e => setField('packSize', e.target.value)}
                  placeholder="e.g. 50, 0.5, 1.25"
                />
                {Number(editModal.data.packSize) > 0 && (() => {
                  const raw = Number(editModal.data.packSize);
                  const base = editModal.data.baseUnit?.toUpperCase();
                  const from = editModal.data.unit?.toUpperCase();
                  let converted = null;
                  if (base && from && base !== from) {
                    try { converted = raw * convertUnit(1, from, base); } catch { /* incompatible */ }
                  }
                  return (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      1 pack = {raw} {editModal.data.unit}
                      {converted !== null && ` = ${converted % 1 === 0 ? converted : converted.toFixed(3)} ${editModal.data.baseUnit} (stored)`}
                    </div>
                  );
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-input" value={editModal.data.unit} onChange={e => setField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Price (₹/pack)</label>
                <input type="number" min="0" step="0.01" className="form-input" value={editModal.data.purchasePrice} onChange={e => setField('purchasePrice', e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Selling Price (₹/pack) *</label>
                <input required type="number" min="0.01" step="0.01" className="form-input" value={editModal.data.sellingPrice} onChange={e => setField('sellingPrice', e.target.value)} placeholder="0.00" autoFocus={editModal.mode === 'edit'} />
              </div>
              <div className="form-group">
                <label className="form-label">GST Rate</label>
                <select className="form-input" value={editModal.data.gstRate} onChange={e => setField('gstRate', e.target.value)}>
                  {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reorder Point (Packs)</label>
                <input type="number" min="0" step="any" className="form-input" value={editModal.data.reorderPoint} onChange={e => setField('reorderPoint', e.target.value)} placeholder="10" />
              </div>
              {editModal.mode === 'add' && (
                <div className="form-group">
                  <label className="form-label">Initial Stock (Packs)</label>
                  <input type="number" min="0" step="any" className="form-input" value={editModal.data.stockQty} onChange={e => setField('stockQty', e.target.value)} placeholder="0" />
                  {Number(editModal.data.packSize) > 0 && Number(editModal.data.stockQty) > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      = {(Number(editModal.data.stockQty) * Number(editModal.data.packSize)).toFixed(2)} {editModal.data.unit} in stock
                    </div>
                  )}
                </div>
              )}
            </div>

            {Number(editModal.data.sellingPrice) > 0 && (() => {
              const sp = Number(editModal.data.sellingPrice) || 0;
              const gst = Number(editModal.data.gstRate) || 0;
              const pp = Number(editModal.data.purchasePrice) || 0;
              const final = sp * (1 + gst / 100);
              const margin = pp > 0 ? ((sp / pp - 1) * 100) : null;
              return (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(79,70,229,0.06)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  {margin !== null && <span style={{ color: 'var(--text-muted)' }}>Margin: <strong style={{ color: margin >= 0 ? 'var(--success)' : 'var(--danger)' }}>{margin.toFixed(1)}%</strong></span>}
                  <span style={{ color: 'var(--text-muted)' }}>Sell: <strong style={{ color: 'var(--primary)' }}>₹{sp.toFixed(2)}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>Incl. GST: <strong style={{ color: 'var(--success)' }}>₹{final.toFixed(2)}</strong></span>
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.75rem' }}>
              {editModal.mode === 'edit' && (
                !editDelConfirm ? (
                  <button type="button" className="btn btn-danger" onClick={() => setEditDelConfirm(true)}>
                    <Trash2 size={15} /> Delete
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}>Delete permanently?</span>
                    <button type="button" className="btn btn-danger" onClick={deleteVariant}>Yes</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditDelConfirm(false)}>No</button>
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editModal.mode === 'add' ? 'Add Product' : 'Save Changes'}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Record Stock-In Modal */}
      {purchaseModal && (() => {
        const packSz = ps(purchaseModal.variant);
        const isBulkModal = purchaseModal.variant.inventoryMode === 'bulk';
        const currentBaseModal = isBulkModal ? (purchaseModal.variant.masterStock || 0) : purchaseModal.variant.stockQty;
        const newBaseQty = currentBaseModal + Number(purchaseModal.qty || 0) * packSz;
        const newPacks = newBaseQty / packSz;
        return (
          <Modal title={`Stock In — ${purchaseModal.variant.productName} (${packSz} ${purchaseModal.variant.unit} Pack)`} onClose={() => setPurchaseModal(null)} size="sm">
            <form onSubmit={handlePurchase}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input required type="date" className="form-input" value={purchaseModal.date} onChange={e => setPurchaseModal(m => ({ ...m, date: e.target.value }))} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Packs Received *</label>
                  <input required type="number" min="0.001" step="any" className="form-input" value={purchaseModal.qty}
                    onChange={e => setPurchaseModal(m => ({ ...m, qty: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Price (₹/pack)</label>
                  <input type="number" min="0" step="0.01" className="form-input" value={purchaseModal.purchasePrice}
                    onChange={e => setPurchaseModal(m => ({ ...m, purchasePrice: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor</label>
                  <select className="form-input" value={purchaseModal.vendorId} onChange={e => setPurchaseModal(m => ({ ...m, vendorId: e.target.value }))}>
                    <option value="">— None —</option>
                    {vendors?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes</label>
                  <input type="text" className="form-input" value={purchaseModal.notes}
                    onChange={e => setPurchaseModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional notes" />
                </div>
              </div>
              <div style={{ padding: '0.625rem 0.875rem', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span>New stock: <strong style={{ color: 'var(--success)' }}>{newBaseQty % 1 === 0 ? newBaseQty : newBaseQty.toFixed(2)} {purchaseModal.variant.unit}</strong></span>
                <span style={{ color: 'var(--text-muted)' }}>Available packs: <strong>{newPacks % 1 === 0 ? newPacks : newPacks.toFixed(2)}</strong></span>
                {Number(purchaseModal.purchasePrice) > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>Total cost: <strong style={{ color: 'var(--text-main)' }}>
                    ₹{(Number(purchaseModal.purchasePrice) * Number(purchaseModal.qty || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </strong></span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPurchaseModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><ShoppingCart size={15} /> Record Stock-In</button>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* Stock Out Modal */}
      {outModal && (() => {
        const packSz = ps(outModal.variant);
        const isBulkOut = outModal.variant.inventoryMode === 'bulk';
        const currentBaseOut = isBulkOut ? (outModal.variant.masterStock || 0) : outModal.variant.stockQty;
        const avail = currentBaseOut / packSz;
        const newPacks = avail - Number(outModal.qty || 0);
        const newBaseQty = currentBaseOut - Number(outModal.qty || 0) * packSz;
        return (
          <Modal title={`Remove Stock — ${outModal.variant.productName} (${packSz} ${outModal.variant.unit} Pack)`} onClose={() => setOutModal(null)} size="sm">
            <form onSubmit={handleOut}>
              <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Current: <strong style={{ color: 'var(--text-main)' }}>{outModal.variant.stockQty % 1 === 0 ? outModal.variant.stockQty : outModal.variant.stockQty.toFixed(2)} {outModal.variant.unit}</strong>
                {' · '}
                <strong style={{ color: 'var(--text-main)' }}>{avail % 1 === 0 ? avail : avail.toFixed(2)} packs</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Packs to Remove *</label>
                <input required type="number" min="0.001" step="any" max={avail} className="form-input"
                  value={outModal.qty}
                  onChange={e => setOutModal(m => ({ ...m, qty: e.target.value }))}
                  autoFocus />
              </div>
              <div style={{ padding: '0.625rem 0.875rem', background: newBaseQty < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {newBaseQty < 0
                  ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Cannot remove — exceeds available stock</span>
                  : <>New stock: <strong style={{ color: 'var(--danger)' }}>
                      {newBaseQty % 1 === 0 ? newBaseQty : newBaseQty.toFixed(2)} {outModal.variant.unit}
                    </strong>
                    {' · '}
                    <strong style={{ color: 'var(--danger)' }}>
                      {newPacks % 1 === 0 ? newPacks : newPacks.toFixed(2)} packs
                    </strong>
                  </>}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setOutModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={newBaseQty < 0}><TrendingDown size={15} /> Remove Stock</button>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* Purchase History Modal */}
      {historyVariantId && historyVariant && (
        <Modal title={`Purchase History — ${historyVariant.productName} (${ps(historyVariant)} ${historyVariant.unit} Pack)`} onClose={() => setHistoryVariantId(null)} size="md">
          {!purchaseHistory || purchaseHistory.length === 0 ? (
            <div>
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No purchase records yet.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setHistoryVariantId(null)}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Vendor</th>
                      <th>Packs</th>
                      <th>{historyVariant.unit} Qty</th>
                      <th>Price/Pack</th>
                      <th>Total Cost</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseHistory.map(p => {
                      const vendor = vendors?.find(v => v.id === p.vendorId);
                      const packSz = ps(historyVariant);
                      return (
                        <tr key={p.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                          <td>{vendor?.name || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{p.qty}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.qty * packSz} {historyVariant.unit}</td>
                          <td>₹{(p.purchasePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ fontWeight: 600 }}>₹{((p.purchasePrice || 0) * p.qty).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <span>
                  {purchaseHistory.length} purchase{purchaseHistory.length !== 1 ? 's' : ''} ·{' '}
                  {purchaseHistory.reduce((s, p) => s + p.qty, 0)} packs ·{' '}
                  ₹{purchaseHistory.reduce((s, p) => s + (p.purchasePrice || 0) * p.qty, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} total cost
                </span>
                <button className="btn btn-secondary" onClick={() => setHistoryVariantId(null)}>Close</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Packaging Modal — convert bulk masterStock into individual packed variants */}
      {packagingModal && (() => {
        const { product, items, note } = packagingModal;
        const masterStock = product?.masterStock || 0;
        const unit = items[0]?.variant?.unit || '';
        const totalBaseNeeded = items.reduce((s, i) => {
          const qty = Number(i.qtyStr) || 0;
          const packSz = Number(i.variant.packSize) > 0 ? Number(i.variant.packSize) : 1;
          return s + qty * packSz;
        }, 0);
        const remaining = masterStock - totalBaseNeeded;
        const isValid = totalBaseNeeded > 0 && remaining >= 0;
        return (
          <Modal
            title={`Package Bulk Stock — ${product?.name || ''}`}
            onClose={() => setPackagingModal(null)}
            size="md"
          >
            <form onSubmit={handlePackaging}>
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
                <strong>Bulk stock available:</strong>{' '}
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                  {masterStock % 1 === 0 ? masterStock : masterStock.toFixed(2)} {unit}
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Enter how many packs of each variant to create from this bulk pool.
                </div>
              </div>

              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Variant (Pack Size)</th>
                      <th>Current Packed Stock</th>
                      <th>Packs to Create</th>
                      <th>Base Units Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const packSz = Number(item.variant.packSize) > 0 ? Number(item.variant.packSize) : 1;
                      const qty = Number(item.qtyStr) || 0;
                      const baseUsed = qty * packSz;
                      const currentPacked = item.variant.stockQty / packSz;
                      return (
                        <tr key={item.variant.id}>
                          <td style={{ fontWeight: 500 }}>
                            {packSz} {item.variant.unit} Pack
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Avg Cost: ₹{(item.variant.averageCost ?? item.variant.purchasePrice ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {currentPacked % 1 === 0 ? currentPacked : currentPacked.toFixed(2)} packs
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="form-input"
                              style={{ width: '80px', padding: '0.25rem 0.5rem' }}
                              value={item.qtyStr}
                              placeholder="0"
                              onChange={e => {
                                const updated = [...packagingModal.items];
                                updated[idx] = { ...updated[idx], qtyStr: e.target.value.replace(/[^0-9]/g, '') };
                                setPackagingModal(m => ({ ...m, items: updated }));
                              }}
                            />
                          </td>
                          <td style={{ fontWeight: qty > 0 ? 600 : undefined, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {qty > 0 ? `${baseUsed % 1 === 0 ? baseUsed : baseUsed.toFixed(2)} ${unit}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                background: remaining < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                display: 'flex',
                gap: '2rem',
                flexWrap: 'wrap',
              }}>
                <span>
                  Total base units used:{' '}
                  <strong style={{ color: totalBaseNeeded > masterStock ? 'var(--danger)' : 'var(--text-main)' }}>
                    {totalBaseNeeded % 1 === 0 ? totalBaseNeeded : totalBaseNeeded.toFixed(2)} {unit}
                  </strong>
                </span>
                <span>
                  Remaining bulk:{' '}
                  <strong style={{ color: remaining < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {remaining < 0 ? '⚠ Exceeds available stock' : `${remaining % 1 === 0 ? remaining : remaining.toFixed(2)} ${unit}`}
                  </strong>
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={note}
                  onChange={e => setPackagingModal(m => ({ ...m, note: e.target.value }))}
                  placeholder="e.g. Packaged for retail season"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPackagingModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!isValid}>
                  <Package size={15} /> Package Stock
                </button>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* Stock Ledger Modal */}
      {ledgerVariantId && ledgerVariant && (
        <Modal title={`Stock Ledger — ${ledgerVariant.productName} (${ps(ledgerVariant)} ${ledgerVariant.unit} Pack)`} onClose={() => setLedgerVariantId(null)} size="lg">
          {!ledgerEntries || ledgerEntries.length === 0 ? (
            <div>
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No ledger entries yet.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setLedgerVariantId(null)}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Packs</th>
                      <th>{ledgerVariant.unit} Change</th>
                      <th>Balance ({ledgerVariant.unit})</th>
                      <th>Batch</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map(e => {
                      const isIn = e.packs > 0;
                      return (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                          <td>
                            <span className={`badge ${isIn ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                              {e.type.replace('-', ' ')}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: isIn ? 'var(--success)' : 'var(--danger)' }}>
                            {isIn ? '+' : ''}{e.packs % 1 === 0 ? e.packs : e.packs.toFixed(2)}
                          </td>
                          <td style={{ color: isIn ? 'var(--success)' : 'var(--danger)' }}>
                            {isIn ? '+' : ''}{e.baseQtyDelta % 1 === 0 ? e.baseQtyDelta : e.baseQtyDelta.toFixed(2)}
                          </td>
                          <td style={{ fontWeight: 600 }}>{e.balanceQty % 1 === 0 ? e.balanceQty : e.balanceQty.toFixed(2)}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.batchNo || '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{e.reference || e.note || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setLedgerVariantId(null)}>Close</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
