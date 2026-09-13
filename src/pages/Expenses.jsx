import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEntity } from '../api/useEntity';
import { QK } from '../api/realtime';
import { listExpenses, createExpense, updateExpense, deleteExpense as apiDeleteExpense } from '../api/expenses';
import { createTransaction, updateTransaction, deleteTransaction, listTransactionsByExpense } from '../api/transactions';
import { Plus, Trash2, Receipt, TrendingDown, Edit2, Download } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Travel', 'Marketing',
  'Office Supplies', 'Professional Fees', 'Repairs & Maintenance',
  'Insurance', 'Taxes & Fees', 'Entertainment', 'Other'
];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'UPI', 'Credit Card', 'Other'];
const FREQUENCIES = ['One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const RECURRING_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  category: 'Other',
  description: '',
  amount: '',
  paymentMethod: 'Bank Transfer',
  vendorName: '',
  frequency: 'One-time',
};

const CAT_COLORS = {
  'Rent': '#6366F1', 'Utilities': '#8B5CF6', 'Salaries': '#EC4899',
  'Travel': '#F59E0B', 'Marketing': '#10B981', 'Office Supplies': '#3B82F6',
  'Professional Fees': '#06B6D4', 'Repairs & Maintenance': '#F97316',
  'Insurance': '#84CC16', 'Taxes & Fees': '#EF4444',
  'Entertainment': '#A78BFA', 'Other': '#6B7280'
};

