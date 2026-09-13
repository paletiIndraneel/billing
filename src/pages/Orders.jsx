import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { listOrders, createOrder, updateOrder, deleteOrder } from '../api/orders';
import { listOrderItems, listItemsByOrder, createOrderItem, deleteItemsByOrder } from '../api/orderItems';
import { listParties } from '../api/parties';
import { listProducts } from '../api/products';
import { listVariants } from '../api/variants';
import { Plus, Trash2, Truck, Package } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const STATUSES = ['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}
function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function statusBadge(status) {
  if (status === 'Delivered') return 'badge-success';
  if (status === 'Cancelled') return 'badge-danger';
  if (status === 'Shipped') return 'badge-primary';
  return 'badge-warning';
}

export default function Orders() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const orders = useTable(QK.orders, listOrders);
  const allOrderItems = useTable([QK.orderItems], listOrderItems);
  const parties = useTable(QK.parties, listParties);
  const products = useTable(QK.products, listProducts);
  const variants = useTable(QK.variants, listVariants);

  const [tab, setTab] = useState('Sales');
  const [newOrderModal, setNewOrderModal] = useState(null);
  const [shipModal, setShipModal] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qtyStr, setQtyStr] = useState('1');

  const variantsWithName = useMemo(() => {
    if (!variants || !products) return [];
    return variants.map(v => {
      const prod = products.find(p => p.id === v.productId);
      return { ...v, productName: prod?.name || '', displayName: prod ? `${prod.name} — ${v.packSize} ${v.unit} Pack` : '' };
    });
  }, [variants, products]);

  const itemsByOrderId = useMemo(() => {
    const map = {};
    (allOrderItems || []).forEach(i => { (map[i.orderId] ||= []).push(i); });
    return map;
  }, [allOrderItems]);

  const partiesForTab = useMemo(
    () => (parties || []).filter(p => p.type === (tab === 'Sales' ? 'Customer' : 'Vendor')),
    [parties, tab]
  );

  const filteredOrders = (orders || []).filter(o => o.orderType === tab);

  const orderTotal = (orderId) => (itemsByOrderId[orderId] || []).reduce((s, i) => s + i.qty * i.rate, 0);

  // ── Create order ────────────────────────────────────────────────────────────
  const addItemToNewOrder = () => {
    if (!selectedProduct) return;
    const v = variantsWithName.find(x => x.id === selectedProduct);
    if (!v) return;
    const qty = Math.max(0.001, parseFloat(qtyStr) || 1);
    setNewOrderModal(m => ({
      ...m,
      items: [...m.items, { variantId: v.id, productId: v.productId, productName: v.productName, unit: v.unit, qty, rate: v.sellingPrice || 0 }],
    }));
    setSelectedProduct(''); setProductSearch(''); setQtyStr('1');
  };

  const removeItemFromNewOrder = (idx) =>
    setNewOrderModal(m => ({ ...m, items: m.items.filter((_, i) => i !== idx) }));

  const saveNewOrder = async (e) => {
    e.preventDefault();
    const { orderType, partyId, expectedDate, notes, items } = newOrderModal;
    if (!partyId) { toast('Select a party', 'warning'); return; }
    if (items.length === 0) { toast('Add at least one item', 'warning'); return; }
    try {
      const orderNumber = `${orderType === 'Sales' ? 'SO' : 'PO'}-${Date.now()}`;
      const order = await createOrder({
        orderType, orderNumber, partyId, date: new Date().toISOString(),
        expectedDate: expectedDate || null, status: 'Placed', notes: notes || '',
      });
      for (const item of items) {
        await createOrderItem({ orderId: order.id, ...item });
      }
      toast(`${orderType} order ${orderNumber} created`, 'success');
      setNewOrderModal(null);
    } catch (err) {
      toast('Failed to create order: ' + err.message, 'error');
    }
    qc.invalidateQueries({ queryKey: [QK.orders] });
    qc.invalidateQueries({ queryKey: [QK.orderItems] });
  };

  // ── Status / shipment ───────────────────────────────────────────────────────
  const changeStatus = async (order, status) => {
    try {
      await updateOrder(order.id, { status });
      toast(`Status updated to ${status}`, 'success');
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.orders] });
  };

  const saveShipment = async (e) => {
    e.preventDefault();
    try {
      await updateOrder(shipModal.id, { carrier: shipModal.carrier, trackingNumber: shipModal.trackingNumber });
      toast('Shipment details saved', 'success');
      setShipModal(null);
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.orders] });
  };

  const removeOrder = async (order) => {
    try {
      await deleteItemsByOrder(order.id);
      await deleteOrder(order.id);
      toast('Order deleted', 'success');
      setConfirmDeleteId(null);
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    qc.invalidateQueries({ queryKey: [QK.orders] });
    qc.invalidateQueries({ queryKey: [QK.orderItems] });
  };

  // Convert: hand the order's party + items to the existing Billing/Purchases
  // form via router state, so the existing save flow (GST calc, stock movement)
  // does the actual work — no duplicated invoice logic here.
  const convertOrder = async (order) => {
    const items = await listItemsByOrder(order.id);
    const prefill = { orderId: order.id, partyId: order.partyId, items };
    if (order.orderType === 'Sales') {
      navigate('/billing', { state: { prefillOrder: prefill } });
    } else {
      navigate('/purchases', { state: { prefillOrder: prefill } });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Orders & Shipment</h1>
        <button className="btn btn-primary" onClick={() => setNewOrderModal({ orderType: tab, partyId: '', expectedDate: '', notes: '', items: [] })}>
          <Plus size={16} /> New {tab} Order
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {['Sales', 'Purchase'].map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>
            {t} Orders
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>{tab === 'Sales' ? 'Customer' : 'Vendor'}</th>
                <th>Date</th>
                <th>Expected</th>
                <th>Items</th>
                <th>Est. Total</th>
                <th>Status</th>
                <th>Shipment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(o => {
                const party = parties?.find(p => p.id === o.partyId);
                const items = itemsByOrderId[o.id] || [];
                const canShip = ['Shipped', 'Delivered'].includes(o.status);
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.orderNumber}</td>
                    <td>{party?.name || '—'}</td>
                    <td>{fmtDate(o.date)}</td>
                    <td>{fmtDate(o.expectedDate)}</td>
                    <td>{items.length}</td>
                    <td>{fmtINR(orderTotal(o.id))}</td>
                    <td>
                      <select className="form-input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                        value={o.status} onChange={e => changeStatus(o, e.target.value)} disabled={!!o.linkedInvoiceId}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                      <div style={{ marginTop: '0.25rem' }}>
                        <span className={`badge ${statusBadge(o.status)}`} style={{ fontSize: '0.65rem' }}>{o.status}</span>
                        {o.linkedInvoiceId && <span className="badge badge-success" style={{ fontSize: '0.65rem', marginLeft: '0.25rem' }}>Converted</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {canShip ? (
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => setShipModal({ id: o.id, carrier: o.carrier || '', trackingNumber: o.trackingNumber || '' })}>
                          <Truck size={12} /> {o.carrier ? `${o.carrier} · ${o.trackingNumber || '—'}` : 'Add details'}
                        </button>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {!o.linkedInvoiceId && o.status !== 'Cancelled' && (
                          <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => convertOrder(o)} title={tab === 'Sales' ? 'Convert to Invoice' : 'Convert to Purchase Bill'}>
                            <Package size={13} />
                          </button>
                        )}
                        {confirmDeleteId === o.id ? (
                          <>
                            <button className="btn btn-danger" style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeOrder(o)}>Yes</button>
                            <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                          </>
                        ) : (
                          <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem' }} onClick={() => setConfirmDeleteId(o.id)} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No {tab.toLowerCase()} orders yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Order Modal */}
      {newOrderModal && (
        <Modal title={`New ${newOrderModal.orderType} Order`} onClose={() => setNewOrderModal(null)} size="lg">
          <form onSubmit={saveNewOrder}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{newOrderModal.orderType === 'Sales' ? 'Customer' : 'Vendor'} *</label>
                <select required className="form-input" value={newOrderModal.partyId}
                  onChange={e => setNewOrderModal(m => ({ ...m, partyId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {partiesForTab.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Expected Date</label>
                <input type="date" className="form-input" value={newOrderModal.expectedDate}
                  onChange={e => setNewOrderModal(m => ({ ...m, expectedDate: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Product</label>
                <select className="form-input" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                  <option value="">— Select product —</option>
                  {variantsWithName
                    .filter(v => !productSearch || v.displayName.toLowerCase().includes(productSearch.toLowerCase()))
                    .map(v => <option key={v.id} value={v.id}>{v.displayName}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ width: '100px', marginBottom: 0 }}>
                <label className="form-label">Qty</label>
                <input type="text" inputMode="decimal" className="form-input" value={qtyStr}
                  onChange={e => setQtyStr(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} />
              </div>
              <button type="button" className="btn btn-secondary" onClick={addItemToNewOrder} disabled={!selectedProduct}>
                <Plus size={15} /> Add
              </button>
            </div>

            {newOrderModal.items.length > 0 && (
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {newOrderModal.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.productName}</td>
                        <td>{item.qty} {item.unit}</td>
                        <td>{fmtINR(item.rate)}</td>
                        <td>{fmtINR(item.qty * item.rate)}</td>
                        <td><button type="button" className="btn" style={{ padding: '0.25rem', color: 'var(--danger)' }} onClick={() => removeItemFromNewOrder(idx)}><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input type="text" className="form-input" value={newOrderModal.notes}
                onChange={e => setNewOrderModal(m => ({ ...m, notes: e.target.value }))} placeholder="Optional notes" />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setNewOrderModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Order</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Shipment Modal */}
      {shipModal && (
        <Modal title="Shipment Details" onClose={() => setShipModal(null)} size="sm">
          <form onSubmit={saveShipment}>
            <div className="form-group">
              <label className="form-label">Carrier</label>
              <input type="text" className="form-input" value={shipModal.carrier}
                onChange={e => setShipModal(m => ({ ...m, carrier: e.target.value }))} placeholder="e.g. Delhivery, BlueDart" />
            </div>
            <div className="form-group">
              <label className="form-label">Tracking / AWB Number</label>
              <input type="text" className="form-input" value={shipModal.trackingNumber}
                onChange={e => setShipModal(m => ({ ...m, trackingNumber: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShipModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
