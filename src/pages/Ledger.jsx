import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ArrowLeft, Download, FileText, TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { getParty } from '../api/parties';
import { listInvoicesByParty } from '../api/invoices';
import { listTransactionsByParty } from '../api/transactions';
import { getCompany } from '../api/company';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtINR(n) {
  return '₹' + Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function Ledger() {
  const { partyId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const party = useTable([QK.parties, partyId], () => getParty(partyId), null);
  const allInvoices = useTable([QK.invoices, partyId], () => listInvoicesByParty(partyId));
  const allTransactions = useTable([QK.transactions, partyId], () => listTransactionsByParty(partyId));

  const today = new Date().toISOString().slice(0, 10);
  const threeMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState(threeMonthsAgo);
  const [toDate, setToDate] = useState(today);

  // Combine and sort chronologically
  let entries = [];
  if (allInvoices && allTransactions) {
    const invEntries = allInvoices.filter(inv => inv.status !== 'Draft' && inv.status !== 'Cancelled').map(inv => ({
      id: `inv-${inv.id}`,
      date: inv.date.slice(0, 10),
      type: inv.type === 'Purchase' ? 'Purchase Invoice' : 'Sales Invoice',
      ref: inv.invoiceNumber || `INV-${inv.id}`,
      debit: inv.type === 'Purchase' ? 0 : inv.total,
      credit: inv.type === 'Purchase' ? inv.total : 0,
      status: inv.status
    }));

    const txnEntries = allTransactions.map(txn => ({
      id: `txn-${txn.id}`,
      date: txn.date.slice(0, 10),
      type: txn.type, // 'Payment In' or 'Payment Out'
      ref: txn.reference || `TXN-${txn.id}`,
      debit: txn.type === 'Payment Out' ? txn.amount : 0,
      credit: txn.type === 'Payment In' ? txn.amount : 0,
      status: 'Completed'
    }));

    entries = [...invEntries, ...txnEntries].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Filter by date
  const filtered = entries.filter(e => e.date >= fromDate && e.date <= toDate);

  // Calculate Running Balance
  // Positive = They owe us (Debit Balance)
  // Negative = We owe them (Credit Balance)
  let runningBalance = 0;
  entries.forEach(e => {
    if (e.date < fromDate) {
      runningBalance += (e.debit || 0) - (e.credit || 0);
    }
  });

  const openingBalance = runningBalance;
  let totalDebitPeriod = 0;
  let totalCreditPeriod = 0;

  const displayEntries = filtered.map(e => {
    runningBalance += (e.debit || 0) - (e.credit || 0);
    totalDebitPeriod += e.debit || 0;
    totalCreditPeriod += e.credit || 0;
    return { ...e, balance: runningBalance };
  });

  const closingBalance = runningBalance;

  const downloadPDF = async () => {
    if (!party) return;
    const company = await getCompany() ?? {};
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, L = 14, R = W - 14;

    // Header band
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, W, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ACCOUNT LEDGER STATEMENT', L, 14);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(company.name || 'Your Company', R, 14, { align: 'right' });

    // Party & period info
    let y = 30;
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(party.name, L, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    if (party.gstin) { doc.text(`GSTIN: ${party.gstin}`, L, y); y += 4.5; }
    if (party.phone) { doc.text(`Phone: ${party.phone}`, L, y); y += 4.5; }
    if (party.address) { doc.text(party.address, L, y); y += 4.5; }

    // Period on right
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Statement Period', R - 60, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`From: ${fmtDate(fromDate)}`, R - 60, 35);
    doc.text(`To:   ${fmtDate(toDate)}`, R - 60, 40);

    const sepY = y + 4;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(L, sepY, R, sepY);

    // Invoice table
    const tableHead = [['Date', 'Particulars', 'Ref', 'Debit', 'Credit', 'Balance']];
    const tableBody = [
      [fmtDate(fromDate), 'Opening Balance', '', '', '', fmtINR(openingBalance) + (openingBalance >= 0 ? ' Dr' : ' Cr')],
      ...displayEntries.map(e => [
        fmtDate(e.date),
        e.type,
        e.ref,
        e.debit ? fmtINR(e.debit) : '',
        e.credit ? fmtINR(e.credit) : '',
        fmtINR(e.balance) + (e.balance >= 0 ? ' Dr' : ' Cr')
      ]),
      ['', 'Closing Balance', '', fmtINR(totalDebitPeriod), fmtINR(totalCreditPeriod), fmtINR(closingBalance) + (closingBalance >= 0 ? ' Dr' : ' Cr')]
    ];

    autoTable(doc, {
      startY: sepY + 5,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
      },
      margin: { left: L, right: 14 },
    });

    const footerY = 287;
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.5);
    doc.line(L, footerY, R, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')} · ${company.name || 'BizCRM'}`, W / 2, footerY + 4, { align: 'center' });

    doc.save(`Ledger-${party.name.replace(/\s+/g, '-')}-${fromDate}-to-${toDate}.pdf`);
    toast('Ledger PDF downloaded', 'success');
  };

  if (!party) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
        <p>Party not found.</p>
        <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/crm')}>
          Back to CRM
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/crm')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>{party.name}</h1>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
              Account Ledger — {party.type}
              {party.gstin && <> · GSTIN: <code style={{ fontSize: '0.75rem' }}>{party.gstin}</code></>}
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={downloadPDF} disabled={displayEntries.length === 0 && openingBalance === 0}>
          <Download size={16} /> Download PDF
        </button>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">From Date</label>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">To Date</label>
          <input type="date" className="form-input" style={{ width: 'auto' }} value={toDate} min={fromDate} max={today} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Opening Balance', value: fmtINR(openingBalance) + (openingBalance >= 0 ? ' Dr' : ' Cr'), icon: Clock, color: 'var(--text-muted)', bg: 'var(--bg-color)' },
          { label: 'Period Debit', value: fmtINR(totalDebitPeriod), icon: TrendingUp, color: 'var(--primary)', bg: 'rgba(79,70,229,0.08)' },
          { label: 'Period Credit', value: fmtINR(totalCreditPeriod), icon: TrendingDown, color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Closing Balance', value: fmtINR(closingBalance) + (closingBalance >= 0 ? ' Dr' : ' Cr'), icon: Activity, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: 150, marginBottom: 0, padding: '1rem 1.25rem', borderColor: color + '33' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
              </div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} style={{ color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Ref / Invoice #</th>
                <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--bg-color)' }}>
                <td colSpan="3" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Opening Balance</td>
                <td></td>
                <td></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {fmtINR(openingBalance)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{openingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                </td>
              </tr>
              {displayEntries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{fmtDate(e.date)}</td>
                  <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{e.type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.ref}</td>
                  <td style={{ textAlign: 'right', color: 'var(--primary)' }}>{e.debit ? fmtINR(e.debit) : ''}</td>
                  <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{e.credit ? fmtINR(e.credit) : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmtINR(e.balance)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e.balance >= 0 ? 'Dr' : 'Cr'}</span>
                  </td>
                </tr>
              ))}
              {displayEntries.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No transactions in this period.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ fontWeight: 700, fontSize: '0.875rem', background: 'var(--bg-color)' }}>Totals</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: 'var(--bg-color)' }}>{fmtINR(totalDebitPeriod)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: 'var(--bg-color)' }}>{fmtINR(totalCreditPeriod)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)', fontSize: '1rem', background: 'var(--bg-color)' }}>
                  {fmtINR(closingBalance)} <span style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>{closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
