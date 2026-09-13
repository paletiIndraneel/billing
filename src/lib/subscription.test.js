import { describe, it, expect } from 'vitest';
import { evaluateAccess, daysRemaining, TRIAL_DAYS } from './subscription';

const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString();

describe('evaluateAccess', () => {
  it('trial before expiry', () => {
    expect(evaluateAccess({ status: 'trial', expiresAt: iso(5) })).toBe('trial');
  });
  it('active before expiry', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(30) })).toBe('active');
  });
  it('trial hard-blocks immediately once expired — no grace period', () => {
    expect(evaluateAccess({ status: 'trial', expiresAt: iso(-0.01) })).toBe('expired');
  });
  it('active subscription past expiry is expired', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(-3) })).toBe('expired');
  });
  it('suspended is always expired', () => {
    expect(evaluateAccess({ status: 'suspended', expiresAt: iso(10) })).toBe('expired');
  });
  it('null subscription is expired', () => {
    expect(evaluateAccess(null)).toBe('expired');
  });
});

describe('daysRemaining', () => {
  it('positive before expiry', () => {
    expect(daysRemaining({ expiresAt: iso(4.4) })).toBe(5);
  });
});
