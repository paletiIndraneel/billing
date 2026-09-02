import { describe, it, expect, vi } from 'vitest';

// No @testing-library/react installed — mock useQuery to simulate a failed query.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, error: new Error('boom') }),
}));

import { useTable } from './useTable';

describe('useTable', () => {
  it('throws when the underlying query errors', () => {
    expect(() => useTable('parties', () => {})).toThrow('boom');
  });
});
