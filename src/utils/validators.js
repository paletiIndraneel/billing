// ── GSTIN ────────────────────────────────────────────────────────────────────
// Format: 2-digit state code + 10-char PAN + 1 entity number + 'Z' + 1 checksum
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(value) {
  if (!value) return { valid: true, message: '' }; // optional field
  const v = value.toUpperCase().replace(/\s/g, '');
  if (v.length !== 15) return { valid: false, message: 'GSTIN must be exactly 15 characters' };
  if (!GSTIN_RE.test(v)) return { valid: false, message: 'GSTIN format invalid (e.g. 22AAAAA0000A1Z5)' };
  return { valid: true, message: '' };
}

// ── PAN ──────────────────────────────────────────────────────────────────────
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function validatePAN(value) {
  if (!value) return { valid: true, message: '' };
  const v = value.toUpperCase().replace(/\s/g, '');
  if (!PAN_RE.test(v)) return { valid: false, message: 'PAN format invalid (e.g. AAAAA0000A)' };
  return { valid: true, message: '' };
}

// ── Phone ─────────────────────────────────────────────────────────────────────
export function validatePhone(value) {
  if (!value) return { valid: true, message: '' };
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) {
    return { valid: false, message: 'Phone must be 10–13 digits' };
  }
  return { valid: true, message: '' };
}

// ── IFSC ─────────────────────────────────────────────────────────────────────
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function validateIFSC(value) {
  if (!value) return { valid: true, message: '' };
  const v = value.toUpperCase().replace(/\s/g, '');
  if (!IFSC_RE.test(v)) return { valid: false, message: 'IFSC format invalid (e.g. SBIN0000123)' };
  return { valid: true, message: '' };
}

// ── Email ─────────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  if (!value) return { valid: true, message: '' };
  if (!EMAIL_RE.test(value.trim())) return { valid: false, message: 'Invalid email address' };
  return { valid: true, message: '' };
}

// ── Positive number ───────────────────────────────────────────────────────────
export function validatePositiveNumber(value, fieldName = 'Value') {
  const n = parseFloat(value);
  if (isNaN(n)) return { valid: false, message: `${fieldName} must be a number` };
  if (n < 0) return { valid: false, message: `${fieldName} cannot be negative` };
  return { valid: true, message: '' };
}

// ── Numeric text input helpers ─────────────────────────────────────────────────
// Use these for inputs that must accept only numbers but need clean backspace UX
export function sanitizeNumericInput(raw, { allowDecimal = true } = {}) {
  if (allowDecimal) {
    return raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  }
  return raw.replace(/[^0-9]/g, '');
}

export function parseNumericInput(raw, { min = null, max = null, defaultValue = 0 } = {}) {
  const n = parseFloat(raw);
  if (isNaN(n)) return defaultValue;
  if (min !== null && n < min) return min;
  if (max !== null && n > max) return max;
  return n;
}

// ── Dummy / test phone number detection ───────────────────────────────────────
// Returns true for obviously fake test numbers used during data entry
const DUMMY_PHONE_PATTERNS = new Set([
  '9999999999', '9999999990', '8888888888', '7777777777', '6666666666',
  '5555555555', '1234567890', '0987654321', '1111111111', '2222222222',
  '3333333333', '4444444444', '0000000000', '9876543210',
]);

export function isDummyPhone(value) {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (DUMMY_PHONE_PATTERNS.has(digits)) return true;
  // Repeating-digit pattern like 9876543211 or all-same 9999999999
  if (/^(\d)\1{9,}$/.test(digits)) return true;
  return false;
}

// ── Duplicate detection helpers ───────────────────────────────────────────────
export function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function normalizeGSTIN(gstin) {
  if (!gstin) return '';
  return gstin.toUpperCase().replace(/\s/g, '');
}

// ── Convenience: collect form errors ─────────────────────────────────────────
export function collectErrors(checks) {
  return checks.reduce((acc, { field, result }) => {
    if (!result.valid) acc[field] = result.message;
    return acc;
  }, {});
}
