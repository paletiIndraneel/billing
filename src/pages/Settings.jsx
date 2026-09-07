import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { getCompany, updateCompany } from '../api/company';
import { listParties } from '../api/parties';
import { listProducts } from '../api/products';
import { listInvoices } from '../api/invoices';
import { listInvoiceItems } from '../api/invoiceItems';
import { listLeads } from '../api/leads';
import { listTransactions } from '../api/transactions';
import { listExpenses } from '../api/expenses';
import { listPurchases } from '../api/purchases';
import { Save, Download, Building2, KeyRound, FileSpreadsheet, Shield, Key, RefreshCw } from 'lucide-react';
import { useToast } from '../components/Toast';
import { validateGSTIN, validateIFSC, validatePhone, validateEmail } from '../utils/validators';
import { getSubscription, evaluateAccess, daysRemaining, activateLicense, deactivateSubscription, PLAN_LABELS } from '../lib/subscription';

const INVOICE_THEMES = [
  { key: 'classic', label: 'Classic Blue', color: '#4F46E5' },
  { key: 'green', label: 'Professional Green', color: '#059669' },
  { key: 'dark', label: 'Corporate Dark', color: '#111827' },
];

const TERMS_PRESETS = [
  'Payment due within 30 days of invoice date.',
  'Payment due within 15 days of invoice date.',
  'Payment due on receipt.',
  '50% advance, balance before delivery.',
];

const INVOICE_PREFIXES = ['INV', 'BILL', 'TAX', 'SI', 'PI'];

