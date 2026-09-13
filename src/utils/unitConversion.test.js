import { describe, it, expect } from 'vitest';
import { convertUnit, canConvert, UNIT_OPTIONS } from './unitConversion';

describe('convertUnit', () => {
  it('returns the value unchanged when from === to', () => {
    expect(convertUnit(5, 'KG', 'KG')).toBe(5);
  });

  it('is case- and whitespace-insensitive for the identity check', () => {
    expect(convertUnit(5, ' kg ', 'KG')).toBe(5);
  });

  it('scales up (KG -> G)', () => {
    expect(convertUnit(2, 'KG', 'G')).toBe(2000);
  });

  it('scales down (G -> KG)', () => {
    expect(convertUnit(500, 'G', 'KG')).toBe(0.5);
  });

  it('converts within the count dimension (DOZEN -> PCS)', () => {
    expect(convertUnit(2, 'DOZEN', 'PCS')).toBe(24);
  });

  it('converts GROSS -> DOZEN', () => {
    expect(convertUnit(1, 'GROSS', 'DOZEN')).toBe(12);
  });

  it('throws on an unknown unit', () => {
    expect(() => convertUnit(1, 'KG', 'FOO')).toThrow(/Unknown unit/);
  });

  it('throws when converting across dimensions (KG -> LTR)', () => {
    expect(() => convertUnit(1, 'KG', 'LTR')).toThrow(/Cannot convert/);
  });
});

describe('canConvert', () => {
  it('is true for same-dimension units', () => {
    expect(canConvert('KG', 'G')).toBe(true);
  });

  it('is false across dimensions', () => {
    expect(canConvert('KG', 'LTR')).toBe(false);
  });

  it('is false for an unknown unit', () => {
    expect(canConvert('KG', 'FOO')).toBe(false);
  });
});

describe('UNIT_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(UNIT_OPTIONS)).toBe(true);
    expect(UNIT_OPTIONS.length).toBeGreaterThan(0);
  });

  it('every entry has string value + label and a valid dim', () => {
    for (const o of UNIT_OPTIONS) {
      expect(typeof o.value).toBe('string');
      expect(typeof o.label).toBe('string');
      expect(['mass', 'volume', 'length', 'energy', 'count']).toContain(o.dim);
    }
  });

  it('every value is a unit convertUnit accepts', () => {
    for (const o of UNIT_OPTIONS) {
      expect(canConvert(o.value, o.value)).toBe(true);
    }
  });
});
