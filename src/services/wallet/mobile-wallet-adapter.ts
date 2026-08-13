/**
 * Solana Mobile Wallet Adapter.
 *
 * The real wallet: talks to Phantom / Solflare / Backpack / the Seeker's
 * built-in wallet over the MWA protocol. **Android only** - MWA is an Android
 * association intent and has no iOS equivalent.
 *
 * Requires a development build; the protocol package ships native code, so it
 * does not run in Expo Go.
 *
 * Auth tokens live in expo-secure-store - they are bearer credentials that let
 * us reauthorize without prompting the user again.
 */

import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { toUint8Array } from 'js-base64';

import { integrationsConfig } from '@/constants/config';
import {
  cancelEventInstruction,
  checkInInstruction,
  claimSeatInstruction,
  createEventInstruction,
  eventerzProgramId,
  releaseSeatInstruction,
} from '@/services/solana/program';
// One definition of "which RPC", shared with the holdings and fee paths. Three
// copies of this rule had drifted on what to do when no endpoint is configured.
import { rpcEndpoint } from '@/services/solana/rpc';
import {
  computeBudgetInstructions,
  type ComputeKind,
} from '@/services/solana/priority-fee';
import { SecureKeys, StorageKeys } from '@/constants/storage-keys';
import type {
  SignedTransactionResult,
  TransactionIntent,
  WalletAccount,
  WalletAdapter,
  WalletDescriptor,
  WalletId,
} from '@/types';
import { secureStorage, storage } from '@/utils';

import { walletMessage } from './errors';
import { SUPPORTED_WALLETS, walletIdFromUriBase } from './wallets';

/**
 * Identity shown in the wallet's approval sheet.
 *
 * `icon` is a path *relative to `uri`*, which the wallet resolves and fetches -
 * so it has to be a real, publicly readable image. It was `favicon.ico`, and
 * `https://www.eventerz.xyz/favicon.ico` is a 404: the site is a Next.js app
 * that serves an SVG mark and never had that file. The wallet therefore drew
 * its fallback where our logo should be, on the approval sheet that is the
 * first thing anyone sees when they connect - a reviewer included.
 *
 * A PNG rather than the site's `icon.svg` on purpose. This is fetched and
 * decoded by a native Android image loader, and SVG support there is not
 * something to rely on for the one image in the consent dialog.
 */
const APP_IDENTITY = {
  name: 'Eventerz',
  uri: 'https://www.eventerz.xyz',
  icon: 'icon.png',
} as const;

/** MWA's `Chain` union - kept as literals so the type flows to `authorize`. */
const CHAIN_BY_CLUSTER = {
  'mainnet-beta': 'solana:mainnet',
  devnet: 'solana:devnet',
  testnet: 'solana:testnet',
} as const;

type MwaChain = (typeof CHAIN_BY_CLUSTER)[keyof typeof CHAIN_BY_CLUSTER];

/**
 * How long to wait for a wallet to acknowledge a disconnect before giving up
 * and clearing the session anyway. See `disconnect`.
 */
const DEAUTHORIZE_TIMEOUT_MS = 4000;

/**
 * MWA returns addresses base64-encoded. Everything downstream - display,
 * profiles, explorer links - expects base58, so normalise at the boundary.
 *
 * # The crash this used to cause
 *
 * The catch used to be `return address` - "some wallets already hand back
 * base58". That is true, and it also meant this function returned its input
 * unchanged for *every* failure, including the one where the input was not a
 * string at all. A wallet handing back an account with a null address therefore
 * produced a `WalletAccount` whose `address` was `null`, typed as `string`. It
 * was written to storage, adopted as the session, and eventually reached
 * `ensureWalletUser`, which does `address.slice(0, 4)`:
 *
 *     Connection failed
 *     Cannot read property 'slice' of null
 *
 * shown to the user - and to a dApp Store reviewer - at the moment they tried
 * to onboard. A boundary that cannot decode its input has to say so, not pass
 * the bad value along wearing the right type.
 */
function toBase58(address: unknown): string {
  if (typeof address !== 'string' || address.length === 0) {
    throw walletMessage('The wallet returned an account with no address.');
  }

  try {
    return new PublicKey(toUint8Array(address)).toBase58();
  } catch {
    // Not base64. Some wallets already hand back base58 - accept it only if it
    // really is a public key, rather than assuming.
    try {
      return new PublicKey(address).toBase58();
    } catch {
      /*
       * Logged because this is the one failure whose cause lives in a value we
       * never see. A public key is public, and knowing its length and encoding
       * is the difference between diagnosing this in one attempt and guessing
       * at it across rebuilds.
       */
      console.warn(
        `[wallet] unreadable address from wallet: length=${address.length} ` +
          `value=${address}`,
      );
      throw walletMessage(
        'The wallet returned an address we could not read.',
      );
    }
  }
}