function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Expenses() {
  const { rows: expenses, create: createExp, update: updateExp, remove: removeExp } = useEntity(QK.expenses, {
    list: listExpenses, create: createExpense, update: updateExpense, remove: apiDeleteExpense,
  });
  const qc = useQueryClient();

  const [modal, setModal] = useState(null);
  const [filterCat, setFilterCat] = useState('All');
  const [filterFreq, setFilterFreq] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const toast = useToast();

  const openAdd = () => setModal({ ...EMPTY_FORM });
  const openEdit = (exp) => setModal({ ...exp });

  const saveExpense = async (e) => {
    e.preventDefault();
    const data = { ...modal, amount: parseFloat(modal.amount) };
    if (!data.amount || data.amount <= 0) { toast('Enter a valid amount', 'warning'); return; }
    const txnNote = `${data.category}${data.description ? ': ' + data.description : ''}`;
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await updateExp(id, {
          date: rest.date, category: rest.category, amount: rest.amount,
          paymentMethod: rest.paymentMethod, vendorName: rest.vendorName, description: rest.description,
          frequency: rest.frequency,
        });
        const linked = (await listTransactionsByExpense(id))[0];
        if (linked) {
          await updateTransaction(linked.id, {
            date: rest.date, amount: rest.amount,
            method: rest.paymentMethod, notes: txnNote,
          });
          qc.invalidateQueries({ queryKey: [QK.transactions] });
        }
        toast('Expense updated', 'success');
      } else {
        const exp = await createExp({
          date: data.date, category: data.category, amount: data.amount,
          paymentMethod: data.paymentMethod, vendorName: data.vendorName, description: data.description,
          frequency: data.frequency,
        });
        await createTransaction({
          date: data.date,
          partyId: null,
          expenseId: exp.id,
          type: 'Expense',
          amount: data.amount,
          method: data.paymentMethod,
          reference: null,
          notes: txnNote,
          autoRecorded: true,
        });
        qc.invalidateQueries({ queryKey: [QK.transactions] });
        toast('Expense added', 'success');
      }
      setModal(null);
    } catch {
      toast('Failed to save expense', 'error');
    }
  };

  const deleteExpense = async (id) => {
    await removeExp(id);
    const linked = (await listTransactionsByExpense(id))[0];
    if (linked) {
      await deleteTransaction(linked.id);
      qc.invalidateQueries({ queryKey: [QK.transactions] });
    }
    setConfirmDeleteId(null);
    toast('Expense deleted', 'success');
  };

  let filtered = expenses || [];
  if (filterCat !== 'All') filtered = filtered.filter(e => e.category === filterCat);
  if (filterFreq !== 'All') filtered = filtered.filter(e => (e.frequency || 'One-time') === filterFreq);
  if (dateFrom) filtered = filtered.filter(e => e.date >= dateFrom);
  if (dateTo) filtered = filtered.filter(e => e.date <= dateTo);

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const recurringAmount = filtered.filter(e => RECURRING_FREQUENCIES.includes(e.frequency)).reduce((s, e) => s + (e.amount || 0), 0);
  const oneOffAmount = totalAmount - recurringAmount;

  const catTotals = {};
  filtered.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
  });
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('EXPENSE REPORT', 14, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const period = (dateFrom || dateTo) ? `${dateFrom || 'Start'} to ${dateTo || 'Now'}` : 'All Time';
    doc.text(`Period: ${period}  |  Generated: ${new Date().toLocaleDateString('en-IN')}`, 196, 12, { align: 'right' });

    let y = 26;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Expenses: ${fmtINR(totalAmount)}   |   ${filtered.length} records`, 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Frequency', 'Description', 'Vendor', 'Payment Mode', 'Amount (₹)']],
      body: filtered.map(e => [
        fmtDate(e.date), e.category, e.frequency || 'One-time', e.description || '—',
        e.vendorName || '—', e.paymentMethod,
        (e.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]),
      headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 6: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    const afterTable = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Summary by Category', 14, afterTable);
    autoTable(doc, {
      startY: afterTable + 4,
      head: [['Category', 'Amount (₹)', '% of Total']],
      body: sortedCats.map(([cat, amt]) => [
        cat,
        amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) + '%' : '0%'
      ]),
      headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    doc.save(`expense-report-${new Date().toISOString().split('T')[0]}.pdf`);
    toast('PDF exported', 'success');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Expense Tracking</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={exportPDF} disabled={filtered.length === 0}>
            <Download size={15} /> Export PDF
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Expenses</div>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--danger)' }}>{fmtINR(totalAmount)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{filtered.length} records</div>
        </div>
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid #8B5CF6' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recurring (Weekly+)</div>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#8B5CF6' }}>{fmtINR(recurringAmount)}</div>
        </div>
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>One-time / Daily</div>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#F59E0B' }}>{fmtINR(oneOffAmount)}</div>
        </div>
        {sortedCats.slice(0, 4).map(([cat, amt]) => (
          <div key={cat} className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: `4px solid ${CAT_COLORS[cat] || '#6B7280'}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: CAT_COLORS[cat] || '#6B7280' }}>{fmtINR(amt)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) : 0}% of total
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={filterFreq} onChange={e => setFilterFreq(e.target.value)}>
            <option value="All">All Frequencies</option>
            {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
          </select>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>to</span>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          {(filterCat !== 'All' || filterFreq !== 'All' || dateFrom || dateTo) && (
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { setFilterCat('All'); setFilterFreq('All'); setDateFrom(''); setDateTo(''); }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Expense table */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Receipt size={48} className="empty-state-icon" />
            <p>No expenses recorded{filterCat !== 'All' || filterFreq !== 'All' || dateFrom || dateTo ? ' for the selected filters' : ' yet'}.</p>
            <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={openAdd}>
              <Plus size={15} /> Add First Expense
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Frequency</th>
                  <th>Description</th>
                  <th>Vendor / Payee</th>
                  <th>Payment Mode</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(exp => {
                  const isConfirmDel = confirmDeleteId === exp.id;
                  return (
                    <tr key={exp.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{fmtDate(exp.date)}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 4,
                          fontSize: '0.75rem', fontWeight: 600,
                          background: (CAT_COLORS[exp.category] || '#6B7280') + '20',
                          color: CAT_COLORS[exp.category] || '#6B7280'
                        }}>
                          {exp.category}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{exp.frequency || 'One-time'}</td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 200 }}>{exp.description || '—'}</td>
                      <td style={{ fontSize: '0.875rem' }}>{exp.vendorName || '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{exp.paymentMethod}</td>
                      <td style={{ fontWeight: 700, color: 'var(--danger)', textAlign: 'right' }}>{fmtINR(exp.amount)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          {isConfirmDel ? (
                            <>
                              <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => deleteExpense(exp.id)}>Yes</button>
                              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => openEdit(exp)} title="Edit"><Edit2 size={13} /></button>
                              <button className="btn" style={{ padding: '0.3rem 0.5rem', color: 'var(--danger)' }} onClick={() => setConfirmDeleteId(exp.id)} title="Delete"><Trash2 size={13} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" style={{ fontWeight: 600, paddingTop: '0.75rem', borderTop: '2px solid var(--border)', fontSize: '0.875rem' }}>
                    Total ({filtered.length} expenses)
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--danger)', paddingTop: '0.75rem', borderTop: '2px solid var(--border)', textAlign: 'right', fontSize: '1rem' }}>
                    {fmtINR(totalAmount)}
                  </td>
                  <td style={{ borderTop: '2px solid var(--border)' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {sortedCats.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Breakdown by Category</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {sortedCats.map(([cat, amt]) => {
              const pct = totalAmount > 0 ? (amt / totalAmount) * 100 : 0;
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 500 }}>{cat}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtINR(amt)} <span style={{ fontSize: '0.75rem' }}>({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: CAT_COLORS[cat] || '#6B7280', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal !== null && (
        <Modal title={modal.id ? 'Edit Expense' : 'Add Expense'} onClose={() => setModal(null)}>
          <form onSubmit={saveExpense}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input required type="date" className="form-input" value={modal.date}
                  onChange={e => setModal(m => ({ ...m, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select required className="form-input" value={modal.category}
                  onChange={e => setModal(m => ({ ...m, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Description</label>
                <input type="text" className="form-input" value={modal.description}
                  onChange={e => setModal(m => ({ ...m, description: e.target.value }))}
                  placeholder="Brief description of expense" />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (₹) *</label>
                <input required type="number" min="0.01" step="0.01" className="form-input"
                  value={modal.amount} onChange={e => setModal(m => ({ ...m, amount: e.target.value }))}
                  placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Frequency</label>
                <select className="form-input" value={modal.frequency || 'One-time'}
                  onChange={e => setModal(m => ({ ...m, frequency: e.target.value }))}>
                  {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-input" value={modal.paymentMethod}
                  onChange={e => setModal(m => ({ ...m, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Vendor / Payee Name</label>
                <input type="text" className="form-input" value={modal.vendorName}
                  onChange={e => setModal(m => ({ ...m, vendorName: e.target.value }))}
                  placeholder="Who was paid?" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">
                <TrendingDown size={15} /> {modal.id ? 'Update Expense' : 'Add Expense'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
