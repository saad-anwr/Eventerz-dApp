/**
 * Seeker Genesis Token verification.
 *
 * The Genesis Token (SGT) is minted once per Seeker device into the primary
 * account of that device's Seed Vault wallet, and it is soulbound - it can only
 * move between accounts of the same Seed Vault, on a permissioned basis. Holding
 * one is therefore a proof of device ownership rather than something that can be
 * bought, which is what makes it worth checking at all.
 *
 * # Why this checks the token and not a `.skr` username
 *
 * The ask was to verify Seeker owners "by their .skr username". There is no
 * published resolver for `.skr` names - Solana Mobile's own developer docs do
 * not document one, and the established Solana name services (SNS `.sol`,
 * `.abc`, `.bonk`, `.backpack`) do not serve that TLD. Guessing at a program id
 * or an API would produce a verification that silently always fails, or worse,
 * one that appears to succeed.
 *
 * The token is the better check regardless. A username is a label someone
 * chooses; the SGT is an on-chain fact about their hardware. If a resolver is
 * published later, it belongs on top of this as a display name, not instead of
 * it.
 *
 * # How the check works
 *
 * Per Solana Mobile's documentation, an SGT mint is identified by three
 * properties rather than by a single known mint address - there is one mint per
 * device, so there is no fixed address to compare against:
 *
 *   mint authority               GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4
 *   metadata pointer address     GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te
 *   token group member address   GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te
 *
 * It is a Token-2022 (Token Extensions) mint, so it will never appear in a
 * query against the original SPL Token program.
 *
 * # What this is and is not
 *
 * This runs on the device and is trustworthy *to the person running it* - it
 * reads the chain directly. It is **not** proof to anyone else: nothing stops a
 * modified client from claiming a pass. Showing a badge to other users would
 * need the same treatment as the token gate - an Edge Function holding the
 * service-role key, checking the balance server-side, as `check-gate` does.
 * Until then this answers "is this device a Seeker", not "prove to others that
 * it is".
 */

import { rpcCall } from './rpc';

/** Mints the Seeker Genesis Tokens. One SGT mint per device shares this. */
const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';

/** The token group every SGT belongs to, and its metadata pointer target. */
const SGT_GROUP = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';

const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export interface SeekerStatus {
  /** True only when a mint matching all three SGT properties is held. */
  verified: boolean;
  /** The SGT mint this wallet holds, for display and explorer links. */
  mint: string | null;
  /**
   * Set when the check could not complete - an RPC failure, say. Distinct from
   * `verified: false`, which is a real answer. "We could not ask" must never be
   * rendered as "you do not own one".
   */
  error: string | null;
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number };
        };
      };
    };
  };
}

interface ParsedMintAccount {
  data?: {
    parsed?: {
      info?: {
        mintAuthority?: string | null;
        decimals?: number;
        supply?: string;
        extensions?: { extension?: string; state?: Record<string, unknown> }[];
      };
    };
  };
}

/**
 * Does this mint carry the three SGT markers?
 *
 * The mint authority is the strong signal and is checked exactly. The group and
 * metadata pointer are confirmed by looking for the group address anywhere in
 * the parsed extension state, rather than by reading a specific key: the JSON
 * shape of Token-2022 extensions has changed between RPC versions, and a check
 * keyed to one spelling would start returning false on an upgrade. Requiring
 * both the authority *and* the group address keeps that leniency safe - neither
 * alone would be enough to accept a mint.
 */
function looksLikeGenesisToken(mint: ParsedMintAccount): boolean {
  const info = mint.data?.parsed?.info;
  if (!info) return false;
  if (info.mintAuthority !== SGT_MINT_AUTHORITY) return false;

  const extensions = info.extensions ?? [];
  return JSON.stringify(extensions).includes(SGT_GROUP);
}

/**
 * Check whether `owner` holds a Seeker Genesis Token.
 *
 * Never throws: the caller renders a status, and an exception here would take
 * out a profile screen over an optional badge.
 */
export async function verifySeekerGenesisToken(
  owner: string,
): Promise<SeekerStatus> {
  try {
    // Token-2022 only. The SGT uses Token Extensions, so the original SPL
    // Token program would return nothing and read as "not a Seeker".
    const accounts = await rpcCall<{ value?: ParsedTokenAccount[] }>(
      'getTokenAccountsByOwner',
      [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: 'jsonParsed' }],
    );

    // An NFT is supply 1 with 0 decimals; filtering here keeps the mint lookup
    // below to a handful of accounts on a wallet full of fungible tokens.
    const mints = (accounts.value ?? [])
      .map((a) => a.account.data.parsed.info)
      .filter((i) => i.tokenAmount.decimals === 0 && i.tokenAmount.amount === '1')
      .map((i) => i.mint);

    if (mints.length === 0) {
      return { verified: false, mint: null, error: null };
    }

    /*
     * Batched. `getMultipleAccounts` caps at 100 per call, and a wallet holding
     * more than 100 NFTs is entirely ordinary - so this chunks rather than
     * assuming one request is enough and silently missing the token.
     */
    for (let i = 0; i < mints.length; i += 100) {
      const chunk = mints.slice(i, i + 100);
      const result = await rpcCall<{ value?: (ParsedMintAccount | null)[] }>(
        'getMultipleAccounts',
        [chunk, { encoding: 'jsonParsed' }],
      );

      const hit = (result.value ?? []).findIndex(
        (account) => account !== null && looksLikeGenesisToken(account),
      );
      if (hit !== -1) {
        return { verified: true, mint: chunk[hit], error: null };
      }
    }

    return { verified: false, mint: null, error: null };
  } catch (error) {
    return {
      verified: false,
      mint: null,
      error:
        error instanceof Error
          ? error.message
          : 'Could not reach the network to check.',
    };
  }
}