/**
 * Compile an intent into one instruction.
 *
 * Deliberately a pure function outside the class: it takes the payer and the
 * program id and returns an instruction, so it can be unit-tested without a
 * wallet, a network or an association intent - none of which exist in a test
 * runner.
 */
function buildInstruction(
  intent: TransactionIntent,
  payer: PublicKey,
  programId: PublicKey | null,
): TransactionInstruction {
  if (intent.type === 'transfer') {
    /*
     * Translated rather than left to web3.js, which throws "Invalid public key
     * input" - true, and meaningless to someone who was trying to pay a friend.
     * The address came from a profile, so the actionable fact is whose it is.
     */
    let destination: PublicKey;
    try {
      destination = new PublicKey(intent.to);
    } catch {
      throw new Error("That recipient's wallet address is not valid.");
    }
    if (destination.equals(payer)) {
      throw new Error('That is your own wallet.');
    }
    return SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: destination,
      // bigint keeps the value exact all the way to the instruction. A number
      // silently loses precision above 2^53 lamports.
      lamports: intent.lamports,
    });
  }

  // Guarded by the caller, but narrowing here keeps this function honest on its
  // own rather than depending on a check somewhere else.
  if (!programId) {
    throw new Error('The Eventerz program is not deployed.');
  }

  switch (intent.type) {
    case 'create-event':
      return createEventInstruction(
        {
          eventId: intent.eventId,
          host: payer,
          capacity: intent.capacity ?? 1,
          startsAt: intent.startsAt ?? new Date().toISOString(),
          endsAt: intent.endsAt ?? null,
          requiresApproval: intent.requiresApproval,
          priceLamports: intent.priceLamports ?? 0n,
        },
        programId,
      );

    case 'rsvp': {
      /*
       * The host's wallet is required, not optional-with-a-default: a paid event
       * settles the price to the host inside `claim_seat`, so the host account
       * has to be in the transaction. Substituting the payer would send the
       * money to the attendee, which would appear to work on a free event and
       * quietly misdirect funds on a paid one.
       */
      if (!intent.hostWallet) {
        throw new Error(
          'The host has not linked a wallet, so this event has no on-chain seats.',
        );
      }
      return claimSeatInstruction(
        intent.eventId,
        payer,
        new PublicKey(intent.hostWallet),
        programId,
      );
    }

    case 'release-seat':
      return releaseSeatInstruction(intent.eventId, payer, programId);

    case 'cancel-event':
      return cancelEventInstruction(intent.eventId, payer, programId);

    case 'check-in': {
      if (!intent.attendeeWallet) {
        throw new Error('That guest has not linked a wallet.');
      }
      return checkInInstruction(
        intent.eventId,
        new PublicKey(intent.attendeeWallet),
        payer,
        programId,
      );
    }

    /*
     * `mint-ticket` and `claim-badge` refuse here permanently, by design - not
     * pending a Merkle tree.
     *
     * A Bubblegum mint is signed by the **tree authority**, not by the wallet
     * receiving the asset. Implementing these cases would mean shipping that
     * authority key to a phone, and an asset the recipient can mint for
     * themselves proves nothing about who issued it. Minting therefore lives in
     * the `mint-cnft` Edge Function, where the key is a server secret.
     *
     * So do not "finish" this once a tree is provisioned. The right call site is
     * the function; this one stays a refusal.
     */
    case 'mint-ticket':
    case 'claim-badge':
      throw new Error(
        `On-chain ${intent.type.replace(/-/g, ' ')} is not implemented yet.`,
      );
  }
}

/**
 * How much compute to request for an intent.
 *
 * Requesting too little aborts the transaction mid-execution; requesting too
 * much multiplies the priority fee, since the fee charged is `limit x price`.
 * So this maps each intent to what it actually does rather than using one
 * number for everything.
 */
function computeKindFor(intent: TransactionIntent): ComputeKind {
  switch (intent.type) {
    case 'transfer':
      return 'transfer';
    case 'create-event':
      return 'createEvent';
    case 'rsvp':
      return 'claimSeat';
    default:
      return 'simple';
  }
}

export class MobileWalletAdapter implements WalletAdapter {
  readonly id = 'mwa';

