import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, getNextInvoiceNumber } from '../db/db';
import { adjustStock } from '../services/stockService';
import { Download, Plus, Trash2, Eye, FileText, CheckCircle, List, Bell, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';

// ─── helpers ──────────────────────────────────────────────────────────────────

function amountToWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function toWords(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (ones[n % 10] ? ' ' + ones[n % 10] : '') + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + toWords(n % 100);
    if (n < 100000) return toWords(Math.floor(n / 1000)) + 'Thousand ' + toWords(n % 1000);
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + 'Lakh ' + toWords(n % 100000);
    return toWords(Math.floor(n / 10000000)) + 'Crore ' + toWords(n % 10000000);
  }
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = 'INR ' + (toWords(rupees).trim() || 'Zero') + ' Rupees';
  if (paise > 0) words += ' and ' + toWords(paise).trim() + ' Paise';
  return words + ' Only';
}

function fmtDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// Returns first 2 digits of GSTIN (state code). Returns null if GSTIN is absent/invalid.
function getStateCode(gstin) {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

// ─── Invoice Themes ───────────────────────────────────────────────────────────

const INVOICE_THEMES = {
  classic: {
    name: 'Classic Blue',
    primary: [79, 70, 229],
    headerText: [255, 255, 255],
    accentBg: [245, 247, 255],
    tableHead: [79, 70, 229],
  },
  green: {
    name: 'Professional Green',
    primary: [5, 150, 105],
    headerText: [255, 255, 255],
    accentBg: [240, 253, 244],
    tableHead: [5, 150, 105],
  },
  dark: {
    name: 'Corporate Dark',
    primary: [17, 24, 39],
    headerText: [255, 255, 255],
    accentBg: [248, 248, 248],
    tableHead: [31, 41, 55],
  },
};

const TERMS_PRESETS = [
  'Payment due within 30 days of invoice date.',
  'Payment due within 15 days of invoice date.',
  'Payment due on receipt.',
  'Payment due within 7 days.',
  '50% advance, balance before delivery.',
];

// ─── PDF builder ──────────────────────────────────────────────────────────────

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

// taxType: 'IGST' | 'CGST_SGST'
async function buildPDF(invoice, party, lineItems, company, themeKey = 'classic', taxType = 'CGST_SGST') {
  const theme = INVOICE_THEMES[themeKey] || INVOICE_THEMES.classic;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, L = 14, R = W - 14, contentW = R - L;
  const invDiscPct = invoice.discountPct || 0;

  const [pr, pg, pb] = theme.primary;

  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(...theme.headerText);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.type === 'Purchase' ? 'PURCHASE BILL' : 'TAX INVOICE', L, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('ORIGINAL FOR RECIPIENT', R, 14, { align: 'right' });

  let y = 30;
  if (company.logo) {
    try {
      doc.addImage(company.logo, 'JPEG', L, y, 24, 16);
      y += 18;
    } catch (e) {
      console.error("Failed to add company logo to PDF", e);
    }
  }
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(company.name || 'Your Company', L, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  if (company.gstin) { doc.text(`GSTIN: ${company.gstin}`, L, y); y += 4.5; }
  if (company.address) {
    const addrLines = doc.splitTextToSize(company.address, 90);
    addrLines.forEach(line => { doc.text(line, L, y); y += 4.5; });
  }
  if (company.phone) { doc.text(`Phone: ${company.phone}`, L, y); y += 4.5; }
  if (company.email) { doc.text(`Email: ${company.email}`, L, y); y += 4.5; }

  const mx = W / 2 + 10;
  let my = 30;
  doc.setTextColor(30, 30, 30);
  const metaRows = [
    ['Invoice No.', invoice.invoiceNumber || `INV-${invoice.id}`],
    ['Invoice Date', fmtDate(invoice.date)],
    ['Tax Type', taxType === 'IGST' ? 'IGST (Inter-state)' : 'CGST + SGST'],
    ['Status', invoice.status || 'Pending']
  ];
  if (invoice.dueDate) metaRows.splice(2, 0, ['Due Date', fmtDate(invoice.dueDate)]);
  metaRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(label + ':', mx, my);
    doc.setFont('helvetica', 'normal'); doc.text(val, mx + 28, my);
    my += 5;
  });

  const sepY = Math.max(y, my) + 3;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(L, sepY, R, sepY);

  let by = sepY + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
  doc.text(invoice.type === 'Purchase' ? 'BILL FROM (VENDOR)' : 'BILL TO', L, by);
  by += 4.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  doc.text(party.name, L, by);
  by += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  if (party.gstin) { doc.text(`GSTIN: ${party.gstin}`, L, by); by += 4.5; }
  if (party.address) { doc.text(party.address, L, by); by += 4.5; }
  if (party.phone) { doc.text(`Phone: ${party.phone}`, L, by); by += 4.5; }
  doc.line(L, by + 3, R, by + 3);

  const tableHead = [['Sr.', 'Item Description', 'HSN/SAC', 'Qty', 'Unit', 'Rate', 'Disc%', 'GST%', 'Amount']];
  const tableBody = lineItems.map((item, i) => {
    const rate = item.rate || item.basePrice;
    const gross = rate * item.qty;
    const itemDiscPct = item.itemDiscountPct || 0;
    const itemDiscAmt = gross * itemDiscPct / 100;
    const lineAmt = gross - itemDiscAmt;
    return [
      i + 1, item.name, item.hsn || '-', item.qty, item.unit || 'PCS',
      fmtPDF(rate),
      itemDiscPct > 0 ? `${itemDiscPct}%` : '-',
      `${item.gstRate}%`,
      fmtPDF(lineAmt)
    ];
  });

  autoTable(doc, {
    startY: by + 6,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: theme.tableHead, textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 9 },
      4: { halign: 'center', cellWidth: 10 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 11 },
      7: { halign: 'center', cellWidth: 11 },
      8: { halign: 'right', cellWidth: 24 }
    },
    margin: { left: L, right: 14 }
  });

  const afterTable = doc.lastAutoTable.finalY + 6;
  const grossSubtotal = invoice.grossSubtotal || invoice.subtotal || 0;
  const itemDiscountAmt = invoice.itemDiscountAmt || 0;
  const discountAmt = invoice.discountAmt || invoice.discount || 0;
  const subtotal = invoice.subtotal || 0;
  const taxAmount = invoice.taxAmount || 0;
  const shipping = invoice.shipping || 0;
  const total = invoice.total || 0;

  const totalsX = R - 80;
  let ty = afterTable;

  const drawTotalRow = (label, val, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9.5 : 8.5);
    doc.setTextColor(bold ? 30 : 80, bold ? 30 : 80, bold ? 30 : 80);
    doc.text(label, totalsX, ty);
    doc.text(val, R, ty, { align: 'right' });
    ty += 5;
  };

  if (itemDiscountAmt > 0) drawTotalRow('Gross Amount', fmtPDF(grossSubtotal));
  if (itemDiscountAmt > 0) drawTotalRow('Item Discounts', '-' + fmtPDF(itemDiscountAmt));
  if (discountAmt > 0) drawTotalRow(`Add. Discount (${invDiscPct}%)`, '-' + fmtPDF(discountAmt));
  drawTotalRow('Taxable Amount', fmtPDF(subtotal));

  if (taxType === 'IGST') {
    drawTotalRow('IGST', fmtPDF(taxAmount));
  } else {
    drawTotalRow('CGST', fmtPDF(taxAmount / 2));
    drawTotalRow('SGST', fmtPDF(taxAmount / 2));
  }

  if (shipping > 0) drawTotalRow('Shipping/Handling', fmtPDF(shipping));

  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX, ty, R, ty);
  ty += 4;
  drawTotalRow('Grand Total', fmtPDF(total), true);
  ty += 2;

  doc.setFillColor(...theme.accentBg);
  doc.rect(L, ty, contentW, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  doc.text('Amount in Words:', L + 3, ty + 5.5);
  doc.setFont('helvetica', 'normal');
  const words = doc.splitTextToSize(amountToWords(total), contentW - 48);
  doc.text(words, L + 38, ty + 5.5);
  ty += 14;

  if (invoice.terms) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('TERMS & CONDITIONS', L, ty); ty += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    const termsLines = doc.splitTextToSize(invoice.terms, contentW - 60);
    termsLines.forEach(line => { doc.text(line, L, ty); ty += 4; });
    ty += 2;
  }

  if (invoice.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('NOTES', L, ty); ty += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    const noteLines = doc.splitTextToSize(invoice.notes, contentW - 60);
    noteLines.forEach(line => { doc.text(line, L, ty); ty += 4; });
    ty += 2;
  }

  const bankStartY = ty;
  if (company.bankName || company.bankAccount) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('BANK DETAILS', L, ty); ty += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 40, 40);
    if (company.bankName) { doc.text(`Bank: ${company.bankName}`, L, ty); ty += 4.5; }
    if (company.bankAccount) { doc.text(`A/C No: ${company.bankAccount}`, L, ty); ty += 4.5; }
    if (company.bankIFSC) { doc.text(`IFSC: ${company.bankIFSC}`, L, ty); ty += 4.5; }
    ty += 2;
  }

  if (company.upiId && invoice.type !== 'Purchase') {
    const upiLink = `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(company.name || '')}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.invoiceNumber || '')}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200, margin: 1 });
      const qrX = R - 30;
      const qrY = bankStartY - 2;
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, 30, 30);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 100, 100);
      doc.text('Scan to Pay', qrX + 15, qrY + 33, { align: 'center' });
      doc.setFontSize(6.5);
      doc.text(company.upiId, qrX + 15, qrY + 37, { align: 'center' });
      ty = Math.max(ty, qrY + 40);
    } catch {
      // UPI QR generation failed silently — invoice still generates
    }
  }

  const sigX = R - 50;
  doc.setDrawColor(180, 180, 180);
  doc.rect(sigX, ty, 50, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('For ' + (company.name || 'Company'), sigX + 25, ty + 5, { align: 'center' });
  doc.text('Authorised Signatory', sigX + 25, ty + 18, { align: 'center' });

  const footerY = 287;
  doc.setDrawColor(pr, pg, pb); doc.setLineWidth(0.5); doc.line(L, footerY, R, footerY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
  doc.text('This is a computer-generated invoice. No signature is required.', W / 2, footerY + 4, { align: 'center' });

  return doc;
}

// ─── POS Thermal Receipt ──────────────────────────────────────────────────────
// Opens a browser print dialog styled for 80mm thermal receipt paper.
function printPOSReceipt(invoice, party, lineItems, company) {
  const fmt = n => '₹' + (n || 0).toFixed(2);
  const pad = (left, right, width = 42) => {
    const gap = width - left.length - right.length;
    return left + ' '.repeat(Math.max(1, gap)) + right;
  };
  const line = '-'.repeat(42);
  const dline = '='.repeat(42);
  const center = (txt, w = 42) => {
    const sp = Math.max(0, Math.floor((w - txt.length) / 2));
    return ' '.repeat(sp) + txt;
  };

  const itemLines = lineItems.map(item => {
    const rate = item.rate || item.basePrice;
    const gross = rate * item.qty;
    const itemDiscAmt = gross * (item.itemDiscountPct || 0) / 100;
    const invDiscAmt = (gross - itemDiscAmt) * (invoice.discountPct || 0) / 100;
    const taxable = gross - itemDiscAmt - invDiscAmt;
    const tax = taxable * (item.gstRate / 100);
    const amount = taxable + tax;
    return [
      `${item.name}`,
      pad(`  ${item.qty} ${item.unit || 'PCS'} x ${fmt(rate)}`, fmt(amount))
    ].join('\n');
  }).join('\n');

  const taxType = invoice.taxType || 'CGST_SGST';
  const taxLabel = taxType === 'IGST' ? `IGST` : `CGST+SGST`;
  const dateStr = new Date(invoice.date).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const receiptText = [
    center(company.name || 'Your Business'),
    company.address ? center(company.address) : '',
    company.gstin ? center(`GSTIN: ${company.gstin}`) : '',
    company.phone ? center(`Ph: ${company.phone}`) : '',
    dline,
    invoice.type === 'Purchase' ? center('PURCHASE BILL') : center('TAX INVOICE / BILL'),
    dline,
    pad('Invoice#:', invoice.invoiceNumber || `INV-${invoice.id}`),
    pad('Date:', dateStr),
    pad('Customer:', (party?.name || '').slice(0, 20)),
    party?.phone ? pad('Phone:', party.phone) : '',
    party?.gstin ? pad('GSTIN:', party.gstin) : '',
    line,
    center('ITEMS'),
    line,
    itemLines,
    line,
    invoice.itemDiscountAmt > 0 ? pad('Item Discounts:', '-' + fmt(invoice.itemDiscountAmt)) : '',
    invoice.discountAmt > 0 ? pad(`Discount (${invoice.discountPct}%):`, '-' + fmt(invoice.discountAmt)) : '',
    pad('Taxable Amount:', fmt(invoice.subtotal)),
    pad(taxLabel + ':', fmt(invoice.taxAmount)),
    invoice.shipping > 0 ? pad('Shipping:', fmt(invoice.shipping)) : '',
    dline,
    pad('GRAND TOTAL:', fmt(invoice.total)),
    dline,
    center(amountToWords(invoice.total)),
    line,
    invoice.terms ? `Terms: ${invoice.terms}` : '',
    invoice.notes ? `Note: ${invoice.notes}` : '',
    company.upiId ? pad('UPI:', company.upiId) : '',
    line,
    center('Thank you for your business!'),
    center('Powered by Lekhya One'),
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<style>
  @page { size: 80mm auto; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 76mm; background: #fff; color: #000; }
  pre { white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
</style>
</head><body>
<pre>${receiptText}</pre>
<script>window.onload = function() { window.print(); setTimeout(window.close, 500); }</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes');
  if (!win) { alert('Allow pop-ups to print the receipt.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── UPI QR helper ───────────────────────────────────────────────────────────

function UpiQrImage({ upiId, name, amount }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!upiId || amount <= 0) return;
    const link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name || '')}&am=${amount.toFixed(2)}&cu=INR`;
    QRCode.toDataURL(link, { width: 180, margin: 1 }).then(setSrc).catch(() => {});
  }, [upiId, name, amount]);
  if (!src || !upiId || amount <= 0) return null;
  return (
    <div style={{ textAlign: 'center' }}>
      <img src={src} alt="Scan to Pay" style={{ width: 140, height: 140, display: 'block', margin: '0 auto' }} />
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{upiId}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 10;
const STATUS_OPTIONS = ['Pending', 'Paid', 'Partial', 'Cancelled', 'Draft'];
const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'];

export default function Billing() {
  const parties = useLiveQuery(() => db.parties.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const productVariants = useLiveQuery(() => db.productVariants.toArray());
  const invoices = useLiveQuery(() => db.invoices.orderBy('id').reverse().toArray());

  const variantsForBilling = useMemo(() => {
    if (!productVariants || !products) return [];
    return productVariants.map(v => {
      const prod = products.find(p => p.id === v.productId);
      const packSz = Number(v.packSize) > 0 ? Number(v.packSize) : 1;
      const isBulk = (prod?.inventoryMode || 'packed') === 'bulk';
      const masterStock = prod?.masterStock || 0;
      // Hybrid: BULK product with packaged stock in variant.stockQty sells from variant pool
      const stockPool = (isBulk && v.stockQty === 0) ? masterStock : v.stockQty;
      const avail = stockPool / packSz;
      const packLabel = `${packSz} ${v.unit} Pack`;
      const displayName = prod ? `${prod.name} - ${packLabel}` : '';
      return {
        ...v,
        id: v.id,
        productId: v.productId,
        productName: prod?.name || '',
        hsn: prod?.hsn || '',
        name: displayName,
        averageCost: v.averageCost ?? v.purchasePrice ?? 0,
        basePrice: v.sellingPrice,
        packSz,
        inventoryMode: isBulk ? 'bulk' : 'packed',
        masterStock,
        availablePacks: avail,
        currentStock: avail,
        unit: v.unit,
      };
    });
  }, [productVariants, products]);

  const [tab, setTab] = useState('new');
  const [invoiceType, setInvoiceType] = useState('Sales');
  const [selectedParty, setSelectedParty] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  // quantityStr: raw string during typing so backspace works; parsed to int on add
  const [quantityStr, setQuantityStr] = useState('1');
  // savedInvoice: populated after Save Invoice — enables Print buttons
  const [savedInvoice, setSavedInvoice] = useState(null);
  // previewUrl: blob URL of the PDF shown in the preview modal; null = closed
  const [previewUrl, setPreviewUrl] = useState(null);
  const [shipping, setShipping] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [invoiceTheme, setInvoiceTheme] = useState('classic');
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [noteReturnItems, setNoteReturnItems] = useState([]);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [reminderInvId, setReminderInvId] = useState(null);
  const [companyGstin, setCompanyGstin] = useState('');
  const [companyUpiId, setCompanyUpiId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [newPartyModal, setNewPartyModal] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  // Multi-tab billing: payments per active bill + held bills array
  const [payments, setPayments] = useState([]); // [{ method, amount, amountStr }]
  const [heldBills, setHeldBills] = useState([]); // saved snapshots for inactive tabs
  const [activeBillId, setActiveBillId] = useState(1);
  const [nextBillId, setNextBillId] = useState(2);

  const toast = useToast();

  useEffect(() => {
    setHistoryPage(1);
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    getSetting('company', {}).then(c => {
      setCompanyGstin(c?.gstin || '');
      setCompanyUpiId(c?.upiId || '');
      setCompanyName(c?.name || '');
    });
  }, []);


  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (noteModal) { setNoteModal(null); return; }
        if (viewInvoice) { setViewInvoice(null); return; }
        if (confirmDeleteId) { setConfirmDeleteId(null); return; }
        if (reminderInvId) { setReminderInvId(null); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setTab('new');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && tab === 'new') {
        e.preventDefault();
        document.getElementById('billing-save-btn')?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tab, viewInvoice, confirmDeleteId, reminderInvId, noteModal]);

  // ── Multi-tab helpers ──────────────────────────────────────────────────────

  function captureBillSnapshot() {
    return {
      id: activeBillId,
      selectedParty, partySearch, invoiceItems,
      selectedProduct, productSearch, quantityStr,
      shipping, discountPct, dueDate, notes, terms,
      invoiceTheme, paymentStatus, savedInvoice, draftId, payments,
    };
  }

  function restoreBillSnapshot(snap) {
    setActiveBillId(snap.id);
    setSelectedParty(snap.selectedParty || '');
    setPartySearch(snap.partySearch || '');
    setInvoiceItems(snap.invoiceItems || []);
    setSelectedProduct(snap.selectedProduct || '');
    setProductSearch(snap.productSearch || '');
    setQuantityStr(snap.quantityStr || '1');
    setShipping(snap.shipping || '');
    setDiscountPct(snap.discountPct || '');
    setDueDate(snap.dueDate || '');
    setNotes(snap.notes || '');
    setTerms(snap.terms || '');
    setInvoiceTheme(snap.invoiceTheme || 'classic');
    setPaymentStatus(snap.paymentStatus || 'Pending');
    setSavedInvoice(snap.savedInvoice || null);
    setDraftId(snap.draftId || null);
    setPayments(snap.payments || []);
  }

  function resetCurrentBill() {
    setSelectedParty(''); setPartySearch('');
    setInvoiceItems([]); setSelectedProduct(''); setProductSearch('');
    setQuantityStr('1'); setShipping(''); setDiscountPct('');
    setDueDate(''); setNotes(''); setTerms('');
    setInvoiceTheme('classic'); setPaymentStatus('Pending');
    setSavedInvoice(null); setDraftId(null); setPayments([]);
  }

  function addBillTab() {
    const snap = captureBillSnapshot();
    // Only hold if there's meaningful content
    if (snap.invoiceItems.length > 0 || snap.selectedParty) {
      setHeldBills(prev => [...prev, snap]);
    }
    const newId = nextBillId;
    setNextBillId(id => id + 1);
    setActiveBillId(newId);
    resetCurrentBill();
  }

  function switchBillTab(heldId) {
    if (heldId === activeBillId) return;
    const snap = captureBillSnapshot();
    setHeldBills(prev => {
      const target = prev.find(b => b.id === heldId);
      if (!target) return prev;
      // Replace target with current, remove target from held
      const remaining = prev.filter(b => b.id !== heldId);
      const toStore = snap.invoiceItems.length > 0 || snap.selectedParty ? [snap] : [];
      return [...remaining, ...toStore];
    });
    const target = heldBills.find(b => b.id === heldId);
    if (target) restoreBillSnapshot(target);
  }

  function closeBillTab(tabId) {
    if (tabId === activeBillId) {
      // Switch to first held bill or reset
      if (heldBills.length > 0) {
        const next = heldBills[0];
        setHeldBills(prev => prev.filter(b => b.id !== next.id));
        restoreBillSnapshot(next);
      } else {
        resetCurrentBill();
        setActiveBillId(1);
        setNextBillId(2);
      }
    } else {
      setHeldBills(prev => prev.filter(b => b.id !== tabId));
    }
  }

  // ── Payment helpers ────────────────────────────────────────────────────────

  function addPaymentRow() {
    setPayments(prev => [...prev, { method: 'Cash', amount: 0, amountStr: '' }]);
  }

  function updatePayment(idx, field, value) {
    setPayments(prev => prev.map((p, i) => i !== idx ? p : { ...p, [field]: value }));
  }

  function removePayment(idx) {
    setPayments(prev => prev.filter((_, i) => i !== idx));
  }

  const addItem = () => {
    if (!selectedProduct) return;
    const v = variantsForBilling?.find(v => v.id.toString() === selectedProduct);
    if (!v) return;
    const rate = v.sellingPrice;
    const qty = Math.max(1, parseInt(quantityStr) || 1);
    const existing = invoiceItems.findIndex(i => i.id === v.id);
    if (existing >= 0) {
      const updated = [...invoiceItems];
      const newQty = updated[existing].qty + qty;
      updated[existing] = { ...updated[existing], qty: newQty, qtyStr: String(newQty) };
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([...invoiceItems, { ...v, rate, qty, qtyStr: String(qty), itemDiscountPct: 0, discStr: '0' }]);
    }
    setSelectedProduct('');
    setProductSearch('');
    setQuantityStr('1');
  };

  const removeItem = (index) => setInvoiceItems(items => items.filter((_, i) => i !== index));

  // Allow free-form typing (empty string while backspacing); enforce min=1 on blur
  const updateQtyStr = (index, raw) => {
    const digits = raw.replace(/[^0-9]/g, '');
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], qtyStr: digits, qty: digits === '' ? 0 : (parseInt(digits) || 0) };
    setInvoiceItems(updated);
  };

  const finalizeQty = (index) => {
    const updated = [...invoiceItems];
    const finalQty = Math.max(1, parseInt(updated[index].qtyStr) || 1);
    updated[index] = { ...updated[index], qty: finalQty, qtyStr: String(finalQty) };
    setInvoiceItems(updated);
  };

  // Allow free-form typing for discount %; enforce 0–100 on blur
  const updateDiscStr = (index, raw) => {
    const clean = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    const updated = [...invoiceItems];
    updated[index] = { ...updated[index], discStr: clean, itemDiscountPct: parseFloat(clean) || 0 };
    setInvoiceItems(updated);
  };

  const finalizeDisc = (index) => {
    const updated = [...invoiceItems];
    const v = Math.min(100, Math.max(0, parseFloat(updated[index].discStr) || 0));
    updated[index] = { ...updated[index], itemDiscountPct: v, discStr: String(v) };
    setInvoiceItems(updated);
  };

  // Invoice-level additional discount (applied after per-item discounts)
  const invDiscPct = Math.min(100, Math.max(0, Number(discountPct) || 0));

  const totals = invoiceItems.reduce((acc, item) => {
    const rate = item.rate || item.basePrice;
    const qty = Number(item.qty) || 0; // handles intermediate '' during typing
    const gross = rate * qty;
    const itemDiscAmt = gross * (item.itemDiscountPct || 0) / 100;
    const afterItemDisc = gross - itemDiscAmt;
    const invDiscAmt = afterItemDisc * invDiscPct / 100;
    const taxable = afterItemDisc - invDiscAmt;
    const tax = taxable * (item.gstRate / 100);
    return {
      gross: acc.gross + gross,
      itemDiscountAmt: acc.itemDiscountAmt + itemDiscAmt,
      subtotal: acc.subtotal + taxable,
      taxAmount: acc.taxAmount + tax,
      discountAmt: acc.discountAmt + invDiscAmt
    };
  }, { gross: 0, itemDiscountAmt: 0, subtotal: 0, taxAmount: 0, discountAmt: 0 });

  const shipAmt = Number(shipping) || 0;
  const grandTotal = totals.subtotal + totals.taxAmount + shipAmt;

  // Detect inter-state: compare first 2 digits of seller vs buyer GSTIN
  const selectedPartyObj = parties?.find(p => p.id.toString() === selectedParty);
  const selectedProductObj = variantsForBilling?.find(v => v.id.toString() === selectedProduct);
  const partyStateCode = getStateCode(selectedPartyObj?.gstin);
  const companyStateCode = getStateCode(companyGstin);
  const isInterState = !!(partyStateCode && companyStateCode && partyStateCode !== companyStateCode);
  const taxType = isInterState ? 'IGST' : 'CGST_SGST';

  // Core save: persists invoice + updates stock. Returns saved data for printing.
  const handleSaveInvoice = async () => {
    const party = parties?.find(p => p.id.toString() === selectedParty);
    if (!party) { toast('Select a customer/vendor first', 'warning'); return; }
    if (invoiceItems.length === 0) { toast('Add at least one item', 'warning'); return; }

    // Validate all line item quantities are ≥ 1
    for (const item of invoiceItems) {
      if (!item.qty || item.qty < 1) {
        toast(`Qty for "${item.name}" must be at least 1`, 'warning'); return;
      }
    }

    if (invoiceType === 'Sales') {
      for (const item of invoiceItems) {
        const v = variantsForBilling?.find(v => v.id === item.id);
        if (v && item.qty > v.availablePacks) {
          toast(`Insufficient stock for "${item.name}" — available: ${v.availablePacks.toFixed(2)} packs`, 'error');
          return;
        }
      }

      // Credit limit check: sum all unpaid sales invoices for this party
      if (party.creditLimit > 0) {
        const unpaidInvoices = await db.invoices
          .where('[partyId+status]').equals([party.id, 'Pending'])
          .filter(inv => inv.type === 'Sales')
          .toArray();
        const outstandingTotal = unpaidInvoices.reduce((s, inv) => s + (inv.total || 0), 0);
        const invoiceTotal = totals.subtotal + totals.taxAmount;
        if (outstandingTotal + invoiceTotal > party.creditLimit) {
          const available = Math.max(0, party.creditLimit - outstandingTotal);
          toast(
            `Credit limit exceeded for ${party.name} — Limit: ₹${party.creditLimit.toLocaleString('en-IN')}, Outstanding: ₹${outstandingTotal.toLocaleString('en-IN')}, Available: ₹${available.toLocaleString('en-IN')}`,
            'error'
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const company = await getSetting('company', {});
      const defaultTheme = await getSetting('invoiceTheme', 'classic');
      const invoiceNumber = await getNextInvoiceNumber();

      const freshCompanyGstin = company?.gstin || '';
      const freshCompanyState = getStateCode(freshCompanyGstin);
      const freshPartyState = getStateCode(party.gstin);
      const finalTaxType = (freshCompanyState && freshPartyState && freshCompanyState !== freshPartyState)
        ? 'IGST' : 'CGST_SGST';

      const lineItems = invoiceItems.map(item => ({
        variantId: item.id,
        productId: item.productId,
        // snapshots — frozen at time of sale so edits to product never alter old invoices
        productName: item.productName,
        packSize: item.packSz,
        unit: item.unit,
        purchasePriceSnapshot: item.purchasePrice || 0,
        sellingPrice: item.sellingPrice,
        costAtSale: invoiceType === 'Sales' ? (item.averageCost ?? item.purchasePrice ?? 0) : 0,
        gstRate: item.gstRate,
        hsn: item.hsn,
        barcodeSnapshot: item.barcode || '',
        name: item.name,
        basePrice: item.basePrice,
        rate: item.rate || item.basePrice,
        qty: item.qty,
        itemDiscountPct: item.itemDiscountPct || 0,
      }));

      // Auto-derive payment status from payments array
      const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const computedStatus = payments.length > 0
        ? (totalPaid >= grandTotal && grandTotal > 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : paymentStatus)
        : paymentStatus;

      const invoiceRecord = {
        invoiceNumber,
        type: invoiceType,
        partyId: party.id,
        date: new Date().toISOString(),
        dueDate: dueDate || null,
        taxType: finalTaxType,
        grossSubtotal: totals.gross,
        itemDiscountAmt: totals.itemDiscountAmt,
        discountPct: invDiscPct,
        discountAmt: totals.discountAmt,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        shipping: shipAmt,
        total: grandTotal,
        status: computedStatus,
        payments: payments.filter(p => Number(p.amount) > 0).map(p => ({ method: p.method, amount: Number(p.amount) })),
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        theme: invoiceTheme || defaultTheme,
        lineItems
      };

      // Draft/Cancelled invoices are not real sales — no stock movement, no purchase
      // record, no payment transaction. Only Pending/Paid/Partial count as a sale.
      const isRealSale = computedStatus !== 'Draft' && computedStatus !== 'Cancelled';

      await db.transaction('rw', db.invoices, db.productVariants, db.products, db.purchases, db.stockLedger, db.batches, async () => {
        if (draftId) {
          await db.invoices.update(draftId, invoiceRecord);
        } else {
          await db.invoices.add(invoiceRecord);
        }
        if (!isRealSale) return;
        const isPurchase = invoiceType === 'Purchase';
        for (const item of invoiceItems) {
          await adjustStock({
            variantId: item.id,
            productId: item.productId,
            packsDelta: isPurchase ? item.qty : -item.qty,
            type: isPurchase ? 'purchase' : 'sale',
            reference: invoiceNumber,
            unitCost: isPurchase ? (item.rate ?? item.basePrice ?? 0) : null,
          });
          if (isPurchase) {
            await db.purchases.add({
              productId: item.productId,
              variantId: item.id,
              vendorId: party.id,
              date: new Date().toISOString(),
              qty: item.qty,
              purchasePrice: item.rate || item.basePrice || 0,
              notes: `Generated from purchase invoice ${invoiceNumber}`,
            });
          } else {
            // FEFO batch deduction: deduct from earliest-expiring batches first
            const batchesRaw = await db.batches
              .where('variantId').equals(item.id)
              .filter(b => b.status === 'active' && (b.remainingQty || 0) > 0)
              .toArray();
            const sortedBatches = batchesRaw.sort((a, b) => {
              if (!a.expiryDate && !b.expiryDate) return 0;
              if (!a.expiryDate) return 1;
              if (!b.expiryDate) return -1;
              return a.expiryDate.localeCompare(b.expiryDate);
            });
            let qtyToDeduct = item.qty;
            for (const batch of sortedBatches) {
              if (qtyToDeduct <= 0) break;
              const deduct = Math.min(qtyToDeduct, batch.remainingQty);
              const newRemaining = batch.remainingQty - deduct;
              await db.batches.update(batch.id, {
                remainingQty: newRemaining,
                status: newRemaining <= 0 ? 'exhausted' : 'active',
              });
              qtyToDeduct -= deduct;
            }
          }
        }
      });

      const persistedInvoice = await db.invoices.where('invoiceNumber').equals(invoiceNumber).first();

      // Auto-record payment transactions
      const validPmts = payments.filter(p => Number(p.amount) > 0);
      if (isRealSale && validPmts.length > 0 && persistedInvoice) {
        for (const pmt of validPmts) {
          await db.transactions.add({
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            invoiceId: persistedInvoice.id,
            type: invoiceType === 'Sales' ? 'Payment In' : 'Payment Out',
            amount: Number(pmt.amount),
            method: pmt.method,
            reference: invoiceNumber,
            notes: `${invoiceType} invoice ${invoiceNumber}`,
            autoRecorded: true,
          });
        }
      }

      const invoiceForPrint = persistedInvoice || invoiceRecord;

      // Store for deferred printing (Print PDF / POS buttons)
      setSavedInvoice({ invoice: invoiceForPrint, party, lineItems, company, finalTaxType, defaultTheme: invoiceTheme || defaultTheme });

      setInvoiceItems([]);
      setSelectedParty('');
      setSelectedProduct('');
      setProductSearch('');
      setShipping('');
      setDiscountPct('');
      setDueDate('');
      setNotes('');
      setTerms('');
      setPaymentStatus('Pending');
      setDraftId(null);
      setPayments([]);
      toast(`Invoice ${invoiceNumber} saved. Use the Print buttons below to generate your bill.`, 'success');
      return { invoice: invoiceForPrint, party, lineItems, company, finalTaxType, defaultTheme: invoiceTheme || defaultTheme };
    } catch (err) {
      toast('Failed to save invoice: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Build a non-persisted invoice object shaped for buildPDF, from current form state
  const buildDraftForPdf = (invoiceNumber) => {
    const lineItems = invoiceItems.map(item => ({
      name: item.name,
      hsn: item.hsn,
      unit: item.unit || 'PCS',
      basePrice: item.basePrice,
      rate: item.rate || item.basePrice,
      qty: item.qty,
      gstRate: item.gstRate,
      itemDiscountPct: item.itemDiscountPct || 0,
    }));
    const invoice = {
      invoiceNumber,
      type: invoiceType,
      date: new Date().toISOString(),
      dueDate: dueDate || null,
      discountPct: invDiscPct,
      grossSubtotal: totals.gross,
      itemDiscountAmt: totals.itemDiscountAmt,
      discountAmt: totals.discountAmt,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      shipping: shipAmt,
      total: grandTotal,
      status: paymentStatus,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      lineItems,
    };
    return { invoice, lineItems };
  };

  const closePreview = () => {
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  // Preview: render the current (unsaved) invoice as a PDF in a modal
  const handlePreview = async () => {
    const party = parties?.find(p => p.id.toString() === selectedParty);
    if (!party) { toast('Select a customer/vendor first', 'warning'); return; }
    if (invoiceItems.length === 0) { toast('Add at least one item', 'warning'); return; }
    for (const item of invoiceItems) {
      if (!item.qty || item.qty < 1) { toast(`Qty for "${item.name}" must be at least 1`, 'warning'); return; }
    }
    setSaving(true);
    try {
      const company = await getSetting('company', {});
      const prefix = await getSetting('invoicePrefix', 'INV');
      const seq = (await db.settings.get('invoiceSeq'))?.value || 0;
      // read-only peek — do NOT call getNextInvoiceNumber (it increments the sequence)
      const peekNumber = `${prefix}-${new Date().getFullYear()}-${String(seq + 1).padStart(4, '0')}`;
      const { invoice, lineItems } = buildDraftForPdf(peekNumber);
      const doc = await buildPDF(invoice, party, lineItems, company, invoiceTheme, taxType);
      setPreviewUrl(doc.output('bloburl').toString());
    } catch (err) {
      toast('Preview failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Save & Print from the preview modal: persist, then open the print dialog for the real invoice
  const handleSaveAndPrint = async () => {
    const result = await handleSaveInvoice();
    if (!result) return; // validation failed / error — toast already shown, keep modal open
    closePreview();
    try {
      const doc = await buildPDF(result.invoice, result.party, result.lineItems, result.company, result.defaultTheme, result.finalTaxType);
      doc.autoPrint();
      const win = window.open(doc.output('bloburl'), '_blank');
      if (!win) toast('Invoice saved. Allow pop-ups to print, or use the Tax Invoice PDF button.', 'warning');
    } catch (err) {
      toast('Saved, but printing failed: ' + err.message, 'error');
    }
  };

  // Print full A4 GST Tax Invoice PDF
  const handlePrintPDF = async () => {
    if (!savedInvoice) return;
    const { invoice, party, lineItems, company, finalTaxType, defaultTheme } = savedInvoice;
    setSaving(true);
    try {
      const doc = await buildPDF(invoice, party, lineItems, company, defaultTheme, finalTaxType);
      doc.save(`${invoice.invoiceNumber || `INV-${invoice.id}`}.pdf`);
      toast('Tax Invoice PDF downloaded.', 'success');
    } catch (err) {
      toast('PDF generation failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Print POS thermal receipt (80mm)
  const handlePrintPOS = () => {
    if (!savedInvoice) return;
    const { invoice, party, lineItems, company } = savedInvoice;
    printPOSReceipt(invoice, party, lineItems, company);
  };

  const handleSaveDraft = async () => {
    if (!selectedParty && invoiceItems.length === 0) { toast('Add party or items before saving draft', 'warning'); return; }
    setSaving(true);
    try {
      const company = await getSetting('company', {});
      const lineItems = invoiceItems.map(item => ({
        variantId: item.id, productId: item.productId,
        productName: item.productName, packSize: item.packSz,
        name: item.name, hsn: item.hsn,
        purchasePriceSnapshot: item.purchasePrice || 0,
        barcodeSnapshot: item.barcode || '',
        basePrice: item.basePrice, rate: item.rate || item.basePrice,
        sellingPrice: item.sellingPrice, gstRate: item.gstRate,
        qty: item.qty, unit: item.unit, itemDiscountPct: item.itemDiscountPct || 0,
      }));
      const party = parties?.find(p => p.id.toString() === selectedParty);
      const draftRecord = {
        invoiceNumber: draftId ? undefined : `DRAFT-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        type: invoiceType,
        partyId: party?.id || null,
        date: new Date().toISOString(),
        dueDate: dueDate || null,
        taxType: 'CGST_SGST',
        grossSubtotal: totals.gross,
        itemDiscountAmt: totals.itemDiscountAmt,
        discountPct: invDiscPct,
        discountAmt: totals.discountAmt,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        shipping: Number(shipping) || 0,
        total: totals.subtotal + totals.taxAmount + (Number(shipping) || 0),
        status: 'Draft',
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        theme: invoiceTheme,
        lineItems,
      };
      if (draftId) {
        await db.invoices.update(draftId, draftRecord);
        toast('Draft updated', 'success');
      } else {
        const id = await db.invoices.add(draftRecord);
        setDraftId(id);
        toast('Draft saved — resume from History tab', 'success');
      }
    } catch (err) {
      toast('Draft save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResumeDraft = (inv) => {
    // Save current bill to held if it has content
    const snap = captureBillSnapshot();
    if (snap.invoiceItems.length > 0 || snap.selectedParty) {
      setHeldBills(prev => [...prev, snap]);
    }
    const newId = nextBillId;
    setNextBillId(id => id + 1);
    setActiveBillId(newId);
    // Load draft into new tab
    setSelectedParty(inv.partyId?.toString() || '');
    setPartySearch('');
    setInvoiceItems((inv.lineItems || []).map(item => ({ ...item, id: item.variantId || item.productId, itemDiscountPct: item.itemDiscountPct || 0 })));
    setDiscountPct(inv.discountPct?.toString() || '');
    setShipping(inv.shipping?.toString() || '');
    setDueDate(inv.dueDate ? inv.dueDate.split('T')[0] : '');
    setNotes(inv.notes || '');
    setTerms(inv.terms || '');
    setInvoiceTheme(inv.theme || 'classic');
    setPaymentStatus('Pending');
    setDraftId(inv.id);
    setPayments(inv.payments || []);
    setSavedInvoice(null);
    setTab('new');
    toast('Draft loaded in a new tab — review and save to finalise', 'info');
  };

  const handleOpenNoteModal = (inv) => {
    const noteType = inv.type === 'Purchase' ? 'DebitNote' : 'CreditNote';
    setNoteModal({ inv, noteType });
    setNoteReturnItems((inv.lineItems || []).map(item => ({ ...item, returnQty: item.qty })));
  };

  const handleConfirmNote = async () => {
    const { inv, noteType } = noteModal;
    const returnItems = noteReturnItems.filter(i => (i.returnQty || 0) > 0);
    if (returnItems.length === 0) { toast('Enter at least one return quantity', 'warning'); return; }

    // Cumulative return validation — sum all prior returns for this invoice to prevent over-returning
    try {
      const priorNotes = await db.invoices
        .where('type').equals(noteType)
        .filter(n => n.refInvoiceNumber === inv.invoiceNumber)
        .toArray();
      const alreadyReturned = {};
      for (const prior of priorNotes) {
        for (const li of (prior.lineItems || [])) {
          if (li.variantId) alreadyReturned[li.variantId] = (alreadyReturned[li.variantId] || 0) + (li.qty || 0);
        }
      }
      for (const item of returnItems) {
        const vid = item.variantId;
        if (!vid) continue;
        const originalQty = item.qty;
        const prev = alreadyReturned[vid] || 0;
        const requested = item.returnQty || 0;
        if (prev + requested > originalQty) {
          const canReturn = Math.max(0, originalQty - prev);
          toast(`"${item.name || item.productName}" — only ${canReturn} more can be returned (${prev} of ${originalQty} already returned)`, 'error');
          return;
        }
      }
    } catch (validErr) {
      toast('Validation error: ' + validErr.message, 'error');
      return;
    }

    setSaving(true);
    try {
      const company = await getSetting('company', {});
      const party = parties?.find(p => p.id === inv.partyId);
      const noteSeqKey = noteType === 'CreditNote' ? 'creditNoteSeq' : 'debitNoteSeq';
    const notePrefix = noteType === 'CreditNote' ? 'CN' : 'DN';
    const noteSeqRecord = await db.settings.get(noteSeqKey);
    const noteSeq = (noteSeqRecord?.value || 0) + 1;
    await db.settings.put({ key: noteSeqKey, value: noteSeq });
    const noteNumber = `${notePrefix}-${new Date().getFullYear()}-${String(noteSeq).padStart(4, '0')}`;
      const invDiscPctVal = inv.discountPct || 0;

      let noteSubtotal = 0, noteTax = 0;
      const lineItems = returnItems.map(item => {
        const rate = item.rate || item.basePrice || 0;
        const itemDiscPct = item.itemDiscountPct || 0;
        const returnQty = Math.min(item.returnQty, item.qty);
        const gross = rate * returnQty;
        const afterItemDisc = gross * (1 - itemDiscPct / 100);
        const taxable = afterItemDisc * (1 - invDiscPctVal / 100);
        const tax = taxable * ((item.gstRate || 0) / 100);
        noteSubtotal += taxable;
        noteTax += tax;
        return { ...item, qty: returnQty };
      });

      const noteRecord = {
        invoiceNumber: noteNumber,
        type: noteType,
        partyId: inv.partyId,
        refInvoiceNumber: inv.invoiceNumber,
        date: new Date().toISOString(),
        taxType: inv.taxType || 'CGST_SGST',
        grossSubtotal: noteSubtotal + noteTax,
        itemDiscountAmt: 0,
        discountPct: invDiscPctVal,
        discountAmt: 0,
        subtotal: noteSubtotal,
        taxAmount: noteTax,
        shipping: 0,
        total: noteSubtotal + noteTax,
        status: 'Issued',
        notes: `Return against ${inv.invoiceNumber}`,
        lineItems,
      };

      await db.transaction('rw', db.invoices, db.productVariants, db.products, db.stockLedger, async () => {
        await db.invoices.add(noteRecord);
        const isCreditNote = noteType === 'CreditNote';
        for (const item of lineItems) {
          let variantId = item.variantId;
          if (!variantId && item.productId) {
            const v = await db.productVariants.where('productId').equals(item.productId).first();
            variantId = v?.id;
          }
          if (variantId) {
            await adjustStock({
              variantId,
              productId: item.productId,
              packsDelta: isCreditNote ? item.qty : -item.qty,
              type: isCreditNote ? 'credit-note' : 'debit-note',
              reference: noteNumber,
            });
          }
        }
      });

      const doc = await buildPDF(noteRecord, party, lineItems, company, inv.theme || 'classic', inv.taxType || 'CGST_SGST');
      doc.save(`${noteNumber}.pdf`);
      setNoteModal(null);
      toast(`${noteType === 'CreditNote' ? 'Credit Note' : 'Debit Note'} ${noteNumber} issued`, 'success');
    } catch (err) {
      toast('Failed to issue note: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReprintPDF = async (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    if (!party) { toast('Party not found', 'error'); return; }
    if (!inv.lineItems?.length) { toast('Line item data not available for this invoice', 'warning'); return; }
    const company = await getSetting('company', {});
    const doc = await buildPDF(inv, party, inv.lineItems, company, inv.theme || 'classic', inv.taxType || 'CGST_SGST');
    doc.save(`${inv.invoiceNumber || `INV-${inv.id}`}.pdf`);
    toast('PDF downloaded', 'success');
  };

  const handleReprintPOS = async (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    if (!party) { toast('Party not found', 'error'); return; }
    if (!inv.lineItems?.length) { toast('Line item data not available for this invoice', 'warning'); return; }
    const company = await getSetting('company', {});
    printPOSReceipt(inv, party, inv.lineItems, company);
  };

  // Marking Paid must also settle the ledger — otherwise Payments/Ledger pages
  // never see the money and the invoice looks paid with no matching transaction.
  const handleStatusChange = async (inv, newStatus) => {
    try {
      if (newStatus === 'Paid') {
        const relatedTxns = await db.transactions.where('invoiceId').equals(inv.id).toArray();
        const alreadyPaid = relatedTxns.reduce((s, t) => s + (t.amount || 0), 0);
        const remaining = (inv.total || 0) - alreadyPaid;
        if (remaining > 0.01) {
          await db.transaction('rw', db.transactions, db.invoices, async () => {
            await db.transactions.add({
              date: new Date().toISOString().slice(0, 10),
              partyId: inv.partyId,
              invoiceId: inv.id,
              type: inv.type === 'Purchase' ? 'Payment Out' : 'Payment In',
              amount: remaining,
              method: 'Other',
              reference: inv.invoiceNumber || `INV-${inv.id}`,
              notes: 'Balance settled — marked Paid from Invoice History',
              autoRecorded: true,
            });
            await db.invoices.update(inv.id, { status: newStatus });
          });
          toast(`Status updated to Paid — ₹${remaining.toLocaleString('en-IN')} recorded as payment`, 'success');
          return;
        }
      }
      await db.invoices.update(inv.id, { status: newStatus });
      toast(`Status updated to ${newStatus}`, 'success');
    } catch (err) {
      toast('Failed to update status: ' + err.message, 'error');
    }
  };

  const handleDeleteInvoice = async (inv) => {
    // When deleting an invoice, reverse its stock movement to prevent ledger corruption:
    // Sales was -qty → restore +qty; Purchase was +qty → remove -qty
    // CreditNote was +qty (sales return) → remove -qty; DebitNote was -qty (purchase return) → restore +qty
    const reverseSign = { Sales: 1, Purchase: -1, CreditNote: -1, DebitNote: 1 };
    const sign = reverseSign[inv.type];
    try {
      if (sign !== undefined && inv.lineItems?.length) {
        await db.transaction('rw', db.invoices, db.productVariants, db.products, db.stockLedger, async () => {
          for (const item of inv.lineItems) {
            if (!item.variantId) continue;
            try {
              await adjustStock({
                variantId: item.variantId,
                productId: item.productId,
                packsDelta: sign * item.qty,
                type: 'void',
                reference: `VOID:${inv.invoiceNumber || inv.id}`,
                note: 'Invoice deleted',
              });
            } catch (stockErr) {
              console.warn(`[Delete] Stock reversal skipped for variant ${item.variantId}:`, stockErr.message);
            }
          }
          await db.invoices.delete(inv.id);
        });
      } else {
        await db.invoices.delete(inv.id);
      }
      setConfirmDeleteId(null);
      toast('Invoice deleted', 'success');
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
    }
  };

  const copyReminder = (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    const msg = `Dear ${party?.name || 'Customer'},\n\nThis is a gentle reminder that invoice ${inv.invoiceNumber} for ${fmtINR(inv.total)} (dated ${fmtDate(inv.date)}) is currently outstanding.\n\nKindly arrange payment at your earliest convenience.\n\nThank you for your business.`;
    navigator.clipboard.writeText(msg).then(() => toast('Reminder message copied to clipboard!', 'success'));
    setReminderInvId(null);
  };

  const sendWhatsAppReminder = async (inv) => {
    const party = parties?.find(p => p.id === inv.partyId);
    const msg = `Dear ${party?.name || 'Customer'},\n\nThis is a gentle reminder that invoice ${inv.invoiceNumber} for ${fmtINR(inv.total)} (dated ${fmtDate(inv.date)}) is currently outstanding.\n\nKindly arrange payment at your earliest convenience.\n\nThank you for your business.`;
    let phone = (party?.phone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;
    if (inv.lineItems?.length) {
      try {
        const company = await getSetting('company', {});
        const doc = await buildPDF(inv, party, inv.lineItems, company, inv.theme || 'classic', inv.taxType || 'CGST_SGST');
        doc.save(`${inv.invoiceNumber || `INV-${inv.id}`}.pdf`);
        toast('Invoice PDF downloaded — attach it in WhatsApp', 'info');
      } catch { /* non-fatal */ }
    }
    window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`, '_blank');
    setReminderInvId(null);
  };

  const filteredInvoices = invoices?.filter(inv => {
    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
    const invDate = new Date(inv.date);
    const matchesFromDate = !fromDate || invDate >= new Date(fromDate);
    const matchesToDate = !toDate || invDate <= new Date(toDate + 'T23:59:59');
    return matchesStatus && matchesFromDate && matchesToDate;
  }) || [];
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / HISTORY_PAGE_SIZE));
  const pagedInvoices = filteredInvoices.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  const statusBadgeClass = (status) => {
    const map = { Paid: 'badge-success', Pending: 'badge-warning', Partial: 'badge-warning', Cancelled: 'badge-danger', Draft: 'badge-secondary', Issued: 'badge-primary' };
    return map[status] || 'badge-secondary';
  };

  const isOverdue = (inv) => {
    if (inv.status !== 'Pending') return false;
    const ref = inv.dueDate || inv.date;
    return new Date(ref) < new Date() && !inv.dueDate
      ? (new Date() - new Date(inv.date)) > 30 * 86400000
      : inv.dueDate && new Date(inv.dueDate) < new Date();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Billing & Invoicing</h1>
        {tab === 'history' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {['All', ...STATUS_OPTIONS].map(s => (
              <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.375rem 0.875rem', fontSize: '0.8rem' }} onClick={() => { setStatusFilter(s); setHistoryPage(1); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>
          <Plus size={15} /> New Invoice / Bill
        </button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <FileText size={15} /> Invoice History
          <span className="badge badge-secondary">{invoices?.length || 0}</span>
        </button>
        <button className={`tab-btn ${tab === 'pricelist' ? 'active' : ''}`} onClick={() => setTab('pricelist')}>
          <List size={15} /> Price List
        </button>
      </div>

      {/* ── Bill Tabs (POS hold-bill style) ── */}
      {tab === 'new' && (heldBills.length > 0 || invoiceItems.length > 0 || selectedParty) && (
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {/* Active bill tab */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--primary)', color: '#fff', borderRadius: 6, padding: '0.375rem 0.625rem 0.375rem 0.875rem', fontSize: '0.8rem', fontWeight: 600 }}>
            <span>Bill #{activeBillId}{selectedParty && parties ? ` — ${parties.find(p => p.id.toString() === selectedParty)?.name?.slice(0, 12) || ''}` : ''}</span>
            <button onClick={() => closeBillTab(activeBillId)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: '0.5rem', lineHeight: 1, opacity: 0.8, fontSize: '0.85rem' }} title="Close this bill">✕</button>
          </div>
          {/* Held bill tabs */}
          {heldBills.map(b => {
            const heldParty = b.selectedParty && parties ? parties.find(p => p.id.toString() === b.selectedParty) : null;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.375rem 0.625rem 0.375rem 0.875rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => switchBillTab(b.id)}>
                <span>Bill #{b.id}{heldParty ? ` — ${heldParty.name.slice(0, 12)}` : b.invoiceItems?.length > 0 ? ` (${b.invoiceItems.length} items)` : ''}</span>
                <button onClick={e => { e.stopPropagation(); closeBillTab(b.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '0.5rem', lineHeight: 1, fontSize: '0.85rem' }} title="Close">✕</button>
              </div>
            );
          })}
          <button className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }} onClick={addBillTab} title="Create a new bill in a new tab">
            <Plus size={14} /> New Bill
          </button>
        </div>
      )}
      {tab === 'new' && heldBills.length === 0 && invoiceItems.length === 0 && !selectedParty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }} onClick={addBillTab}>
            <Plus size={14} /> New Bill Tab
          </button>
        </div>
      )}

      {/* ── New Invoice ── */}
      {tab === 'new' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Invoice Details</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                  <label className="form-label">Customer</label>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Search customer..."
                        value={showPartyDropdown ? partySearch : (selectedPartyObj ? selectedPartyObj.name : '')}
                        onChange={e => {
                          setPartySearch(e.target.value);
                          setSelectedParty('');
                          setShowPartyDropdown(true);
                        }}
                        onFocus={() => {
                          setPartySearch('');
                          setShowPartyDropdown(true);
                        }}
                        onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
                      />
                      {selectedParty && (
                        <button
                          type="button"
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParty('');
                            setPartySearch('');
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem' }}
                      title="Add new contact"
                      onClick={() => setNewPartyModal({ type: 'Customer', name: partySearch, phone: '', gstin: '', address: '' })}
                    >
                      <Plus size={16} />
                    </button>
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
                        const matchesType = p.type === 'Customer';
                        if (!matchesType) return false;
                        if (!partySearch) return true;
                        return p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
                               (p.phone && p.phone.includes(partySearch)) ||
                               (p.gstin && p.gstin.toLowerCase().includes(partySearch.toLowerCase()));
                      }).map(p => (
                        <div
                          key={p.id}
                          onMouseDown={() => {
                            setSelectedParty(p.id.toString());
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
                            {p.phone && `📞 ${p.phone}`} {p.gstin && ` · GST: ${p.gstin}`}
                          </div>
                        </div>
                      ))}
                      {parties?.filter(p => p.type === 'Customer').filter(p => {
                        if (!partySearch) return true;
                        return p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
                               (p.phone && p.phone.includes(partySearch)) ||
                               (p.gstin && p.gstin.toLowerCase().includes(partySearch.toLowerCase()));
                      }).length === 0 && (
                        <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          No matches found.
                          <div
                            onMouseDown={() => setNewPartyModal({ type: 'Customer', name: partySearch, phone: '', gstin: '', address: '' })}
                            style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', marginTop: '0.25rem' }}
                          >
                            + Add "{partySearch || 'New Contact'}"
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Due Date (optional)</label>
                  <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Payment Status</label>
                  <select className="form-input" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0, position: 'relative' }}>
                  <label className="form-label">Product</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search product..."
                      value={showProductDropdown ? productSearch : (selectedProductObj ? selectedProductObj.name : '')}
                      onChange={e => {
                        setProductSearch(e.target.value);
                        setSelectedProduct('');
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => {
                        setProductSearch('');
                        setShowProductDropdown(true);
                      }}
                      onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                    />
                    {selectedProduct && (
                      <button
                        type="button"
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
                        onClick={(e) => { e.stopPropagation(); setSelectedProduct(''); setProductSearch(''); }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {showProductDropdown && (
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
                      maxHeight: '220px',
                      overflowY: 'auto',
                      marginTop: '2px'
                    }}>
                      {(() => {
                        const filtered = variantsForBilling?.filter(v =>
                          !productSearch ||
                          v.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
                          (v.packSize && v.packSize.toLowerCase().includes(productSearch.toLowerCase())) ||
                          (v.hsn && v.hsn.includes(productSearch))
                        ) || [];
                        if (filtered.length === 0) return (
                          <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            No products found.
                          </div>
                        );
                        return filtered.map(v => {
                          const outOfStock = invoiceType === 'Sales' && v.currentStock === 0;
                          const lowStock = v.currentStock <= (v.reorderPoint || 10) && v.currentStock > 0;
                          return (
                            <div
                              key={v.id}
                              onMouseDown={() => {
                                if (outOfStock) return;
                                setSelectedProduct(v.id.toString());
                                setProductSearch(v.name);
                                setShowProductDropdown(false);
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                cursor: outOfStock ? 'not-allowed' : 'pointer',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                opacity: outOfStock ? 0.5 : 1,
                              }}
                              className={outOfStock ? '' : 'dropdown-item-hover'}
                            >
                              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{v.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                ₹{v.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · {v.unit}
                                {' · '}
                                <span style={{ color: outOfStock ? 'var(--danger)' : lowStock ? 'var(--warning)' : 'var(--text-muted)' }}>
                                  Stock: {v.currentStock} packs
                                  {outOfStock && ' · Out of Stock'}
                                  {lowStock && ' · Low'}
                                </span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ width: '90px', marginBottom: 0 }}>
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
                      <th>Rate</th>
                      <th>Disc%</th>
                      <th>GST</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((item, index) => {
                      const rate = item.rate || item.basePrice;
                      const gross = rate * item.qty;
                      const itemDiscAmt = gross * (item.itemDiscountPct || 0) / 100;
                      const afterItemDisc = gross - itemDiscAmt;
                      const invDiscAmt = afterItemDisc * invDiscPct / 100;
                      const taxable = afterItemDisc - invDiscAmt;
                      const tax = taxable * (item.gstRate / 100);
                      return (
                        <tr key={index}>
                          <td style={{ fontWeight: 500 }}>{item.name}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.qtyStr !== undefined ? item.qtyStr : String(item.qty)}
                              onChange={e => updateQtyStr(index, e.target.value)}
                              onBlur={() => finalizeQty(index)}
                              style={{ width: '60px', padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.875rem' }}
                            />
                          </td>
                          <td>₹{rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.discStr !== undefined ? item.discStr : String(item.itemDiscountPct || 0)}
                                onChange={e => updateDiscStr(index, e.target.value)}
                                onBlur={() => finalizeDisc(index)}
                                style={{ width: '50px', padding: '0.25rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-main)', fontSize: '0.8rem' }}
                              />
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                            </div>
                          </td>
                          <td>{item.gstRate}%</td>
                          <td style={{ fontWeight: 600 }}>₹{(taxable + tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td>
                            <button className="btn" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeItem(index)}>
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {invoiceItems.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No items added yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {invoiceItems.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Shipping / Handling (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      value={shipping}
                      onChange={e => setShipping(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                      onBlur={() => { const v = parseFloat(shipping); setShipping(isNaN(v) || v < 0 ? '' : String(v)); }}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Additional Discount (%)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      value={discountPct}
                      onChange={e => setDiscountPct(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
                      onBlur={() => { const v = Math.min(100, Math.max(0, parseFloat(discountPct) || 0)); setDiscountPct(v === 0 ? '' : String(v)); }}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label className="form-label">Payment Terms</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {TERMS_PRESETS.map(p => (
                        <button key={p} type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => setTerms(p)}>
                          {p.slice(0, 20)}…
                        </button>
                      ))}
                    </div>
                    <textarea className="form-input" rows={2} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment terms, e.g. Due within 30 days." style={{ resize: 'vertical' }} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label className="form-label">Notes (printed on invoice)</label>
                    <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes or instructions for the recipient." style={{ resize: 'vertical' }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="card" style={{ position: 'sticky', top: '1rem', marginBottom: 0 }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.25rem' }}>Summary</h2>

              {/* Tax type indicator */}
              {selectedParty && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <span className={`badge ${isInterState ? 'badge-warning' : 'badge-primary'}`} style={{ fontSize: '0.75rem' }}>
                    {isInterState ? 'IGST — Inter-state' : 'CGST + SGST — Intra-state'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Gross Amount</span>
                  <span style={{ color: 'var(--text-main)' }}>₹{totals.gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {totals.itemDiscountAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                    <span>Item Discounts</span>
                    <span>-₹{totals.itemDiscountAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {invDiscPct > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                    <span>Add. Discount ({invDiscPct}%)</span>
                    <span>-₹{totals.discountAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Taxable Amount</span>
                  <span style={{ color: 'var(--text-main)' }}>₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {taxType === 'IGST' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>IGST</span>
                    <span style={{ color: 'var(--text-main)' }}>₹{totals.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>CGST</span>
                      <span style={{ color: 'var(--text-main)' }}>₹{(totals.taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>SGST</span>
                      <span style={{ color: 'var(--text-main)' }}>₹{(totals.taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                {shipAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Shipping</span>
                    <span style={{ color: 'var(--text-main)' }}>₹{shipAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--border)', fontWeight: 700, fontSize: '1.125rem' }}>
                <span>Grand Total</span>
                <span style={{ color: 'var(--primary)' }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Payment Methods Section */}
              {invoiceItems.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment Received</span>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={addPaymentRow}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  {payments.map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                      <select
                        className="form-input"
                        style={{ flex: '0 0 auto', width: '110px', padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                        value={p.method}
                        onChange={e => updatePayment(idx, 'method', e.target.value)}
                      >
                        {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="form-input"
                        style={{ flex: 1, padding: '0.3rem 0.4rem', fontSize: '0.78rem' }}
                        placeholder="Amount"
                        value={p.amountStr}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                          updatePayment(idx, 'amountStr', raw);
                          updatePayment(idx, 'amount', parseFloat(raw) || 0);
                        }}
                        onBlur={() => {
                          const v = Math.max(0, parseFloat(p.amountStr) || 0);
                          updatePayment(idx, 'amount', v);
                          updatePayment(idx, 'amountStr', v > 0 ? String(v) : '');
                        }}
                      />
                      <button type="button" onClick={() => removePayment(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.2rem' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {payments.length > 0 && (() => {
                    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                    const balance = grandTotal - totalPaid;
                    return (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                          <span>Total Paid</span>
                          <span style={{ fontWeight: 600, color: totalPaid >= grandTotal ? 'var(--success)' : 'var(--text-main)' }}>
                            ₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {balance !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: balance > 0 ? 'var(--warning)' : 'var(--success)' }}>
                            <span>{balance > 0 ? 'Balance Due' : 'Change'}</span>
                            <span style={{ fontWeight: 600 }}>₹{Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: totalPaid >= grandTotal ? 'var(--success)' : totalPaid > 0 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 600 }}>
                          Status: {totalPaid >= grandTotal && grandTotal > 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : paymentStatus}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Live UPI QR for in-person payment */}
              {companyUpiId && grandTotal > 0 && invoiceType === 'Sales' && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center', fontWeight: 500 }}>
                    Show QR to Customer — Scan &amp; Pay ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <UpiQrImage upiId={companyUpiId} name={companyName} amount={grandTotal} />
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.625rem', fontSize: '0.8rem' }}
                    onClick={() => setPaymentStatus('Paid')}
                  >
                    <CheckCircle size={14} /> Mark as Paid
                  </button>
                </div>
              )}

              {draftId && (
                <div style={{ fontSize: '0.75rem', color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '0.375rem 0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
                  Editing Draft — finalise below or keep saving
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ flex: '0 0 auto', padding: '0.75rem 1rem' }} onClick={handleSaveDraft} disabled={saving} title="Save as draft (no stock change)">
                    Draft
                  </button>
                  <button id="billing-save-btn" className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }} onClick={handlePreview} disabled={invoiceItems.length === 0 || !selectedParty || saving}>
                    {saving ? 'Working…' : <><Eye size={16} /> Preview &amp; Print</>}
                  </button>
                </div>

                {/* Print buttons appear after invoice is saved */}
                {savedInvoice && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.625rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={handlePrintPOS}
                      title="Print 80mm POS / thermal receipt"
                    >
                      <Printer size={14} /> POS Receipt
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.625rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={handlePrintPDF}
                      disabled={saving}
                      title="Download A4 GST Tax Invoice PDF"
                    >
                      <Download size={14} /> Tax Invoice PDF
                    </button>
                  </div>
                )}
              </div>

              {(invoiceItems.length > 0 || savedInvoice) && (
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={resetCurrentBill}>
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice History ── */}
      {tab === 'history' && (
        <>
          <div className="card" style={{ padding: '0.875rem 1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>Filter Date:</span>
              <input type="date" className="form-input" style={{ width: 'auto', padding: '0.375rem 0.625rem', fontSize: '0.85rem' }} value={fromDate} onChange={e => { setFromDate(e.target.value); setHistoryPage(1); }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>to</span>
              <input type="date" className="form-input" style={{ width: 'auto', padding: '0.375rem 0.625rem', fontSize: '0.85rem' }} value={toDate} onChange={e => { setToDate(e.target.value); setHistoryPage(1); }} />
              {(fromDate || toDate) && (
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.375rem 0.625rem' }} onClick={() => { setFromDate(''); setToDate(''); setHistoryPage(1); }}>
                  Clear Date
                </button>
              )}
            </div>
          </div>
          <div className="card">
          {filteredInvoices.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} className="empty-state-icon" />
              <p>No invoices found{statusFilter !== 'All' ? ` with status "${statusFilter}"` : ''}.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Due Date</th>
                    <th>Type</th>
                    <th>Tax</th>
                    <th>Party</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedInvoices.map(inv => {
                    const party = parties?.find(p => p.id === inv.partyId);
                    const isConfirmDelete = confirmDeleteId === inv.id;
                    const overdue = isOverdue(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => inv.status !== 'Draft' && setViewInvoice(inv)}
                        style={{ cursor: inv.status !== 'Draft' ? 'pointer' : 'default', ...(overdue ? { background: 'rgba(239,68,68,0.04)' } : {}) }}
                      >
                        <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {inv.invoiceNumber || `INV-${inv.id}`}
                          {overdue && <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: '0.65rem' }}>Overdue</span>}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(inv.date)}</td>
                        <td style={{ fontSize: '0.8rem', color: overdue ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {inv.dueDate ? fmtDate(inv.dueDate) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${inv.type === 'Purchase' ? 'badge-warning' : 'badge-primary'}`}>
                            {inv.type || 'Sales'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${inv.taxType === 'IGST' ? 'badge-warning' : 'badge-secondary'}`} style={{ fontSize: '0.65rem' }}>
                            {inv.taxType === 'IGST' ? 'IGST' : 'C+S GST'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{party?.name || '—'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>₹{(inv.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontSize: '0.78rem', maxWidth: '120px' }}>
                          {inv.payments?.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {inv.payments.map((p, i) => (
                                <span key={i} style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                  {p.method}: ₹{(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              ))}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td>
                          <select className="form-input" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto' }} value={inv.status || 'Pending'} onChange={e => handleStatusChange(inv, e.target.value)}>
                            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {inv.status === 'Draft' ? (
                              <button className="btn btn-primary" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }} onClick={() => handleResumeDraft(inv)} title="Resume draft">Resume</button>
                            ) : (
                              <>
                                <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setViewInvoice(inv)} title="View invoice"><Eye size={14} /></button>
                                <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleReprintPDF(inv)} title="Download A4 PDF"><Download size={14} /></button>
                                <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleReprintPOS(inv)} title="Print POS / thermal receipt"><Printer size={14} /></button>
                              </>
                            )}
                            {inv.status === 'Pending' && (
                              <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setReminderInvId(inv.id)} title="Send Reminder"><Bell size={14} /></button>
                            )}
                            {(inv.status === 'Paid' || inv.status === 'Pending') && inv.type !== 'CreditNote' && inv.type !== 'DebitNote' && (
                              <button className="btn btn-secondary" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }} onClick={() => handleOpenNoteModal(inv)} title={inv.type === 'Purchase' ? 'Debit Note' : 'Credit Note'}>
                                {inv.type === 'Purchase' ? 'DR' : 'CR'}
                              </button>
                            )}
                            {isConfirmDelete ? (
                              <>
                                <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDeleteInvoice(inv)}>Yes</button>
                                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                              </>
                            ) : (
                              <button className="btn" style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => setConfirmDeleteId(inv.id)} title="Delete"><Trash2 size={14} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.625rem' }} onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}>‹ Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = totalPages <= 5 ? i + 1 : Math.min(Math.max(historyPage - 2 + i, 1), totalPages - 4 + i);
                  return (
                    <button key={pg} className={`btn ${historyPage === pg ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.25rem 0.625rem', minWidth: '32px' }} onClick={() => setHistoryPage(pg)}>
                      {pg}
                    </button>
                  );
                })}
                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.625rem' }} onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))} disabled={historyPage === totalPages}>Next ›</button>
              </div>
            </div>
          )}
        </div></>
      )}

      {/* ── Price List ── */}
      {tab === 'pricelist' && (
        <div className="card">
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Product & Service Price List</h2>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{variantsForBilling?.length || 0} items</span>
          </div>
          {!variantsForBilling?.length ? (
            <div className="empty-state">
              <List size={40} className="empty-state-icon" />
              <p>No products found. Add products in Inventory.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Product / Service</th>
                    <th>HSN/SAC</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Purchase Price</th>
                    <th style={{ textAlign: 'right' }}>Sell Price</th>
                    <th style={{ textAlign: 'right' }}>GST %</th>
                    <th style={{ textAlign: 'right' }}>Sell + GST</th>
                    <th style={{ textAlign: 'right' }}>Stock (Packs)</th>
                  </tr>
                </thead>
                <tbody>
                  {variantsForBilling.map(v => {
                    const sellWithGST = v.sellingPrice * (1 + v.gstRate / 100);
                    const lowStock = v.currentStock <= (v.reorderPoint || 10);
                    return (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 500 }}>{v.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.hsn || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.unit}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--text-muted)' }}>₹{(v.purchasePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{v.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{v.gstRate}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₹{sellWithGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: lowStock ? 'var(--danger)' : 'var(--success)', fontWeight: 600, fontSize: '0.875rem' }}>
                            {v.currentStock}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice Preview Modal ── */}
      {previewUrl && (
        <Modal title="Invoice Preview" onClose={closePreview} size="lg">
          <iframe
            title="Invoice preview"
            src={previewUrl}
            style={{ width: '100%', height: '65vh', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
          />
          <div className="modal-footer" style={{ padding: '1rem 0 0', border: 'none' }}>
            <button className="btn btn-secondary" onClick={closePreview} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveAndPrint} disabled={saving}>
              {saving ? 'Saving…' : <><Printer size={16} /> Save &amp; Print</>}
            </button>
          </div>
        </Modal>
      )}

      {/* ── View Invoice Modal ── */}
      {viewInvoice && (
        <Modal title={`${viewInvoice.type || 'Sales'} Invoice ${viewInvoice.invoiceNumber || `INV-${viewInvoice.id}`}`} onClose={() => setViewInvoice(null)} size="lg">
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Party</div>
                <div style={{ fontWeight: 600 }}>{parties?.find(p => p.id === viewInvoice.partyId)?.name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Date</div>
                <div style={{ fontWeight: 600 }}>{fmtDate(viewInvoice.date)}</div>
              </div>
              {viewInvoice.dueDate && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Due Date</div>
                  <div style={{ fontWeight: 600, color: isOverdue(viewInvoice) ? 'var(--danger)' : 'var(--text-main)' }}>{fmtDate(viewInvoice.dueDate)}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Status</div>
                <span className={`badge ${statusBadgeClass(viewInvoice.status)}`}>{viewInvoice.status}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Tax Type</div>
                <span className={`badge ${viewInvoice.taxType === 'IGST' ? 'badge-warning' : 'badge-primary'}`}>
                  {viewInvoice.taxType === 'IGST' ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Grand Total</div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--primary)' }}>{fmtINR(viewInvoice.total)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>PDF Theme</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{INVOICE_THEMES[viewInvoice.theme]?.name || 'Classic Blue'}</div>
              </div>
              {viewInvoice.payments?.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', fontWeight: 600 }}>PAYMENTS RECEIVED</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {viewInvoice.payments.map((p, i) => (
                      <span key={i} className="badge badge-secondary" style={{ fontSize: '0.8rem', padding: '0.25rem 0.625rem' }}>
                        {p.method}: {fmtINR(p.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {viewInvoice.lineItems?.length > 0 ? (
              <>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Items</h3>
                <div className="table-container" style={{ marginBottom: '1rem' }}>
                  <table>
                    <thead>
                      <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Disc%</th><th>GST%</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {viewInvoice.lineItems.map((item, i) => {
                        const rate = item.rate || item.basePrice;
                        const invDiscPctV = viewInvoice.discountPct || 0;
                        const gross = rate * item.qty;
                        const itemDiscAmt = gross * (item.itemDiscountPct || 0) / 100;
                        const afterItemDisc = gross - itemDiscAmt;
                        const invDiscAmt = afterItemDisc * invDiscPctV / 100;
                        const taxable = afterItemDisc - invDiscAmt;
                        const tax = taxable * (item.gstRate / 100);
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                            <td>{item.qty} {item.unit}</td>
                            <td>₹{rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {item.itemDiscountPct > 0 ? `${item.itemDiscountPct}%` : '—'}
                            </td>
                            <td>{item.gstRate}%</td>
                            <td style={{ fontWeight: 600 }}>{fmtINR(taxable + tax)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', fontSize: '0.875rem' }}>
                  {viewInvoice.itemDiscountAmt > 0 && (
                    <div style={{ color: 'var(--success)' }}>Item Discounts: <strong>-{fmtINR(viewInvoice.itemDiscountAmt)}</strong></div>
                  )}
                  {viewInvoice.discountPct > 0 && (
                    <div style={{ color: 'var(--success)' }}>Add. Discount ({viewInvoice.discountPct}%): <strong>-{fmtINR(viewInvoice.discountAmt)}</strong></div>
                  )}
                  <div style={{ color: 'var(--text-muted)' }}>Taxable: <strong>{fmtINR(viewInvoice.subtotal)}</strong></div>
                  {viewInvoice.taxType === 'IGST' ? (
                    <div style={{ color: 'var(--text-muted)' }}>IGST: <strong>{fmtINR(viewInvoice.taxAmount)}</strong></div>
                  ) : (
                    <>
                      <div style={{ color: 'var(--text-muted)' }}>CGST: <strong>{fmtINR(viewInvoice.taxAmount / 2)}</strong></div>
                      <div style={{ color: 'var(--text-muted)' }}>SGST: <strong>{fmtINR(viewInvoice.taxAmount / 2)}</strong></div>
                    </>
                  )}
                  {viewInvoice.shipping > 0 && <div style={{ color: 'var(--text-muted)' }}>Shipping: <strong>{fmtINR(viewInvoice.shipping)}</strong></div>}
                  <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
                    Total: <span style={{ color: 'var(--primary)' }}>{fmtINR(viewInvoice.total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>Detailed line items not available.</div>
            )}

            {viewInvoice.terms && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>TERMS</div>
                <div style={{ fontSize: '0.875rem' }}>{viewInvoice.terms}</div>
              </div>
            )}
            {viewInvoice.notes && (
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-color)', borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>NOTES</div>
                <div style={{ fontSize: '0.875rem' }}>{viewInvoice.notes}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setViewInvoice(null)}>Close</button>
              {viewInvoice.lineItems?.length > 0 && (
                <button className="btn btn-primary" onClick={() => { handleReprintPDF(viewInvoice); setViewInvoice(null); }}>
                  <Download size={15} /> Download PDF
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Credit/Debit Note Modal ── */}
      {noteModal && (() => {
        const { inv, noteType } = noteModal;
        const party = parties?.find(p => p.id === inv.partyId);
        const label = noteType === 'CreditNote' ? 'Credit Note' : 'Debit Note';
        return (
          <Modal title={`Issue ${label} — Ref: ${inv.invoiceNumber}`} onClose={() => setNoteModal(null)} size="lg">
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {noteType === 'CreditNote' ? 'Sales return: stock will be restored.' : 'Purchase return: stock will be reduced.'}
              {' '}Adjust return quantities below.
            </p>
            <div className="table-container" style={{ marginBottom: '1rem' }}>
              <table>
                <thead>
                  <tr><th>Item</th><th>Orig. Qty</th><th>Return Qty</th><th style={{ textAlign: 'right' }}>Rate</th></tr>
                </thead>
                <tbody>
                  {noteReturnItems.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{item.name}</td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.qty}</td>
                      <td>
                        <input
                          type="number" min={0} max={item.qty} className="form-input"
                          style={{ width: 80, padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                          value={item.returnQty}
                          onChange={e => {
                            const updated = [...noteReturnItems];
                            updated[idx] = { ...updated[idx], returnQty: Math.min(item.qty, Math.max(0, Number(e.target.value) || 0)) };
                            setNoteReturnItems(updated);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.875rem' }}>{fmtINR(item.rate || item.basePrice || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setNoteModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirmNote} disabled={saving}>
                {saving ? 'Issuing…' : `Issue ${label} & PDF`}
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ── Reminder Modal ── */}
      {reminderInvId && (() => {
        const inv = invoices?.find(i => i.id === reminderInvId);
        if (!inv) return null;
        const party = parties?.find(p => p.id === inv.partyId);
        const msg = `Dear ${party?.name || 'Customer'},\n\nThis is a gentle reminder that invoice ${inv.invoiceNumber} for ${fmtINR(inv.total)} (dated ${fmtDate(inv.date)}) is currently outstanding.\n\nKindly arrange payment at your earliest convenience.\n\nThank you for your business.`;
        return (
          <Modal title="Payment Reminder" onClose={() => setReminderInvId(null)}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Copy this reminder message and send it to <strong>{party?.name}</strong>:
            </p>
            <textarea readOnly value={msg} rows={7} className="form-input" style={{ fontFamily: 'inherit', resize: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setReminderInvId(null)}>Cancel</button>
              <button className="btn btn-secondary" onClick={() => copyReminder(inv)}>
                Copy
              </button>
              <button className="btn btn-primary" onClick={() => sendWhatsAppReminder(inv)}>
                Send via WhatsApp
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* ── Inline Add Contact Modal ── */}
      {newPartyModal && (
        <Modal title={`Add Contact (${newPartyModal.type})`} onClose={() => setNewPartyModal(null)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const data = {
              name: newPartyModal.name.trim(),
              type: newPartyModal.type,
              gstin: newPartyModal.gstin.toUpperCase().replace(/\s/g, ''),
              phone: newPartyModal.phone.trim(),
              address: newPartyModal.address.trim(),
              email: '',
              activities: []
            };

            if (!data.name) {
              toast('Name is required', 'warning');
              return;
            }
            const { validateGSTIN, validatePhone } = await import('../utils/validators');
            const gstinCheck = validateGSTIN(data.gstin);
            if (!gstinCheck.valid) { toast(gstinCheck.message, 'error'); return; }
            const phoneCheck = validatePhone(data.phone);
            if (!phoneCheck.valid) { toast(phoneCheck.message, 'error'); return; }

            try {
              const newId = await db.parties.add(data);
              toast('Contact added successfully!', 'success');
              setSelectedParty(newId.toString());
              setPartySearch(data.name);
              setNewPartyModal(null);
            } catch (err) {
              toast('Failed to save contact: ' + err.message, 'error');
            }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Company / Person Name *</label>
                <input required type="text" className="form-input" value={newPartyModal.name}
                  onChange={e => setNewPartyModal(m => ({ ...m, name: e.target.value }))} placeholder="Acme Pvt. Ltd." autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={newPartyModal.type} onChange={e => setNewPartyModal(m => ({ ...m, type: e.target.value }))}>
                  <option value="Customer">Customer</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input type="text" className="form-input" value={newPartyModal.gstin}
                  onChange={e => setNewPartyModal(m => ({ ...m, gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input" value={newPartyModal.phone}
                  onChange={e => setNewPartyModal(m => ({ ...m, phone: e.target.value }))} placeholder="9999999999" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Address</label>
                <textarea className="form-input" rows={2} value={newPartyModal.address}
                  onChange={e => setNewPartyModal(m => ({ ...m, address: e.target.value }))} placeholder="City, State, PIN" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setNewPartyModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Add Contact</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
