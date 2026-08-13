import { describe, expect, it } from 'vitest';

import { SUPPORTED_WALLETS, walletIdFromUriBase } from './wallets';

/**
 * Naming the wallet that actually connected.
 *
 * Mobile Wallet Adapter does not let a dApp pick a wallet: every row in the
 * connect sheet fires the same association intent and Android chooses. So the
 * tapped row is a guess, and it used to be stored as fact - Settings would
 * report Phantom for a session signed by Solflare.
 *
 * The wallet reports a `wallet_uri_base` at authorization, and that is the
 * answer. It is also what every later `transact` is aimed at, so a wrong match
 * here is not cosmetic: it points signing at the wrong app.
 */

describe('walletIdFromUriBase', () => {
  it('names each wallet from the base it reports', () => {
    expect(walletIdFromUriBase('https://phantom.app')).toBe('phantom');
    expect(walletIdFromUriBase('https://solflare.com')).toBe('solflare');
    expect(walletIdFromUriBase('https://backpack.app')).toBe('backpack');
    expect(walletIdFromUriBase('https://jup.ag')).toBe('jupiter');
  });

  it('ignores a path, a port and a trailing slash', () => {
    // Wallets publish the base in whatever shape they like; only the host
    // identifies them.
    expect(walletIdFromUriBase('https://phantom.app/')).toBe('phantom');
    expect(walletIdFromUriBase('https://phantom.app/ul/v1')).toBe('phantom');
    expect(walletIdFromUriBase('https://www.phantom.app')).toBe('phantom');
  });

  it('is case-insensitive about the host', () => {
    expect(walletIdFromUriBase('https://Phantom.App')).toBe('phantom');
  });

  /*
   * Every one of these means "no better answer than the one we already had",
   * which the caller turns into the tapped id. None of them may throw: this
   * runs inside `connect`, and a throw here would be a failed connection for a
   * wallet that authorized perfectly.
   */
  it('returns null rather than throwing on anything unusable', () => {
    expect(walletIdFromUriBase(undefined)).toBeNull();
    expect(walletIdFromUriBase('')).toBeNull();
    expect(walletIdFromUriBase('not a url')).toBeNull();
    expect(walletIdFromUriBase('solana-wallet:/')).toBeNull();
  });

  it('does not guess at a wallet it does not know', () => {
    // A wallet we do not list is a real and expected case - the Seeker's
    // built-in one included. Claiming it is Phantom would be worse than
    // saying nothing.
    expect(walletIdFromUriBase('https://some-other-wallet.io')).toBeNull();
  });

  it('never matches on a substring of a host', () => {
    // `phantom.app.evil.com` is not Phantom, and a `.includes` would have said
    // it was.
    expect(walletIdFromUriBase('https://phantom.app.evil.com')).toBeNull();
    expect(walletIdFromUriBase('https://notphantom.app')).toBeNull();
  });

  it('maps every host in the catalogue back to its own wallet', () => {
    // Guards against a copy-paste in the descriptor list pointing two wallets
    // at one host, which would silently rename one of them.
    for (const wallet of SUPPORTED_WALLETS) {
      if (!wallet.uriBaseHost) continue;
      expect(walletIdFromUriBase(`https://${wallet.uriBaseHost}`)).toBe(
        wallet.id,
      );
    }
  });
});
