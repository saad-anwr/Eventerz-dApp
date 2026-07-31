/**
 * Token holdings for a wallet.
 *
 * Used for the signed-in user's own profile and, unchanged, for anyone else's -
 * a friend or an event attendee. There is no privacy switch here and there
 * should not be: balances are public on-chain, and this reads exactly what a
 * block explorer would. What the app controls is where the address is shown,
 * not who may read the chain.
 *
 * The profile used to show a single SOL figure and nothing else, which made a
 * wallet holding six tokens look empty.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useWalletHoldings } from '@/hooks/use-holdings';
import { accents, brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { TokenHolding } from '@/services/solana/holdings';

/**
 * Significant digits, not fixed decimals.
 *
 * Token decimals vary from 0 to 9+. `toFixed(2)` renders a meme coin holding of
 * 4,120,553 tokens and a stablecoin holding of 12.40 with the same precision,
 * and rounds small balances to "0.00" - which reads as empty when it is not.
 */
function formatAmount(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.0001) return value.toFixed(4);
  return value.toExponential(2);
}

const shortMint = (mint: string) => `${mint.slice(0, 4)}...${mint.slice(-4)}`;

const TokenRow = memo(function TokenRow({ token }: { token: TokenHolding }) {
  // A mint is not a name, but it is true - better than inventing a symbol.
  const label = token.symbol ?? shortMint(token.mint);

  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Avatar
        name={label}
        seed={token.mint}
        size="sm"
        uri={token.imageUrl ?? undefined}
      />
      <View className="flex-1">
        <Text variant="title" numberOfLines={1}>
          {label}
        </Text>
        {token.name && token.name !== label ? (
          <Text variant="caption" className="text-muted" numberOfLines={1}>
            {token.name}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text
          variant="bodySm"
          style={{ fontFamily: fontFamily.mono }}
          numberOfLines={1}
        >
          {formatAmount(token.uiAmount)}
        </Text>
        {/* Only when the RPC actually priced it. An unknown value must not
            render as $0.00 - that is a number, and it would be wrong. */}
        {token.usdValue !== null && token.usdValue > 0 ? (
          <Text variant="micro" className="text-muted">
            ${token.usdValue.toFixed(2)}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export function HoldingsList({
  address,
  /** Shown above the list. Omit on a screen that already has a heading. */
  title = 'Holdings',
  max = 8,
}: {
  address: string | null | undefined;
  title?: string;
  max?: number;
}) {
  const { data, isLoading, isError } = useWalletHoldings(address);

  if (!address) return null;

  return (
    <View
      className="border border-white/[0.06] bg-white/[0.03] p-4"
      style={{ borderRadius: radius.xl }}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="label" className="text-muted">
          {title}
        </Text>
        {data ? (
          <Text
            variant="bodySm"
            style={{ fontFamily: fontFamily.mono, color: accents.green }}
          >
            {formatAmount(data.solBalance)} SOL
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View className="mt-3 gap-2">
          <Skeleton height={38} radius={radius.md} />
          <Skeleton height={38} radius={radius.md} />
        </View>
      ) : isError ? (
        <Text variant="caption" className="mt-3 text-muted">
          Could not read this wallet right now.
        </Text>
      ) : (data?.tokens.length ?? 0) === 0 ? (
        <Text variant="caption" className="mt-3 text-muted">
          No tokens yet - just SOL.
        </Text>
      ) : (
        <View className="mt-1">
          {data!.tokens.slice(0, max).map((token) => (
            <TokenRow key={token.mint} token={token} />
          ))}
          {data!.tokens.length > max ? (
            <Text variant="micro" className="mt-1 text-muted">
              +{data!.tokens.length - max} more
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
