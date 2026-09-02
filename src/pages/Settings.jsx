import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db, getSetting, setSetting, verifyUser, updateUserPassword } from '../db/db';
import { supabase } from '../lib/supabase';
import { Save, Download, Upload, Trash2, Building2, Database, KeyRound, Palette, FileSpreadsheet, Shield, Smartphone, Cloud, CloudUpload, CloudDownload, CheckCircle, XCircle, Key, RefreshCw } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { validateGSTIN, validateIFSC, validatePhone, validateEmail } from '../utils/validators';
import { getSubscription, evaluateAccess, daysRemaining, activateLicense, deactivateSubscription, PLAN_LABELS, TRIAL_DAYS } from '../lib/subscription';

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

  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpSaving, setCpSaving] = useState(false);

  // Invoice settings
  const [invoiceTheme, setInvoiceTheme] = useState('classic');
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [defaultTerms, setDefaultTerms] = useState('');

  // Backup tracking
  const [lastBackup, setLastBackup] = useState(null);

  // Google Drive
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveEmail, setGdriveEmail] = useState('');
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveSyncing, setGdriveSyncing] = useState(false);
  const [gdriveLastSync, setGdriveLastSync] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearing, setClearing] = useState(false);

  // Excel import modal state
  const [xlsImport, setXlsImport] = useState(null); // { headers, rows, targetTable, mapping }
  const [xlsImporting, setXlsImporting] = useState(false);

  // Subscription
  const [sub, setSub] = useState(null);
  const [subLicenseKey, setSubLicenseKey] = useState('');
  const [subActivating, setSubActivating] = useState(false);

  const isElectron = !!window.electron?.isElectron;

  useEffect(() => {
    Promise.all([
      getSetting('company', defaultCompany),
      getSetting('invoiceTheme', 'classic'),
      getSetting('invoicePrefix', 'INV'),
      getSetting('defaultTerms', ''),
      getSetting('lastBackupDate', null),
      getSetting('gdriveLastSync', null),
      getSubscription(),
    ]).then(([comp, theme, prefix, terms, backup, lastSync, subscription]) => {
      setCompany(comp || defaultCompany);
      setInvoiceTheme(theme || 'classic');
      setInvoicePrefix(prefix || 'INV');
      setDefaultTerms(terms || '');
      setLastBackup(backup);
      setGdriveLastSync(lastSync);
      setSub(subscription);
      setLoaded(true);
    });

    // Load Google Drive connection state
    if (window.electron?.gdrive) {
      window.electron.gdrive.getTokens().then(async (tokens) => {
        if (!tokens) return;
        setGdriveConnected(true);
        setGdriveClientId(tokens.clientId || '');
        try {
          const token = await gdriveGetValidToken(tokens);
          const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json());
          if (info.email) setGdriveEmail(info.email);
        } catch { /* ignore — offline */ }
      });
    }
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
      await Promise.all([
        setSetting('company', company),
        setSetting('invoiceTheme', invoiceTheme),
        setSetting('invoicePrefix', invoicePrefix),
        setSetting('defaultTerms', defaultTerms),
      ]);

      // Sync company info to Supabase if connected
      const companyId = localStorage.getItem('lekhya_company_id');
      if (companyId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { error } = await supabase.from('companies').update({
            name: company.name,
            gstin: company.gstin || null,
            address: company.address || null,
            phone: company.phone || null,
            email: company.email || null,
          }).eq('id', companyId);
          if (error) console.error('[Settings] Supabase company sync error:', error.message);
        }
      }

      toast('Settings saved successfully!', 'success');
    } catch {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (cpNew.length < 6) { toast('New password must be at least 6 characters', 'warning'); return; }
    if (cpNew !== cpConfirm) { toast('Passwords do not match', 'error'); return; }
    setCpSaving(true);
    try {
      const stored = localStorage.getItem('lekhya_session') || localStorage.getItem('bizcrm_session');
      const session = stored ? JSON.parse(stored) : null;
      if (!session?.username) { toast('Session expired. Please log in again.', 'error'); return; }
      const user = await verifyUser(session.username, cpCurrent);
      if (!user) { toast('Current password is incorrect', 'error'); return; }
      await updateUserPassword(user.id, cpNew);
      toast('Password changed successfully!', 'success');
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
    } catch (err) {
      toast('Failed to change password: ' + err.message, 'error');
    } finally {
      setCpSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const [parties, products, invoices, invoiceItemsData, leads, transactions, expenses, purchasesData] = await Promise.all([
        db.parties.toArray(),
        db.products.toArray(),
        db.invoices.toArray(),
        db.invoiceItems.toArray(),
        db.leads.toArray(),
        db.transactions.toArray(),
        db.expenses.toArray(),
        db.purchases.toArray(),
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
      XLSX.writeFile(wb, `lekhya-backup-${date}.xlsx`);

      const now = new Date().toISOString();
      await setSetting('lastBackupDate', now);
      setLastBackup(now);
      toast('Full backup exported as Excel (multi-sheet)!', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  };

  const TABLE_SCHEMAS = {
    parties:      ['name', 'type', 'gstin', 'phone', 'email', 'address'],
    products:     ['name', 'hsn', 'unit', 'basePrice', 'margin', 'gstRate', 'currentStock', 'reorderPoint', 'description'],
    invoices:     ['invoiceNumber', 'type', 'date', 'dueDate', 'status', 'subtotal', 'taxAmount', 'total', 'notes'],
    expenses:     ['date', 'category', 'amount', 'vendor', 'description'],
    transactions: ['date', 'type', 'amount', 'method', 'reference', 'notes'],
    leads:        ['name', 'phone', 'email', 'source', 'status', 'notes'],
    purchases:    ['date', 'qty', 'purchasePrice', 'notes'],
  };

  const handleXlsImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        const targetTable = 'parties';
        const dbCols = TABLE_SCHEMAS[targetTable];
        const autoMap = {};
        headers.forEach(h => {
          const match = dbCols.find(c => c.toLowerCase() === h.toLowerCase());
          if (match) autoMap[h] = match;
          else autoMap[h] = '';
        });
        setXlsImport({ headers, rows, targetTable, mapping: autoMap });
      } catch (err) {
        toast('Could not read file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleXlsImportExecute = async () => {
    if (!xlsImport) return;
    setXlsImporting(true);
    try {
      const { rows, targetTable, mapping } = xlsImport;
      const table = db[targetTable];
      if (!table) throw new Error(`Unknown table: ${targetTable}`);
      const records = rows.map(row => {
        const rec = {};
        Object.entries(mapping).forEach(([csvCol, dbCol]) => {
          if (dbCol) rec[dbCol] = row[csvCol];
        });
        return rec;
      }).filter(r => Object.keys(r).length > 0);
      await table.bulkPut(records);
      toast(`Imported ${records.length} records into ${targetTable}`, 'success');
      setXlsImport(null);
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    } finally {
      setXlsImporting(false);
    }
  };

  const restoreFromJSON = async (jsonContent) => {
    const data = JSON.parse(jsonContent);
    if (!data.exportedAt) throw new Error('Not a valid Lekhya One backup file');
    await db.transaction('rw', db.parties, db.products, db.invoices, db.invoiceItems, db.leads, db.transactions, db.expenses, db.purchases, db.settings, async () => {
      if (data.parties?.length) await db.parties.bulkPut(data.parties);
      if (data.products?.length) await db.products.bulkPut(data.products);
      if (data.invoices?.length) await db.invoices.bulkPut(data.invoices);
      if (data.invoiceItems?.length) await db.invoiceItems.bulkPut(data.invoiceItems);
      if (data.leads?.length) await db.leads.bulkPut(data.leads);
      if (data.transactions?.length) await db.transactions.bulkPut(data.transactions);
      if (data.expenses?.length) await db.expenses.bulkPut(data.expenses);
      if (data.purchases?.length) await db.purchases.bulkPut(data.purchases);
      if (data.settings?.length) await db.settings.bulkPut(data.settings);
    });
    const counts = [
      data.parties?.length && `${data.parties.length} contacts`,
      data.products?.length && `${data.products.length} products`,
      data.invoices?.length && `${data.invoices.length} invoices`,
    ].filter(Boolean).join(', ');
    toast(`Restored: ${counts || 'all records'}.`, 'success');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await restoreFromJSON(ev.target.result);
      } catch (err) {
        toast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportElectron = async () => {
    try {
      const content = await window.electron.backup.open();
      if (!content) return;
      await restoreFromJSON(content);
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const invoices = await db.invoices.toArray();
      const parties = await db.parties.toArray();
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
      const invoices = await db.invoices.toArray();
      const parties = await db.parties.toArray();
      const partyMap = {};
      parties.forEach(p => { partyMap[p.id] = p; });
      const co = await getSetting('company', {});

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

  const handleClearData = async () => {
    setShowClearModal(true);
    setClearPassword('');
  };

  const executeClearAllData = async (password) => {
    setClearing(true);
    try {
      const stored = localStorage.getItem('lekhya_session') || localStorage.getItem('bizcrm_session');
      const session = stored ? JSON.parse(stored) : null;
      if (!session?.username) {
        toast('Session expired. Please log in again.', 'error');
        setClearing(false);
        return;
      }
      const user = await verifyUser(session.username, password);
      if (!user) {
        toast('Incorrect password. Access denied.', 'error');
        setClearing(false);
        return;
      }

      // Password matches! Step 1: Export all data to local machine
      const [parties, products, invoices, invoiceItemsData, leads, transactions, expenses, purchasesData, settingsData] = await Promise.all([
        db.parties.toArray(),
        db.products.toArray(),
        db.invoices.toArray(),
        db.invoiceItems.toArray(),
        db.leads.toArray(),
        db.transactions.toArray(),
        db.expenses.toArray(),
        db.purchases.toArray(),
        db.settings.toArray(),
      ]);
      const data = {
        parties, products, invoices,
        invoiceItems: invoiceItemsData,
        leads, transactions, expenses,
        purchases: purchasesData,
        settings: settingsData,
        exportedAt: new Date().toISOString(),
        version: 4,
        appVersion: window.electron?.appVersion || '1.0.0',
      };
      const jsonContent = JSON.stringify(data, null, 2);

      // Trigger automatic backup download
      if (isElectron && window.electron?.backup) {
        await window.electron.backup.save(jsonContent);
      } else {
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lekhya-backup-before-clear-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // Step 2: Delete all local tables
      await db.transaction('rw', db.invoices, db.parties, db.products, db.leads, db.transactions, db.expenses, db.purchases, db.invoiceItems, async () => {
        await db.invoices.clear();
        await db.parties.clear();
        await db.products.clear();
        await db.leads.clear();
        await db.transactions.clear();
        await db.expenses.clear();
        await db.purchases.clear();
        await db.invoiceItems.clear();
      });
      await setSetting('invoiceSeq', 0);

      // Step 3: Hard-delete all records from Supabase
      const companyId = localStorage.getItem('lekhya_company_id');
      if (companyId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const cloudTables = ['parties', 'products', 'invoices', 'invoice_items', 'transactions', 'expenses', 'purchases'];
          await Promise.all(
            cloudTables.map(tbl =>
              supabase.from(tbl).delete().eq('company_id', companyId)
                .then(({ error }) => { if (error) console.error(`[Clear] Supabase delete error on ${tbl}:`, error.message); })
            )
          );
        }
      }

      toast('Full backup exported and all data cleared successfully!', 'warning');
      setShowClearModal(false);
    } catch (err) {
      toast('Failed to clear data: ' + err.message, 'error');
    } finally {
      setClearing(false);
    }
  };

  // ── Google Drive helpers ────────────────────────────────────────

  async function gdriveGetValidToken(tokens) {
    if (!tokens) throw new Error('Not connected to Google Drive');
    if (Date.now() < tokens.expiry_date - 60000) return tokens.access_token;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: tokens.clientId,
        client_secret: tokens.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const refreshed = await res.json();
    if (refreshed.error) throw new Error(refreshed.error_description || refreshed.error);
    const updated = {
      ...tokens,
      access_token: refreshed.access_token,
      expires_in: refreshed.expires_in,
      expiry_date: Date.now() + (refreshed.expires_in || 3600) * 1000,
    };
    await window.electron.gdrive.saveTokens(updated);
    return updated.access_token;
  }

  async function gdriveFindBackup(accessToken) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='lekhya-backup.json' and trashed=false")}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return data.files?.[0] || null;
  }

  const handleGDriveConnect = async () => {
    if (!gdriveClientId.trim() || !gdriveClientSecret.trim()) {
      toast('Please enter both Client ID and Client Secret', 'warning');
      return;
    }
    setGdriveConnecting(true);
    try {
      const tokens = await window.electron.gdrive.startAuth({
        clientId: gdriveClientId.trim(),
        clientSecret: gdriveClientSecret.trim(),
      });
      setGdriveConnected(true);
      setGdriveClientSecret('');
      const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then(r => r.json());
      if (info.email) setGdriveEmail(info.email);
      toast('Connected to Google Drive successfully!', 'success');
    } catch (err) {
      toast(`Google Drive connection failed: ${err.message}`, 'error');
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGDriveDisconnect = async () => {
    if (!window.confirm('Disconnect from Google Drive? Your local data will not be affected.')) return;
    await window.electron.gdrive.clearTokens();
    setGdriveConnected(false);
    setGdriveEmail('');
    setGdriveClientId('');
    setGdriveClientSecret('');
    toast('Disconnected from Google Drive', 'warning');
  };

  const handleGDriveUpload = async () => {
    setGdriveSyncing(true);
    try {
      const tokens = await window.electron.gdrive.getTokens();
      const accessToken = await gdriveGetValidToken(tokens);

      const [parties, products, invoices, invoiceItemsData, leads, transactions, expenses, purchasesData, settingsData] = await Promise.all([
        db.parties.toArray(), db.products.toArray(), db.invoices.toArray(),
        db.invoiceItems.toArray(), db.leads.toArray(), db.transactions.toArray(),
        db.expenses.toArray(), db.purchases.toArray(), db.settings.toArray(),
      ]);
      const backupData = {
        parties, products, invoices,
        invoiceItems: invoiceItemsData,
        leads, transactions, expenses,
        purchases: purchasesData,
        settings: settingsData,
        exportedAt: new Date().toISOString(), version: 4,
        appVersion: window.electron?.appVersion || '1.0.0',
      };
      const content = JSON.stringify(backupData, null, 2);
      const existing = await gdriveFindBackup(accessToken);
      const metadata = JSON.stringify({ name: 'lekhya-backup.json', mimeType: 'application/json' });
      const boundary = 'Lekhya_boundary_XYZ';
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error.message);

      const now = new Date().toISOString();
      await setSetting('gdriveLastSync', now);
      await setSetting('lastBackupDate', now);
      setGdriveLastSync(now);
      setLastBackup(now);
      toast('Backup uploaded to Google Drive!', 'success');
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setGdriveSyncing(false);
    }
  };

  const handleGDriveImport = async () => {
    if (!window.confirm('This will merge data from your Google Drive backup into the current app. Existing records will be updated. Continue?')) return;
    setGdriveSyncing(true);
    try {
      const tokens = await window.electron.gdrive.getTokens();
      const accessToken = await gdriveGetValidToken(tokens);
      const file = await gdriveFindBackup(accessToken);
      if (!file) { toast('No backup found on Google Drive. Upload one first.', 'warning'); return; }

      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (!data.parties && !data.invoices) throw new Error('Invalid backup file format');

      await restoreFromJSON(JSON.stringify(data));
      toast('Data imported from Google Drive successfully!', 'success');
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error');
    } finally {
      setGdriveSyncing(false);
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Current Password *</label>
              <input required type="password" className="form-input" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} placeholder="Current password" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">New Password *</label>
              <input required type="password" className="form-input" minLength={6} value={cpNew} onChange={e => setCpNew(e.target.value)} placeholder="At least 6 characters" />
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

      {/* ── Multi-Device Access ── */}
      <div className="card">
        {sectionTitle(<Smartphone size={20} style={{ color: 'var(--primary)' }} />, 'Multi-Device Access')}
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Lekhya One stores data locally on your device. To use it on multiple devices, export a backup from one device and import it on the other.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Step 1: Export on Device A</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click "Export Full Backup" below to download all your data as a JSON file.</div>
          </div>
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Step 2: Import on Device B</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Transfer the JSON file and click "Import Backup" on the other device.</div>
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.75rem', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', marginBottom: '1rem' }}>
          <strong style={{ color: 'var(--success)' }}>PWA Support:</strong> Install Lekhya One as an app on any device browser (Chrome/Edge: "Add to Home Screen" or "Install App") for a native-like experience.
        </div>
      </div>

      {/* ── Google Drive Sync ── */}
      <div className="card">
        {sectionTitle(<Cloud size={20} style={{ color: '#4285F4' }} />, 'Google Drive Sync')}

        {!isElectron ? (
          <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--warning)' }}>Desktop App Only:</strong> Google Drive sync is available in the Electron desktop app. Use the manual export/import below when running in a browser.
          </div>
        ) : gdriveConnected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.875rem 1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
              <CheckCircle size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Connected to Google Drive</div>
                {gdriveEmail && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{gdriveEmail}</div>}
                {gdriveLastSync && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Last sync: {new Date(gdriveLastSync).toLocaleString('en-IN')}</div>}
              </div>
              <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={handleGDriveDisconnect}>
                <XCircle size={14} /> Disconnect
              </button>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleGDriveUpload} disabled={gdriveSyncing}>
                <CloudUpload size={16} /> {gdriveSyncing ? 'Uploading…' : 'Upload Backup to Drive'}
              </button>
              <button className="btn btn-secondary" onClick={handleGDriveImport} disabled={gdriveSyncing}>
                <CloudDownload size={16} /> {gdriveSyncing ? 'Importing…' : 'Import from Drive'}
              </button>
            </div>
            <div style={{ marginTop: '0.875rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              The backup is saved as <strong>lekhya-backup.json</strong> in your Google Drive. Use "Upload" to push your current data to Drive, and "Import" to pull it back (e.g., on another device).
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Connect your Google account to sync backups directly to Google Drive. You need a <strong>Google Cloud OAuth 2.0 Client ID</strong> (free) — create one at <strong>console.cloud.google.com</strong>.
            </p>
            <div style={{ padding: '0.875rem', background: 'rgba(66,133,244,0.06)', border: '1px solid rgba(66,133,244,0.2)', borderRadius: 8, fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.8 }}>
              <strong style={{ color: '#4285F4' }}>Setup (one time):</strong><br />
              1. Go to <strong>console.cloud.google.com</strong> → New Project<br />
              2. APIs &amp; Services → Enable <strong>Google Drive API</strong><br />
              3. Credentials → Create OAuth 2.0 Client ID → select <strong>Desktop app</strong><br />
              4. Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> below
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Client ID</label>
                <input
                  type="text" className="form-input"
                  value={gdriveClientId}
                  onChange={e => setGdriveClientId(e.target.value)}
                  placeholder="xxxxx.apps.googleusercontent.com"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Client Secret</label>
                <input
                  type="password" className="form-input"
                  value={gdriveClientSecret}
                  onChange={e => setGdriveClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleGDriveConnect} disabled={gdriveConnecting}>
              <Cloud size={16} /> {gdriveConnecting ? 'Opening browser…' : 'Connect to Google Drive'}
            </button>
            <div style={{ marginTop: '0.625rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Your browser will open for Google sign-in. Return to Lekhya One after authorizing.
            </div>
          </div>
        )}
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

        {lastBackup && (
          <div style={{ marginBottom: '1rem', padding: '0.625rem 1rem', background: 'rgba(16,185,129,0.08)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Last backup: <strong style={{ color: 'var(--success)' }}>{new Date(lastBackup).toLocaleString('en-IN')}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export Backup (Excel)
          </button>
          {isElectron && window.electron?.backup ? (
            <button className="btn btn-secondary" onClick={handleImportElectron}>
              <Upload size={16} /> Restore from JSON
            </button>
          ) : (
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              <Upload size={16} /> Restore from JSON
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          )}
          <label className="btn btn-secondary" style={{ cursor: 'pointer', color: 'var(--success)' }}>
            <FileSpreadsheet size={16} /> Import from Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleXlsImportFile} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-danger" onClick={handleClearData}>
            <Trash2 size={16} /> Clear All Data
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { icon: '🔒', title: 'Local Storage', desc: 'All data stays on your device. Nothing is sent to any server.' },
            { icon: '🔑', title: 'Password Protected', desc: 'App access requires username and password login.' },
            { icon: '💾', title: 'Full Backup', desc: 'Export includes invoices, parties, products, expenses, transactions, and leads.' },
            { icon: '📲', title: 'Offline First', desc: 'Works completely offline — no internet connection required.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ padding: '0.875rem', background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{icon} <strong style={{ fontSize: '0.875rem' }}>{title}</strong></div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0.875rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--warning)' }}>Recommendation:</strong> Export a backup at least once a week and store it in a cloud storage service (Google Drive, OneDrive, etc.) to prevent data loss.
        </div>
      </div>
      {/* ── Excel / CSV Import Modal ── */}
      {xlsImport && (
        <Modal title="Import from Excel / CSV" onClose={() => setXlsImport(null)} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Table selector */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Import into Table</label>
              <select
                className="form-input"
                value={xlsImport.targetTable}
                onChange={e => {
                  const tbl = e.target.value;
                  const dbCols = TABLE_SCHEMAS[tbl];
                  const autoMap = {};
                  xlsImport.headers.forEach(h => {
                    const match = dbCols.find(c => c.toLowerCase() === h.toLowerCase());
                    autoMap[h] = match || '';
                  });
                  setXlsImport(prev => ({ ...prev, targetTable: tbl, mapping: autoMap }));
                }}
              >
                {Object.keys(TABLE_SCHEMAS).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Field mapping */}
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Column Mapping — {xlsImport.rows.length} rows detected
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {xlsImport.headers.map(h => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 500, padding: '0.375rem 0.625rem', background: 'var(--bg-color)', borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>
                      {h}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>→</span>
                    <select
                      className="form-input"
                      style={{ flex: 1, padding: '0.375rem 0.5rem', fontSize: '0.8rem' }}
                      value={xlsImport.mapping[h] || ''}
                      onChange={e => setXlsImport(prev => ({ ...prev, mapping: { ...prev.mapping, [h]: e.target.value } }))}
                    >
                      <option value="">— skip —</option>
                      {TABLE_SCHEMAS[xlsImport.targetTable].map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview first 3 rows */}
            {xlsImport.rows.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Preview (first 3 rows)
                </div>
                <div className="table-container" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>{xlsImport.headers.map(h => <th key={h} style={{ fontSize: '0.75rem' }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {xlsImport.rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {xlsImport.headers.map(h => (
                            <td key={h} style={{ fontSize: '0.75rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => setXlsImport(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleXlsImportExecute} disabled={xlsImporting}>
              {xlsImporting ? 'Importing…' : `Import ${xlsImport.rows.length} Rows into ${xlsImport.targetTable}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Clear Data Password Modal ── */}
      {showClearModal && (
        <Modal title="Clear All Data" onClose={() => setShowClearModal(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            await executeClearAllData(clearPassword);
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                ⚠️ <strong style={{ color: 'var(--danger)' }}>WARNING:</strong> This will permanently delete all invoices, contacts, products, transactions, expenses, and leads. This action cannot be undone!
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Before deleting, the system will **automatically generate and download a full backup file** (`.json`) to your machine.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Enter Account Password to Confirm</label>
                <input
                  required
                  type="password"
                  className="form-input"
                  placeholder="Your account password"
                  value={clearPassword || ''}
                  onChange={e => setClearPassword(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowClearModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-danger" disabled={clearing || !clearPassword}>
                {clearing ? 'Exporting & Clearing…' : 'Backup & Clear All Data'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
