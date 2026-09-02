import { cid, q, one } from './_client';

const fromRow = (r) => r && ({
  id: r.id, name: r.name, gstin: r.gstin, address: r.address,
  phone: r.phone, email: r.email, upiId: r.upi_id, logoUrl: r.logo_url,
  bankName: r.bank_name, bankAccount: r.bank_account, bankIfsc: r.bank_ifsc,
  invoicePrefix: r.invoice_prefix, invoiceSeq: r.invoice_seq,
  defaultTerms: r.default_terms,
  creditNoteSeq: r.credit_note_seq, debitNoteSeq: r.debit_note_seq,
});

const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('gstin' in d) out.gstin = d.gstin || null;
  if ('address' in d) out.address = d.address || null;
  if ('phone' in d) out.phone = d.phone || null;
  if ('email' in d) out.email = d.email || null;
  if ('upiId' in d) out.upi_id = d.upiId || null;
  if ('logoUrl' in d) out.logo_url = d.logoUrl || null;
  if ('bankName' in d) out.bank_name = d.bankName || null;
  if ('bankAccount' in d) out.bank_account = d.bankAccount || null;
  if ('bankIfsc' in d) out.bank_ifsc = d.bankIfsc || null;
  if ('invoicePrefix' in d) out.invoice_prefix = d.invoicePrefix || 'INV';
  if ('invoiceSeq' in d) out.invoice_seq = d.invoiceSeq ?? 0;
  if ('defaultTerms' in d) out.default_terms = d.defaultTerms || null;
  return out;
};

export function formatInvoiceNumber(prefix, year, seq) {
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

export function formatNoteNumber(kind, year, seq) {
  return `${kind === 'CreditNote' ? 'CN' : 'DN'}-${year}-${String(seq).padStart(4, '0')}`;
}

export const getCompany = async () =>
  fromRow(await one(q('companies').select('*').eq('id', cid()).maybeSingle()));

export const updateCompany = async (patch) =>
  fromRow(await one(q('companies').update(toRow(patch)).eq('id', cid()).select().maybeSingle()));

export async function nextInvoiceNumber() {
  const co = await getCompany();
  if (!co) throw new Error('No company');
  const seq = (co.invoiceSeq || 0) + 1;
  const number = formatInvoiceNumber(co.invoicePrefix || 'INV', new Date().getFullYear(), seq);
  const { error } = await q('companies').update({ invoice_seq: seq }).eq('id', cid());
  if (error) throw new Error(error.message);
  return number;
}

export async function nextNoteNumber(kind) {
  const co = await getCompany();
  if (!co) throw new Error('No company');
  const col = kind === 'CreditNote' ? 'creditNoteSeq' : 'debitNoteSeq';
  const seq = (co[col] || 0) + 1;
  const number = formatNoteNumber(kind, new Date().getFullYear(), seq);
  const dbcol = kind === 'CreditNote' ? 'credit_note_seq' : 'debit_note_seq';
  const { error } = await q('companies').update({ [dbcol]: seq }).eq('id', cid());
  if (error) throw new Error(error.message);
  return number;
}