  private get chain(): MwaChain {
    return (
      CHAIN_BY_CLUSTER[integrationsConfig.solanaNetwork] ?? 'solana:mainnet'
    );
  }

  private connection(): Connection {
    return new Connection(rpcEndpoint(), 'confirmed');
  }

  /**
   * How to reach the wallet we are already authorized with.
   *
   * # The bug this fixes
   *
   * Every `transact` here used to be called bare. A bare association fires the
   * generic `solana-wallet://` intent, which is a request for *any* wallet -
   * so on a phone with more than one installed, Android asks again on every
   * signature and the user can answer with a different wallet than the one
   * that authorized them.
   *
   * What happens then is not a clean failure. `reauthorize` presents wallet
   * A's `auth_token` to wallet B, which has never issued it, and the error
   * surfaces at the moment someone taps RSVP - the wallet was connected, the
   * app said so, and signing fails anyway. On a Seeker, which ships a built-in
   * wallet and where reviewers install others alongside it, that is the
   * default configuration rather than an edge case.
   *
   * `wallet_uri_base` is what the protocol provides for this: an `https` base
   * the wallet publishes at authorization, which builds an endpoint-specific
   * association URL that resolves to that wallet and no other. The reference
   * web implementation passes it on every subsequent transact; this is the
   * same rule.
   *
   * Returns `undefined` when we have no base - a wallet is not obliged to send
   * one, and a session stored before this existed will not have it. That is
   * the old behaviour, which is correct as a fallback and wrong as a default.
   */
  private async association(): Promise<{ baseUri: string } | undefined> {
    const account = await storage.get<WalletAccount>(
      StorageKeys.WALLET_SESSION,
    );
    const baseUri = account?.walletUriBase;
    // Guarded because the protocol rejects a non-https base by throwing, and a
    // corrupt stored value should not be able to break signing.
    if (typeof baseUri !== 'string' || !/^https:\/\//i.test(baseUri)) {
      return undefined;
    }
    return { baseUri };
  }

  async listWallets(): Promise<WalletDescriptor[]> {
    // MWA does not enumerate wallets - Android's association picker does. The
    // curated list still renders so the sheet looks the same before hand-off.
    return SUPPORTED_WALLETS;
  }

  async connect(walletId: WalletId): Promise<WalletAccount> {
    return transact(async (wallet) => {
      const auth = await wallet.authorize({
        chain: this.chain,
        identity: APP_IDENTITY,
      });

      const account = auth.accounts[0];
      if (!account) {
        throw walletMessage(
          'That wallet did not share an account. Open it, make sure a wallet is set up, and try again.',
        );
      }

      const resolved: WalletAccount = {
        // Throws rather than passing an unreadable value downstream - see
        // `toBase58`. This is the line the `slice of null` crash came through.
        address: toBase58(account.address),
        label: account.label ?? undefined,
        /*
         * Which wallet actually answered, not which row was tapped.
         *
         * The sheet lists five wallets, and tapping any of them fires the same
         * association intent - Android decides which wallet opens. So the
         * tapped id was a guess, and Settings printed it as fact: connect via
         * the Phantom row, pick Solflare in the chooser, and the app would
         * tell you Solflare was Phantom for the rest of the session.
         */
        walletId: walletIdFromUriBase(auth.wallet_uri_base) ?? walletId,
        cluster: integrationsConfig.solanaNetwork,
        walletUriBase: auth.wallet_uri_base,
      };

      /*
       * Persist only what is real. `secureStorage.set` with a non-string throws
       * from inside expo-secure-store, which would surface here as a native
       * message about SecureStore rather than about the wallet - and would do
       * it *after* a successful authorization, making a connected wallet look
       * like a failed one.
       */
      if (typeof auth.auth_token === 'string' && auth.auth_token.length > 0) {
        await secureStorage.set(SecureKeys.WALLET_AUTH_TOKEN, auth.auth_token);
      }
      await storage.set(StorageKeys.WALLET_SESSION, resolved);

      return resolved;
    });
  }

  async disconnect(): Promise<void> {
    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);

