import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Search, FileText, IndianRupee } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

export default function Payments() {
  const transactions = useLiveQuery(() => db.transactions.reverse().toArray());
  const parties = useLiveQuery(() => db.parties.toArray());
  const invoices = useLiveQuery(() => db.invoices.toArray());

  const [paymentModal, setPaymentModal] = useState(null); // { mode: 'add', data: {...} }
  const toast = useToast();

  // Filter and Search States
  const [filterParty, setFilterParty] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  
  // Searchable combobox states inside Record Payment modal
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);

  // Financial Stats Analytics
  const stats = useMemo(() => {
    const received = (transactions || []).filter(t => t.type === 'Payment In').reduce((sum, t) => sum + t.amount, 0);
    const paid = (transactions || []).filter(t => t.type === 'Payment Out' || t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0);
    return { received, paid, balance: received - paid };
  }, [transactions]);

  // Outstanding/Pending Invoices — includes Partial so the remaining balance stays visible for follow-up
  const pendingInvoices = useMemo(() => {
    return (invoices || [])
      .filter(inv => (inv.status === 'Pending' || inv.status === 'Partial') && (inv.type === 'Sales' || inv.type === 'Purchase'))
      .map(inv => {
        const paid = (transactions || []).filter(t => t.invoiceId === inv.id).reduce((s, t) => s + t.amount, 0);
        return { ...inv, dueAmount: Math.max(0, inv.total - paid) };
      });
  }, [invoices, transactions]);

  // Filter transactions based on active selections
  const filteredTransactions = useMemo(() => {
    return (transactions || []).filter(txn => {
      const matchParty = !filterParty || String(txn.partyId) === String(filterParty);
      const matchMethod = filterMethod === 'All' || txn.method === filterMethod;
      const matchType = filterType === 'All' || txn.type === filterType;
      const txnDate = new Date(txn.date);
      const matchFrom = !filterFromDate || txnDate >= new Date(filterFromDate);
      const matchTo = !filterToDate || txnDate <= new Date(filterToDate + 'T23:59:59');
      return matchParty && matchMethod && matchType && matchFrom && matchTo;
    });
  }, [transactions, filterParty, filterMethod, filterType, filterFromDate, filterToDate]);

  const handleOpenModal = (type) => {
    setPartySearch('');
    setPaymentModal({
      mode: 'add',
      data: {
        date: new Date().toISOString().slice(0, 10),
        partyId: '',
        invoiceId: '',
        type, // 'Payment In' or 'Payment Out'
        amount: '',
        method: 'Bank Transfer',
        reference: '',
        notes: ''
      }
    });
  };

  const handleQuickPay = (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    setPartySearch(party ? party.name : '');
    setPaymentModal({
      mode: 'add',
      data: {
        date: new Date().toISOString().slice(0, 10),
        partyId: String(inv.partyId),
        invoiceId: String(inv.id),
        type: inv.type === 'Purchase' ? 'Payment Out' : 'Payment In',
        amount: String(inv.dueAmount ?? inv.total),
        method: 'Bank Transfer',
        reference: '',
        notes: `Linked to ${inv.invoiceNumber || `INV-${inv.id}`}`
      }
    });
  };

  const setField = (f, v) => setPaymentModal(m => ({ ...m, data: { ...m.data, [f]: v } }));

  const savePayment = async (e) => {
    e.preventDefault();
    const data = { ...paymentModal.data };
    data.amount = Number(data.amount);
    data.partyId = Number(data.partyId);
    if (data.invoiceId) data.invoiceId = Number(data.invoiceId);
    else delete data.invoiceId;

    if (!data.partyId) {
      toast('Please select a party', 'warning');
      return;
    }
    if (data.amount <= 0) {
      toast('Amount must be greater than zero', 'warning');
      return;
    }

    try {
      await db.transaction('rw', db.transactions, db.invoices, async () => {
        await db.transactions.add(data);
        
        // Auto-update linked invoice status
        if (data.invoiceId) {
          const inv = await db.invoices.get(data.invoiceId);
          if (inv) {
            const relatedTxns = await db.transactions.where('invoiceId').equals(inv.id).toArray();
            const sumPaid = relatedTxns.reduce((s, t) => s + t.amount, 0) + data.amount;
            if (sumPaid >= inv.total) {
              await db.invoices.update(inv.id, { status: 'Paid' });
            } else if (sumPaid > 0) {
              await db.invoices.update(inv.id, { status: 'Partial' });
            }
          }
        }
      });
      
      toast(`${data.type} recorded successfully`, 'success');
      setPaymentModal(null);
    } catch (err) {
      toast('Failed to record payment', 'error');
    }
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    try {
      const txn = await db.transactions.get(id);
      await db.transaction('rw', db.transactions, db.invoices, async () => {
        await db.transactions.delete(id);
        
        // Auto-revert linked invoice status to Pending if it was paid
        if (txn?.invoiceId) {
          const inv = await db.invoices.get(txn.invoiceId);
          if (inv) {
            const relatedTxns = await db.transactions.where('invoiceId').equals(inv.id).toArray();
            const sumPaid = relatedTxns.filter(t => t.id !== id).reduce((s, t) => s + t.amount, 0);
            if (sumPaid <= 0) {
              await db.invoices.update(inv.id, { status: 'Pending' });
            } else if (sumPaid < inv.total) {
              await db.invoices.update(inv.id, { status: 'Partial' });
            }
          }
        }
      });
      toast('Payment deleted', 'success');
    } catch (err) {
      toast('Failed to delete payment', 'error');
    }
  };

  const methods = ['Bank Transfer', 'Cash', 'Cheque', 'UPI', 'Credit Card', 'Other'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payments & Ledger</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" style={{ background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => handleOpenModal('Payment In')}>
            <ArrowDownCircle size={16} /> Receive Payment
          </button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleOpenModal('Payment Out')}>
            <ArrowUpCircle size={16} /> Make Payment
          </button>
        </div>
      </div>

      {/* Analytics KPI Stat Bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: 1, padding: '1rem 1.25rem', minWidth: '200px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL RECEIVED (CASH IN)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
              ₹{stats.received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
            <ArrowDownCircle size={20} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: '1rem 1.25rem', minWidth: '200px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL PAID (CASH OUT)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>
              ₹{stats.paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
            <ArrowUpCircle size={20} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: '1rem 1.25rem', minWidth: '200px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>NET BALANCE</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stats.balance >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
              ₹{stats.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="stat-icon" style={{ background: stats.balance >= 0 ? 'rgba(79,70,229,0.1)' : 'rgba(239,68,68,0.1)', color: stats.balance >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
            <IndianRupee size={20} />
          </div>
        </div>
      </div>

      {/* Outstanding Invoices Quick-Pay Panel */}
      {pendingInvoices.length > 0 && (
        <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--warning)', background: 'rgba(245,158,11,0.02)', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--warning)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FileText size={15} /> Outstanding Invoices ({pendingInvoices.length})
          </h2>
          <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Party</th>
                  <th>Type</th>
                  <th>Due Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvoices.map(inv => {
                  const party = parties?.find(p => p.id === inv.partyId);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{inv.invoiceNumber || `INV-${inv.id}`}</td>
                      <td style={{ fontSize: '0.85rem' }}>{party?.name || '—'}</td>
                      <td>
                        <span className={`badge ${inv.type === 'Purchase' ? 'badge-warning' : 'badge-primary'}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                          {inv.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>₹{inv.dueAmount.toLocaleString('en-IN')}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleQuickPay(inv)}>
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters Card */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Filters:</span>

          {/* Type Filter */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['All', 'Payment In', 'Payment Out', 'Expense'].map(t => (
              <button key={t} className={`btn ${filterType === t ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                onClick={() => setFilterType(t)}>
                {t}
              </button>
            ))}
          </div>

          {/* Party Filter dropdown */}
          <select className="form-input" style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.85rem' }} value={filterParty} onChange={e => setFilterParty(e.target.value)}>
            <option value="">— All Parties —</option>
            {parties?.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
          </select>

          {/* Method Filter */}
          <select className="form-input" style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.85rem' }} value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
            <option value="All">— All Methods —</option>
            {methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          {/* Date range */}
          <input type="date" className="form-input" style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.85rem' }} value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
          <input type="date" className="form-input" style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.85rem' }} value={filterToDate} onChange={e => setFilterToDate(e.target.value)} />

          {(filterParty || filterMethod !== 'All' || filterType !== 'All' || filterFromDate || filterToDate) && (
            <button className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
              onClick={() => { setFilterParty(''); setFilterMethod('All'); setFilterType('All'); setFilterFromDate(''); setFilterToDate(''); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Transactions History List */}
      <div className="card">
        {(!filteredTransactions || filteredTransactions.length === 0) ? (
          <div className="empty-state">
            <p>No payment records found matching active filters.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Party</th>
                  <th>Reference / Notes</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(txn => {
                  const party = parties?.find(p => p.id === txn.partyId);
                  const typeColor = txn.type === 'Payment In' ? 'badge-success' : txn.type === 'Expense' ? 'badge-warning' : 'badge-danger';
                  const amtColor = txn.type === 'Payment In' ? 'var(--success)' : txn.type === 'Expense' ? 'var(--warning)' : 'var(--danger)';
                  return (
                    <tr key={txn.id}>
                      <td style={{ fontSize: '0.875rem' }}>{new Date(txn.date).toLocaleDateString('en-IN')}</td>
                      <td>
                        <span className={`badge ${typeColor}`}>{txn.type}</span>
                        {txn.autoRecorded && (
                          <span className="badge badge-secondary" style={{ fontSize: '0.65rem', marginLeft: '0.35rem', padding: '0.1rem 0.35rem' }}>Auto</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{party?.name || (txn.type === 'Expense' ? '—' : '—')}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {txn.reference && <div>Ref: {txn.reference}</div>}
                        {txn.notes}
                      </td>
                      <td style={{ fontSize: '0.875rem' }}>{txn.method}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: amtColor }}>
                        ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {!txn.autoRecorded && (
                          <button className="btn" style={{ padding: '0.25rem', color: 'var(--danger)' }} onClick={() => deletePayment(txn.id)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModal && (
        <Modal title={paymentModal.data.type} onClose={() => setPaymentModal(null)}>
          <form onSubmit={savePayment}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input required type="date" className="form-input" value={paymentModal.data.date} onChange={e => setField('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input required type="number" min="0.01" step="0.01" className="form-input" value={paymentModal.data.amount} onChange={e => setField('amount', e.target.value)} placeholder="0.00" autoFocus />
              </div>
              
              {/* Searchable Contact Dropdown */}
              <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative', marginBottom: '1.25rem' }}>
                <label className="form-label">Party</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Search customer or vendor..."
                    value={showPartyDropdown ? partySearch : (parties?.find(p => p.id === Number(paymentModal.data.partyId))?.name || '')}
                    onChange={e => {
                      setPartySearch(e.target.value);
                      setField('partyId', '');
                      setField('invoiceId', '');
                      setShowPartyDropdown(true);
                    }}
                    onFocus={() => {
                      setPartySearch('');
                      setShowPartyDropdown(true);
                    }}
                    onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
                  />
                  {paymentModal.data.partyId && (
                    <button
                      type="button"
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setField('partyId', '');
                        setField('invoiceId', '');
                        setPartySearch('');
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {showPartyDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginTop: '2px'
                  }}>
                    {parties?.filter(p => {
                      if (!partySearch) return true;
                      return p.name.toLowerCase().includes(partySearch.toLowerCase()) || 
                             (p.phone && p.phone.includes(partySearch));
                    }).map(p => (
                      <div
                        key={p.id}
                        onMouseDown={() => {
                          setField('partyId', p.id.toString());
                          setField('invoiceId', '');
                          setPartySearch(p.name);
                          setShowPartyDropdown(false);
                        }}
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px'
                        }}
                        className="dropdown-item-hover"
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {p.type} {p.phone && ` · 📞 ${p.phone}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Invoice linking */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Link to Invoice (Optional)</label>
                <select className="form-input" value={paymentModal.data.invoiceId} onChange={e => setField('invoiceId', e.target.value)}>
                  <option value="">— No specific invoice —</option>
                  {invoices?.filter(i => String(i.partyId) === String(paymentModal.data.partyId) && (i.status === 'Pending' || i.status === 'Partial')).map(i => (
                    <option key={i.id} value={i.id}>{i.invoiceNumber || `INV-${i.id}`} - ₹{i.total}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Method</label>
                <select className="form-input" value={paymentModal.data.method} onChange={e => setField('method', e.target.value)}>
                  {methods.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reference Number</label>
                <input type="text" className="form-input" value={paymentModal.data.reference} onChange={e => setField('reference', e.target.value)} placeholder="Txn ID, Cheque No..." />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={paymentModal.data.notes} onChange={e => setField('notes', e.target.value)} placeholder="Optional details..." />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPaymentModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Payment</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
