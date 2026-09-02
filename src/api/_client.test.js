import { describe, it, expect, vi, afterEach } from 'vitest';
import { cid, newId } from './_client';

afterEach(() => localStorage.clear());

describe('cid', () => {
  it('returns the stored company id', () => {
    localStorage.setItem('lekhya_company_id', 'abc-123');
    expect(cid()).toBe('abc-123');
  });
  it('throws when no company id is stored', () => {
    expect(() => cid()).toThrow('No company selected');
  });
});

describe('newId', () => {
  it('returns a uuid-shaped string', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