    if (token) {
      try {
        // Read before the session is cleared below, or there is no base left
        // to associate with.
        const config = await this.association();
        /*
         * Bounded, because disconnecting must not depend on a wallet answering.
         *
         * `transact` has no timeout of its own on Android: if the association
         * never completes - the wallet was uninstalled, its endpoint-specific
         * URI no longer resolves, the user walked away from the sheet - the
         * promise simply never settles. Observed on device: tapping "Disconnect
         * wallet" dimmed the screen and stayed there, with no intent launched
         * and no way out but force-quitting, because the local cleanup below
         * was waiting on a reply that was never coming.
         *
         * Telling the wallet is a courtesy that lets it drop its own record.
         * Clearing ours is the part the user asked for, so it happens either
         * way.
         */
        await Promise.race([
          transact(async (wallet) => {
            await wallet.deauthorize({ auth_token: token });
          }, config),
          new Promise((resolve) =>
            setTimeout(resolve, DEAUTHORIZE_TIMEOUT_MS),
          ),
        ]);
      } catch {
        // The wallet may have revoked us already, or been uninstalled. Either
        // way the local session must still be cleared.
      }
    }

    await secureStorage.remove(SecureKeys.WALLET_AUTH_TOKEN);
    await storage.remove(StorageKeys.WALLET_SESSION);
  }

  /**
   * Silent reconnect from the cached account, so launching the app does not
   * pop the wallet. Reauthorization happens lazily at signing time.
   */
  async restore(): Promise<WalletAccount | null> {
    const [account, token] = await Promise.all([
      storage.get<WalletAccount>(StorageKeys.WALLET_SESSION),
      secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN),
    ]);
    if (!account || !token) return null;
    return account;
  }

  async signMessage(message: string): Promise<string> {
    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
    const config = await this.association();

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      // `accounts[0]` is not guaranteed - a wallet that reauthorized but shares
      // nothing would read `.address` off undefined and throw a TypeError.
      const signer = auth.accounts[0];
      if (!signer) {
        throw walletMessage('That wallet did not share an account to sign with.');
      }

      const [signed] = await wallet.signMessages({
        addresses: [signer.address],
        payloads: [new TextEncoder().encode(message)],
      });

      return Buffer.from(signed).toString('base64');
    }, config);
  }

  /**
   * Sign and submit.
   *
   * `intent` says *what* the user wants on-chain; this compiles it into real
   * instructions and hands them to the wallet.
   *
   * Two rules that are load-bearing:
   *
   *  1. **A `transfer` never needs the Eventerz program.** It is a System
   *     Program instruction, so it works whether or not anything of ours is
   *     deployed. Gating it on `programId` would break sending crypto for a
   *     reason that has nothing to do with it.
   *
   *  2. **Every other intent refuses when no program is deployed.** It does not
   *     fabricate a signature, and it no longer sends the zero-lamport
   *     self-transfer that used to stand in for one - that produced a real,
   *     confirmable signature for a transaction that did nothing, which is the
   *     worst of both worlds: the UI would report a minted ticket and the
   *     explorer would appear to agree.
   */
  async signAndSendTransaction(
    intent: TransactionIntent,
  ): Promise<SignedTransactionResult> {
    const programId = eventerzProgramId();

    /*
     * Reads as a feature that is not on yet, because to the person holding the
     * phone that is exactly what it is. It used to name the environment
     * variable to set, which is an instruction only the operator can act on -
     * and this string is shown in a toast to whoever tapped RSVP, including a
     * store reviewer.
     */
    if (intent.type !== 'transfer' && !programId) {
      throw new Error(
        `On-chain ${intent.type.replace(/-/g, ' ')} is not available yet.`,
      );
    }

    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
    const config = await this.association();
    const connection = this.connection();

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      const payerAccount = auth.accounts[0];
      if (!payerAccount) {
        throw walletMessage('That wallet did not share an account to pay with.');
      }
      const payer = new PublicKey(toBase58(payerAccount.address));
      const instruction = buildInstruction(intent, payer, programId);

      /*
       * Priority fee, or this may never land.
       *
       * Mainnet orders transactions by fee per compute unit. One that bids
       * nothing is last in line and, whenever the network is busy, is simply
       * not included before its blockhash expires - the wallet reports "sent",
       * the app waits, and nothing ever happens. See `priority-fee` for why the
       * price is measured rather than fixed.
       *
       * Priced against the accounts this transaction writes to, since
       * prioritization is per-account contention rather than a global rate.
       */
      const writable = instruction.keys
        .filter((k) => k.isWritable)
        .map((k) => k.pubkey);
      const budget = await computeBudgetInstructions(
        computeKindFor(intent),
        writable,
      );

      const { blockhash } = await connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: payer,
        recentBlockhash: blockhash,
      })
        .add(...budget)
        .add(instruction);

      const [signature] = await wallet.signAndSendTransactions({
        transactions: [transaction],
      });

      return { signature };
    }, config);
  }

  async getBalanceSol(address: string): Promise<number> {
    const lamports = await this.connection().getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  }
}