export default function Settings() {
  const toast = useToast();
  const defaultCompany = {
    name: '', gstin: '', address: '', phone: '', email: '',
    bankName: '', bankAccount: '', bankIFSC: '', upiId: ''
  };
  const [company, setCompany] = useState(defaultCompany);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpSaving, setCpSaving] = useState(false);

  // Invoice settings
  const [invoiceTheme, setInvoiceTheme] = useState('classic');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [defaultTerms, setDefaultTerms] = useState('');

  // Subscription
  const [sub, setSub] = useState(null);
  const [subLicenseKey, setSubLicenseKey] = useState('');
  const [subActivating, setSubActivating] = useState(false);

  useEffect(() => {
    (async () => {
      const [co, subscription] = await Promise.all([getCompany(), getSubscription()]);
      const merged = co ? { ...defaultCompany, ...co, logo: co.logoUrl ?? '', bankIFSC: co.bankIfsc ?? '' } : { ...defaultCompany };
      Object.keys(merged).forEach(k => { if (merged[k] == null) merged[k] = ''; });
      setCompany(merged);
      setInvoiceTheme(localStorage.getItem('lekhya_theme_invoice') || 'classic');
      setInvoicePrefix(co?.invoicePrefix || 'INV');
      setDefaultTerms(co?.defaultTerms || '');
      setSub(subscription);
      setLoaded(true);
    })();
  }, []);

  const set = (field, value) => setCompany(prev => ({ ...prev, [field]: value }));

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCompany(prev => ({ ...prev, logo: dataUrl }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const gstinCheck = validateGSTIN(company.gstin);
    if (!gstinCheck.valid) { toast(gstinCheck.message, 'error'); return; }
    const phoneCheck = validatePhone(company.phone);
    if (!phoneCheck.valid) { toast(phoneCheck.message, 'error'); return; }
    const emailCheck = validateEmail(company.email);
    if (!emailCheck.valid) { toast(emailCheck.message, 'error'); return; }
    const ifscCheck = validateIFSC(company.bankIFSC);
    if (!ifscCheck.valid) { toast(ifscCheck.message, 'error'); return; }
    setSaving(true);
    try {
      await updateCompany({
        name: company.name, gstin: company.gstin, address: company.address, phone: company.phone,
        email: company.email, upiId: company.upiId, logoUrl: company.logo,
        bankName: company.bankName, bankAccount: company.bankAccount, bankIfsc: company.bankIFSC,
        invoicePrefix, defaultTerms,
      });
      localStorage.setItem('lekhya_theme_invoice', invoiceTheme);

      toast('Settings saved successfully!', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (cpNew.length < 8) { toast('New password must be at least 8 characters', 'warning'); return; }
    if (cpNew !== cpConfirm) { toast('Passwords do not match', 'error'); return; }
    setCpSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: cpNew });
      if (error) { toast('Failed to change password: ' + error.message, 'error'); return; }
      toast('Password changed successfully!', 'success');
      setCpNew(''); setCpConfirm('');
    } catch (err) {
      toast('Failed to change password: ' + err.message, 'error');
    } finally {
      setCpSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const [parties, products, invoices, invoiceItemsData, leads, transactions, expenses, purchasesData] = await Promise.all([
        listParties(),
        listProducts(),
        listInvoices(),
        listInvoiceItems(),
        listLeads(),
        listTransactions(),
        listExpenses(),
        listPurchases(),
      ]);

      const wb = XLSX.utils.book_new();
      const flatInvoices = invoices.map(({ lineItems, ...rest }) => ({
        ...rest,
        lineItemsCount: lineItems?.length || 0,
      }));
      const sheets = [
        ['Parties', parties],
        ['Products', products],
        ['Invoices', flatInvoices],
        ['InvoiceItems', invoiceItemsData],
        ['Transactions', transactions],
        ['Expenses', expenses],
        ['Purchases', purchasesData],
        ['Leads', leads],
      ];
      sheets.forEach(([name, data]) => {
        const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}]);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });

      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `nexaura-backup-${date}.xlsx`);

      toast('Full backup exported as Excel (multi-sheet)!', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const [invoices, parties] = await Promise.all([listInvoices(), listParties()]);
      const partyMap = {};
      parties.forEach(p => { partyMap[p.id] = p.name; });

      const header = ['Invoice No', 'Date', 'Due Date', 'Type', 'Party', 'Taxable Amount', 'GST Amount', 'Total', 'Status'];
      const rows = invoices.map(inv => [
        inv.invoiceNumber || `INV-${inv.id}`,
        inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : '',
        inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '',
        inv.type || 'Sales',
        partyMap[inv.partyId] || '',
        (inv.subtotal || 0).toFixed(2),
        (inv.taxAmount || 0).toFixed(2),
        (inv.total || 0).toFixed(2),
        inv.status || 'Pending'
      ]);

      const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Invoices exported to CSV', 'success');
    } catch {
      toast('CSV export failed', 'error');
    }
  };

  const handleExportTally = async () => {
    try {
      const [invoices, parties] = await Promise.all([listInvoices(), listParties()]);
      const partyMap = {};
      parties.forEach(p => { partyMap[p.id] = p; });
      const co = await getCompany() ?? {};

      let xml = `<?xml version="1.0" encoding="utf-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>All Masters</REPORTNAME>\n        <STATICVARIABLES><SVCURRENTCOMPANY>${co.name || 'Company'}</SVCURRENTCOMPANY></STATICVARIABLES>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

      invoices.forEach(inv => {
        const party = partyMap[inv.partyId] || {};
        const dateStr = inv.date ? new Date(inv.date).toISOString().slice(0, 10).replace(/-/g, '') : '';
        const vchType = inv.type === 'Purchase' ? 'Purchase' : 'Sales';
        xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
        xml += `          <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Invoice Voucher View">\n`;
        xml += `            <DATE>${dateStr}</DATE>\n`;
        xml += `            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>\n`;
        xml += `            <VOUCHERNUMBER>${inv.invoiceNumber || `INV-${inv.id}`}</VOUCHERNUMBER>\n`;
        xml += `            <PARTYLEDGERNAME>${party.name || 'Unknown'}</PARTYLEDGERNAME>\n`;
        xml += `            <NARRATION>${inv.notes || ''}</NARRATION>\n`;
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${party.name || 'Unknown'}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${inv.type === 'Sales' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${inv.type === 'Sales' ? '-' : ''}${(inv.total || 0).toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
        xml += `          </VOUCHER>\n`;
        xml += `        </TALLYMESSAGE>\n`;
      });

      xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-import-${new Date().toISOString().split('T')[0]}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Tally XML exported! Import in Tally: Gateway → Import Data → Vouchers', 'success');
    } catch {
      toast('Tally export failed', 'error');
    }
  };

  if (!loaded) return null;

  const sectionTitle = (icon, text) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
      {icon}
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{text}</h2>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      {/* ── Company Info ── */}
      <div className="card">
        {sectionTitle(<Building2 size={20} style={{ color: 'var(--primary)' }} />, 'Company Information')}
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '0.5rem' }}>
              <div style={{
                width: '80px', height: '60px',
                border: '2px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-color)', overflow: 'hidden', flexShrink: 0
              }}>
                {company.logo ? (
                  <img src={company.logo} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No Logo</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" style={{ marginBottom: '0.25rem' }}>Company Logo</label>
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} id="company-logo-input" />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }} onClick={() => document.getElementById('company-logo-input').click()}>
                    Upload Logo
                  </button>
                  {company.logo && (
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => setCompany(prev => ({ ...prev, logo: '' }))}>
                      Remove
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Recommended: Landscape format (JPG/PNG). Image will be resized and compressed.
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input required type="text" className="form-input" value={company.name} onChange={e => set('name', e.target.value)} placeholder="Acme Pvt. Ltd." />
            </div>
            <div className="form-group">
              <label className="form-label">GSTIN</label>
              <input type="text" className="form-input" value={company.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Business Address</label>
              <textarea className="form-input" rows={3} value={company.address} onChange={e => set('address', e.target.value)} placeholder="Full business address including city, state and PIN" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="tel" className="form-input" value={company.phone} onChange={e => set('phone', e.target.value)} placeholder="9999999999" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={company.email} onChange={e => set('email', e.target.value)} placeholder="info@company.com" />
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '1.25rem 0 0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Bank Details (printed on PDF invoices)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Bank Name</label>
              <input type="text" className="form-input" value={company.bankName} onChange={e => set('bankName', e.target.value)} placeholder="State Bank of India" />
            </div>
            <div className="form-group">
              <label className="form-label">Account Number</label>
              <input type="text" className="form-input" value={company.bankAccount} onChange={e => set('bankAccount', e.target.value)} placeholder="000000000000" />
            </div>
            <div className="form-group">
              <label className="form-label">IFSC Code</label>
              <input type="text" className="form-input" value={company.bankIFSC} onChange={e => set('bankIFSC', e.target.value.toUpperCase())} placeholder="SBIN0000000" />
            </div>
            <div className="form-group">
              <label className="form-label">UPI ID <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>(QR printed on invoice)</span></label>
              <input type="text" className="form-input" value={company.upiId || ''} onChange={e => set('upiId', e.target.value)} placeholder="businessname@upi" />
            </div>
          </div>

          {/* Invoice Defaults */}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '1.25rem 0 0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Invoice Defaults
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Invoice Number Prefix</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {INVOICE_PREFIXES.map(p => (
                  <button key={p} type="button" className={`btn ${invoicePrefix === p ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setInvoicePrefix(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <input type="text" className="form-input" value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="INV" maxLength={6} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Preview: {invoicePrefix || 'INV'}-{new Date().getFullYear()}-0001
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Default PDF Theme</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {INVOICE_THEMES.map(({ key, label, color }) => (
                  <button key={key} type="button" onClick={() => setInvoiceTheme(key)}
                    style={{
                      flex: 1, padding: '0.4rem', fontSize: '0.75rem', fontWeight: 600,
                      borderRadius: 6, border: `2px solid ${invoiceTheme === key ? color : 'var(--border)'}`,
                      background: invoiceTheme === key ? color + '18' : 'transparent',
                      color: invoiceTheme === key ? color : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, margin: '0 auto 3px' }} />
                    {label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Default Payment Terms</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {TERMS_PRESETS.map(p => (
                  <button key={p} type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setDefaultTerms(p)}>
                    {p.slice(0, 22)}…
                  </button>
                ))}
              </div>
              <textarea className="form-input" rows={2} value={defaultTerms} onChange={e => setDefaultTerms(e.target.value)} placeholder="Default payment terms printed on every invoice" style={{ resize: 'vertical' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '0.5rem' }}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        </form>
      </div>

      {/* ── Change Password ── */}
      <div className="card">
        {sectionTitle(<KeyRound size={20} style={{ color: 'var(--primary)' }} />, 'Change Password')}
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">New Password *</label>
              <input required type="password" className="form-input" minLength={8} value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Confirm New Password *</label>
              <input required type="password" className="form-input" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} placeholder="Re-enter new password" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={cpSaving} style={{ marginTop: '1rem' }}>
            <KeyRound size={16} /> {cpSaving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* ── Accounting Integration ── */}
      <div className="card">
        {sectionTitle(<FileSpreadsheet size={20} style={{ color: 'var(--primary)' }} />, 'Accounting Integration')}
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Export your transaction data to popular accounting formats for seamless integration with Tally, Excel, or other accounting software.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleExportTally}>
            <Download size={16} /> Export to Tally XML
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <Download size={16} /> Export Invoices (CSV)
          </button>
        </div>
        <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(79,70,229,0.06)', borderRadius: 8, border: '1px solid rgba(79,70,229,0.15)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--primary)' }}>Tally Import:</strong> Open Tally Prime → Gateway of Tally → Import Data → Vouchers → Select the exported XML file.<br />
          <strong style={{ color: 'var(--primary)' }}>CSV:</strong> Can be opened in Excel, Google Sheets, or imported into any accounting software.
        </div>
      </div>

      {/* ── Subscription & License ── */}
      <div className="card">
        {sectionTitle(<Key size={20} style={{ color: '#7c3aed' }} />, 'Subscription & License')}
        {sub ? (() => {
          const access = evaluateAccess(sub);
          const days = daysRemaining(sub);
          const statusColor = access === 'active' ? 'var(--success)' : access === 'trial' ? 'var(--primary)' : access === 'grace' ? 'var(--warning)' : 'var(--danger)';
          const statusLabel = { active: 'Active', trial: 'Free Trial', grace: 'Grace Period', expired: 'Expired' }[access] || access;

          return (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.875rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Plan</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{PLAN_LABELS[sub.plan] || sub.plan}</div>
                </div>
                <div style={{ padding: '0.875rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Status</div>
                  <div style={{ fontWeight: 700, color: statusColor }}>{statusLabel}</div>
                </div>
                <div style={{ padding: '0.875rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {days >= 0 ? 'Days Remaining' : 'Days Overdue'}
                  </div>
                  <div style={{ fontWeight: 700, color: days < 7 ? 'var(--danger)' : 'var(--text-main)' }}>
                    {Math.abs(days)}
                  </div>
                </div>
              </div>

              {sub.licenseKey && (
                <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  License: <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{sub.licenseKey}</span>
                  {' · '}Expires: <strong>{new Date(sub.expiresAt).toLocaleDateString('en-IN')}</strong>
                </div>
              )}

              {access !== 'active' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Activate / Upgrade License Key</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={subLicenseKey}
                      onChange={e => setSubLicenseKey(e.target.value.toUpperCase())}
                      placeholder="LKONE-XXXX-XXXX-XXXX"
                      style={{ fontFamily: 'monospace' }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ whiteSpace: 'nowrap' }}
                      disabled={subActivating || !subLicenseKey.trim()}
                      onClick={async () => {
                        setSubActivating(true);
                        const result = await activateLicense(subLicenseKey);
                        setSubActivating(false);
                        if (result.success) {
                          setSub(result.subscription);
                          setSubLicenseKey('');
                          toast('License activated successfully!', 'success');
                        } else {
                          toast(result.message, 'error');
                        }
                      }}
                    >
                      {subActivating ? <><RefreshCw size={14} className="spinning" /> Activating…</> : <><Key size={14} /> Activate</>}
                    </button>
                  </div>
                </div>
              )}

              {sub.status === 'active' && sub.licenseKey && (
                <button
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)', fontSize: '0.8rem' }}
                  onClick={async () => {
                    if (!window.confirm('Deactivate this license? The app will enter expired state. Your data is not affected.')) return;
                    const updated = await deactivateSubscription();
                    setSub(updated);
                    toast('License deactivated.', 'warning');
                  }}
                >
                  Deactivate License
                </button>
              )}
            </div>
          );
        })() : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading subscription status…</div>
        )}
      </div>

      {/* ── Data Security & Backup ── */}
      <div className="card">
        {sectionTitle(<Shield size={20} style={{ color: 'var(--primary)' }} />, 'Data Security & Backup')}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export Backup (Excel)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { icon: '🔑', title: 'Password Protected', desc: 'App access requires username and password login.' },
            { icon: '💾', title: 'Full Backup', desc: 'Export includes invoices, parties, products, expenses, transactions, and leads.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ padding: '0.875rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{icon} <strong style={{ fontSize: '0.875rem' }}>{title}</strong></div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
