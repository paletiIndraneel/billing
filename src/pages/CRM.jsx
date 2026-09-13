import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, BookOpen, Clock, Users, Building2 } from 'lucide-react';
import { useEntity } from '../api/useEntity';
import { QK } from '../api/realtime';
import { listParties, createParty, updateParty, deleteParty as apiDeleteParty } from '../api/parties';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { validateGSTIN, validatePhone, validateEmail, isDummyPhone, normalizePhone, normalizeGSTIN } from '../utils/validators';

const EMPTY_PARTY = { name: '', gstin: '', phone: '', address: '', type: 'Customer', email: '', activities: [], gstType: '' };

export default function CRM() {
  const navigate = useNavigate();
  const { rows: parties, create, update, remove } = useEntity(QK.parties, { list: listParties, create: createParty, update: updateParty, remove: apiDeleteParty });

  const [partyModal, setPartyModal] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [delConfirm, setDelConfirm] = useState(false);
  const [newActivity, setNewActivity] = useState('');
  const toast = useToast();

  const set = (field, value) =>
    setPartyModal(m => ({ ...m, data: { ...m.data, [field]: value } }));

  const addActivity = () => {
    if (!newActivity.trim()) return;
    const activities = [{ text: newActivity, date: new Date().toISOString() }, ...(partyModal.data.activities || [])];
    set('activities', activities);
    setNewActivity('');
  };

  const saveParty = async (e) => {
    e.preventDefault();
    const { id, ...data } = partyModal.data;

    const gstinCheck = validateGSTIN(data.gstin);
    if (!gstinCheck.valid) { toast(gstinCheck.message, 'error'); return; }
    const phoneCheck = validatePhone(data.phone);
    if (!phoneCheck.valid) { toast(phoneCheck.message, 'error'); return; }
    const emailCheck = validateEmail(data.email);
    if (!emailCheck.valid) { toast(emailCheck.message, 'error'); return; }

    // Warn on obvious dummy/test phone numbers
    if (isDummyPhone(data.phone)) {
      const proceed = window.confirm(
        `"${data.phone}" looks like a test/placeholder number.\n\nProceed with saving this contact anyway?`
      );
      if (!proceed) return;
    }

    // Duplicate detection: check GSTIN and phone against existing contacts
    try {
      const all = parties;
      const gstinNorm = normalizeGSTIN(data.gstin);
      const phoneNorm = normalizePhone(data.phone);

      const duplicate = all.find(p => {
        if (p.id === id) return false; // skip self on edit
        if (gstinNorm && p.gstin && normalizeGSTIN(p.gstin) === gstinNorm) return true;
        if (phoneNorm.length >= 10 && p.phone && normalizePhone(p.phone) === phoneNorm) return true;
        return false;
      });

      if (duplicate) {
        const field = (gstinNorm && normalizeGSTIN(duplicate.gstin) === gstinNorm) ? 'GSTIN' : 'phone number';
        const proceed = window.confirm(
          `A contact "${duplicate.name}" already exists with the same ${field}.\n\nThis may be a duplicate entry. Save anyway?`
        );
        if (!proceed) return;
      }
    } catch {
      // non-fatal — proceed with save if duplicate check fails
    }

    try {
      if (partyModal.mode === 'add') {
        await create(data);
        toast('Contact added', 'success');
      } else {
        await update(id, data);
        toast('Contact updated', 'success');
      }
      setPartyModal(null);
    } catch {
      toast('Failed to save contact', 'error');
    }
  };

  const deleteParty = async () => {
    await remove(partyModal.data.id);
    setPartyModal(null);
    toast('Contact deleted', 'success');
  };

  const filtered = (parties || []).filter(p => {
    const matchType = typeFilter === 'All' || p.type === typeFilter;
    if (!matchType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.gstin?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q)
    );
  });

  const customers = parties?.filter(p => p.type === 'Customer').length || 0;
  const vendors = parties?.filter(p => p.type === 'Vendor').length || 0;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customers & Vendors</h1>
        <button className="btn btn-primary" onClick={() => { setDelConfirm(false); setPartyModal({ mode: 'add', data: { ...EMPTY_PARTY } }); }}>
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ flex: 1, padding: '0.875rem 1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Customers</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>{customers}</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(79,70,229,0.1)', color: 'var(--primary)' }}>
            <Users size={20} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: '0.875rem 1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Vendors</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)' }}>{vendors}</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>
            <Building2 size={20} />
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: '0.875rem 1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total Contacts</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{parties?.length || 0}</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-muted)' }}>
            <Users size={20} />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: 200 }}>
            <Search size={16} className="search-icon" />
            <input
              className="form-input search-input"
              placeholder="Search by name, phone, GSTIN or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['All', 'Customer', 'Vendor'].map(t => (
              <button key={t} className={`btn ${typeFilter === t ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }}
                onClick={() => setTypeFilter(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Phone</th>
                <th>Email</th>
                <th>GSTIN</th>
                <th>Credit Limit</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(party => (
                <tr key={party.id}>
                  <td style={{ fontWeight: 600 }}>{party.name}</td>
                  <td>
                    <span className={`badge ${party.type === 'Customer' ? 'badge-primary' : 'badge-warning'}`}>
                      {party.type}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{party.phone || '—'}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{party.email || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{party.gstin || '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {party.type === 'Customer' && party.creditLimit > 0 ? (
                      <span style={{ color: 'var(--text-muted)' }}>
                        ₹{(party.creditLimit || 0).toLocaleString('en-IN')}
                        {party.creditDays ? ` / ${party.creditDays}d` : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 180 }}>{party.address || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }}
                        onClick={() => navigate(`/ledger/${party.id}`)} title="View account ledger">
                        <BookOpen size={13} /> Ledger
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }}
                        onClick={() => { setDelConfirm(false); setPartyModal({ mode: 'edit', data: { ...party } }); }}>
                        <Edit2 size={13} /> Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    {search || typeFilter !== 'All' ? 'No results found' : 'No contacts yet. Add your first customer or vendor.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {partyModal && (
        <Modal title={partyModal.mode === 'add' ? 'Add Contact' : 'Edit Contact'} onClose={() => setPartyModal(null)}>
          <form onSubmit={saveParty}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Company / Person Name *</label>
                <input required type="text" className="form-input" value={partyModal.data.name}
                  onChange={e => set('name', e.target.value)} placeholder="Acme Pvt. Ltd." autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={partyModal.data.type} onChange={e => set('type', e.target.value)}>
                  <option value="Customer">Customer</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input type="text" className="form-input" value={partyModal.data.gstin}
                  onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
              </div>
              <div className="form-group">
                <label className="form-label">GST Type</label>
                <select className="form-input" value={partyModal.data.gstType || ''} onChange={e => set('gstType', e.target.value)}>
                  <option value="">Auto-detect (from GSTIN state)</option>
                  <option value="IGST">IGST</option>
                  <option value="CGST_SGST">CGST + SGST</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input" value={partyModal.data.phone}
                  onChange={e => set('phone', e.target.value)} placeholder="9999999999" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={partyModal.data.email || ''}
                  onChange={e => set('email', e.target.value)} placeholder="contact@company.com" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={partyModal.data.address}
                  onChange={e => set('address', e.target.value)} placeholder="City, State, PIN" />
              </div>

              {partyModal.data.type === 'Customer' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Credit Limit (₹)</label>
                    <input type="number" min="0" step="1000" className="form-input"
                      value={partyModal.data.creditLimit ?? ''}
                      onChange={e => set('creditLimit', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="0 = no credit" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Credit Days</label>
                    <input type="number" min="0" max="365" step="1" className="form-input"
                      value={partyModal.data.creditDays ?? ''}
                      onChange={e => set('creditDays', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="e.g. 30" />
                  </div>
                </>
              )}

              <div className="form-group" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={14} /> Notes & Interactions
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input type="text" className="form-input" value={newActivity}
                    onChange={e => setNewActivity(e.target.value)}
                    placeholder="Log a call, meeting, note…"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addActivity())} />
                  <button type="button" className="btn btn-secondary" onClick={addActivity}>Add</button>
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(partyModal.data.activities || []).length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>No notes yet.</div>
                  ) : (
                    (partyModal.data.activities || []).map((act, i) => (
                      <div key={i} style={{ padding: '0.5rem', background: 'var(--bg-color)', borderRadius: 4, fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: 2 }}>{new Date(act.date).toLocaleString('en-IN')}</div>
                        <div>{act.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.75rem', paddingTop: '1rem' }}>
              {partyModal.mode === 'edit' && (
                !delConfirm ? (
                  <button type="button" className="btn btn-danger" onClick={() => setDelConfirm(true)}>
                    <Trash2 size={15} /> Delete
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Delete permanently?</span>
                    <button type="button" className="btn btn-danger" onClick={deleteParty}>Yes</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setDelConfirm(false)}>No</button>
                  </div>
                )
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginLeft: 'auto' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPartyModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {partyModal.mode === 'add' ? 'Add Contact' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
