import { describe, it, expect } from 'vitest';
import {
  validateGSTIN,
  validatePAN,
  validatePhone,
  validateIFSC,
  validateEmail,
  validatePositiveNumber,
  sanitizeNumericInput,
  parseNumericInput,
  isDummyPhone,
  normalizePhone,
  normalizeGSTIN,
  collectErrors,
} from './validators';

describe('validateGSTIN', () => {
  it('treats empty input as valid (optional field)', () => {
    expect(validateGSTIN('')).toEqual({ valid: true, message: '' });
  });

  it('accepts a well-formed GSTIN', () => {
    expect(validateGSTIN('22AAAAA0000A1Z5')).toEqual({ valid: true, message: '' });
  });

  it('rejects the wrong length with the length message', () => {
    expect(validateGSTIN('22AAAAA0000A1Z')).toEqual({
      valid: false,
      message: 'GSTIN must be exactly 15 characters',
    });
  });

  it('rejects a 15-char string that does not match the pattern', () => {
    expect(validateGSTIN('AAAAAAAAAAAAAAA')).toEqual({
      valid: false,
      message: 'GSTIN format invalid (e.g. 22AAAAA0000A1Z5)',
    });
  });
});

describe('validatePAN', () => {
  it('treats empty input as valid', () => {
    expect(validatePAN('')).toEqual({ valid: true, message: '' });
  });

  it('accepts a well-formed PAN', () => {
    expect(validatePAN('AAAAA0000A')).toEqual({ valid: true, message: '' });
  });

  it('rejects a malformed PAN with the format message', () => {
    expect(validatePAN('ABC123')).toEqual({
      valid: false,
      message: 'PAN format invalid (e.g. AAAAA0000A)',
    });
  });

  it('rejects the wrong final-char shape', () => {
    expect(validatePAN('AAAAA00000').valid).toBe(false);
  });
});

describe('validatePhone', () => {
  it('treats empty input as valid', () => {
    expect(validatePhone('')).toEqual({ valid: true, message: '' });
  });

  it('accepts a 10-digit number (ignoring separators)', () => {
    expect(validatePhone('98765-43210')).toEqual({ valid: true, message: '' });
  });

  it('rejects a 9-digit number with the range message', () => {
    expect(validatePhone('123456789')).toEqual({
      valid: false,
      message: 'Phone must be 10–13 digits',
    });
  });

  it('rejects a 14-digit number', () => {
    expect(validatePhone('12345678901234').valid).toBe(false);
  });
});

describe('validateIFSC', () => {
  it('treats empty input as valid', () => {
    expect(validateIFSC('')).toEqual({ valid: true, message: '' });
  });

  it('accepts a well-formed IFSC', () => {
    expect(validateIFSC('SBIN0000123')).toEqual({ valid: true, message: '' });
  });

  it('rejects a code without the mandatory 5th-char zero', () => {
    expect(validateIFSC('SBIN1234567')).toEqual({
      valid: false,
      message: 'IFSC format invalid (e.g. SBIN0000123)',
    });
  });
});

describe('validateEmail', () => {
  it('treats empty input as valid', () => {
    expect(validateEmail('')).toEqual({ valid: true, message: '' });
  });

  it('accepts a normal address (trimmed)', () => {
    expect(validateEmail('  user@example.com  ')).toEqual({ valid: true, message: '' });
  });

  it('rejects a string with no @', () => {
    expect(validateEmail('not-an-email')).toEqual({
      valid: false,
      message: 'Invalid email address',
    });
  });

  it('rejects an address with no domain dot', () => {
    expect(validateEmail('user@example').valid).toBe(false);
  });
});

describe('validatePositiveNumber', () => {
  it('accepts zero', () => {
    expect(validatePositiveNumber(0)).toEqual({ valid: true, message: '' });
  });

  it('accepts a positive number', () => {
    expect(validatePositiveNumber('12.5')).toEqual({ valid: true, message: '' });
  });

  it('rejects a negative number with the field name in the message', () => {
    expect(validatePositiveNumber(-1, 'Rate')).toEqual({
      valid: false,
      message: 'Rate cannot be negative',
    });
  });

  it('rejects a non-numeric string with the number message', () => {
    expect(validatePositiveNumber('abc')).toEqual({
      valid: false,
      message: 'Value must be a number',
    });
  });

  // Characterization: unlike the other validators this one has no empty-input
  // guard, so '' parses to NaN and is reported invalid.
  it('reports empty input as invalid (no optional-field guard)', () => {
    expect(validatePositiveNumber('')).toEqual({
      valid: false,
      message: 'Value must be a number',
    });
  });
});

describe('sanitizeNumericInput', () => {
  it('strips non-numeric characters, keeping one dot by default', () => {
    expect(sanitizeNumericInput('a1b2.5c')).toBe('12.5');
  });

  it('collapses a second dot', () => {
    expect(sanitizeNumericInput('1.2.3')).toBe('1.23');
  });

  it('drops the dot when allowDecimal is false', () => {
    expect(sanitizeNumericInput('12.5', { allowDecimal: false })).toBe('125');
  });
});

describe('parseNumericInput', () => {
  it('returns defaultValue for non-numeric input', () => {
    expect(parseNumericInput('abc')).toBe(0);
    expect(parseNumericInput('abc', { defaultValue: 7 })).toBe(7);
  });

  it('clamps below min and above max', () => {
    expect(parseNumericInput('5', { min: 10 })).toBe(10);
    expect(parseNumericInput('50', { max: 20 })).toBe(20);
  });

  it('passes through an in-range value', () => {
    expect(parseNumericInput('15', { min: 10, max: 20 })).toBe(15);
  });
});

describe('isDummyPhone', () => {
  it('is true for a known dummy number', () => {
    expect(isDummyPhone('9999999999')).toBe(true);
  });

  it('is false for a real-looking number not in the dummy set', () => {
    expect(isDummyPhone('9845367210')).toBe(false);
  });

  it('is true for a 10+ all-same-digit number via the repeat pattern', () => {
    expect(isDummyPhone('99999999999')).toBe(true);
  });

  it('is false for empty input', () => {
    expect(isDummyPhone('')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('strips everything but digits', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('normalizeGSTIN', () => {
  it('upper-cases and removes whitespace', () => {
    expect(normalizeGSTIN(' 22aaaaa0000a1z5 ')).toBe('22AAAAA0000A1Z5');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeGSTIN('')).toBe('');
  });
});

describe('collectErrors', () => {
  it('keeps only the invalid entries, keyed by field', () => {
    const out = collectErrors([
      { field: 'gstin', result: { valid: false, message: 'bad gstin' } },
      { field: 'pan', result: { valid: true, message: '' } },
      { field: 'phone', result: { valid: false, message: 'bad phone' } },
    ]);
    expect(out).toEqual({ gstin: 'bad gstin', phone: 'bad phone' });
  });

  it('returns an empty object when everything is valid', () => {
    expect(collectErrors([{ field: 'x', result: { valid: true, message: '' } }])).toEqual({});
  });
});
