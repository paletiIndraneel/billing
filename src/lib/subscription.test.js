import { describe, it, expect } from 'vitest';
import { evaluateAccess, daysRemaining, TRIAL_DAYS, GRACE_DAYS } from './subscription';

const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString();

describe('evaluateAccess', () => {
  it('trial before expiry', () => {
    expect(evaluateAccess({ status: 'trial', expiresAt: iso(5) })).toBe('trial');
  });
  it('active before expiry', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(30) })).toBe('active');
  });
  it('grace within GRACE_DAYS after expiry', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(-3) })).toBe('grace');
  });
  it('expired past the grace window', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(-(GRACE_DAYS + 2)) })).toBe('expired');
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
