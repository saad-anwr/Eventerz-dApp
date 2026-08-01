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

import { SUPPORTED_WALLETS } from './wallets';

/** Identity shown in the wallet's approval sheet. */
const APP_IDENTITY = {
  name: 'Eventerz',
  uri: 'https://www.eventerz.xyz',
  icon: 'favicon.ico',
} as const;

/** MWA's `Chain` union - kept as literals so the type flows to `authorize`. */
const CHAIN_BY_CLUSTER = {
  'mainnet-beta': 'solana:mainnet',
  devnet: 'solana:devnet',
  testnet: 'solana:testnet',
} as const;

type MwaChain = (typeof CHAIN_BY_CLUSTER)[keyof typeof CHAIN_BY_CLUSTER];

/**
 * MWA returns addresses base64-encoded. Everything downstream - display,
 * profiles, explorer links - expects base58, so normalise at the boundary.
 */
function toBase58(address: string): string {
  try {
    return new PublicKey(toUint8Array(address)).toBase58();
  } catch {
    // Some wallets already hand back base58.
    return address;
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
     * `mint-ticket` and `claim-badge` have no instruction yet: tickets are
     * Postgres rows plus a seat account, and compressed-NFT minting needs
     * Bubblegum and a Merkle tree that is not provisioned. Refusing is the
     * honest answer - the alternative is a signature for a mint that never
     * happened.
     */
    case 'mint-ticket':
    case 'claim-badge':
      throw new Error(
        `On-chain ${intent.type.replace(/-/g, ' ')} is not implemented yet.`,
      );
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
      if (!account) throw new Error('The wallet returned no accounts.');

      const resolved: WalletAccount = {
        address: toBase58(account.address),
        label: account.label ?? undefined,
        walletId,
        cluster: integrationsConfig.solanaNetwork,
      };

      await secureStorage.set(SecureKeys.WALLET_AUTH_TOKEN, auth.auth_token);
      await storage.set(StorageKeys.WALLET_SESSION, resolved);

      return resolved;
    });
  }

  async disconnect(): Promise<void> {
    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);

    if (token) {
      try {
        await transact(async (wallet) => {
          await wallet.deauthorize({ auth_token: token });
        });
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

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      const [signed] = await wallet.signMessages({
        addresses: [auth.accounts[0].address],
        payloads: [new TextEncoder().encode(message)],
      });

      return Buffer.from(signed).toString('base64');
    });
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

    if (intent.type !== 'transfer' && !programId) {
      throw new Error(
        `On-chain ${intent.type.replace(/-/g, ' ')} is not available yet - ` +
          'the Eventerz program has not been deployed. Set ' +
          'EXPO_PUBLIC_EVENTERZ_PROGRAM_ID once it is live.',
      );
    }

    const token = await secureStorage.get(SecureKeys.WALLET_AUTH_TOKEN);
    const connection = this.connection();

    return transact(async (wallet) => {
      const auth = await wallet.reauthorize({
        auth_token: token ?? '',
        identity: APP_IDENTITY,
      });

      const payer = new PublicKey(toBase58(auth.accounts[0].address));
      const instruction = buildInstruction(intent, payer, programId);

      const { blockhash } = await connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: payer,
        recentBlockhash: blockhash,
      }).add(instruction);

      const [signature] = await wallet.signAndSendTransactions({
        transactions: [transaction],
      });

      return { signature };
    });
  }

  async getBalanceSol(address: string): Promise<number> {
    const lamports = await this.connection().getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  }
}
