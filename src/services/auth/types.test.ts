import { describe, expect, it } from 'vitest';

import { asProfileRow, type ProfileRow } from './types';

/**
 * The row PostgREST hands back for a function declared `returns
 * public.profiles` when its inner select matched nothing: not absent, but every
 * column NULL. This is the value that crashed onboarding for the dApp Store
 * reviewer - see the header of migration 0024.
 */
const ALL_NULL_ROW = {
  id: null,
  name: null,
  handle: null,
  avatar_url: null,
  bio: null,
  location: null,
  website: null,
  twitter: null,
  wallet_address: null,
  reputation: null,
  interests: null,
  created_at: null,
  updated_at: null,
};

const REAL_ROW: ProfileRow = {
  id: '8f1f2a3e-0000-4000-8000-000000000001',
  name: 'Saad Anwar',
  handle: 'saadanwar',
  avatar_url: null,
  bio: null,
  location: null,
  website: null,
  twitter: null,
  wallet_address: 'CiM2ZRkc',
  reputation: 0,
  interests: [],
  created_at: '2026-08-13T00:00:00Z',
  updated_at: '2026-08-13T00:00:00Z',
};

describe('asProfileRow', () => {
  it('accepts a real profile', () => {
    expect(asProfileRow(REAL_ROW)).toBe(REAL_ROW);
  });

  /** The regression. `if (data)` accepted this, and the mapper then crashed. */
  it('rejects the all-NULL row a bare composite returns', () => {
    expect(asProfileRow(ALL_NULL_ROW)).toBeNull();
  });

  it('rejects nothing at all', () => {
    expect(asProfileRow(null)).toBeNull();
    expect(asProfileRow(undefined)).toBeNull();
  });

  it('rejects a row whose id is present but empty', () => {
    expect(asProfileRow({ ...REAL_ROW, id: '' })).toBeNull();
  });

  it('rejects values that are not rows', () => {
    expect(asProfileRow('nope')).toBeNull();
    expect(asProfileRow(42)).toBeNull();
    // An empty array is what a `setof` function returns for no match; it is not
    // a row either, and must not be mistaken for one.
    expect(asProfileRow([])).toBeNull();
  });
});
