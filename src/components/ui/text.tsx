/**
 * Typed text primitive.
 *
 * Wraps RN's `Text` so every string in the app picks up a brand font by
 * default (RN would otherwise fall back to the system family and lose the
 * Inter/Space Grotesk pairing the web app uses).
 *
 * `variant` maps to the shared type ramp; `className` still works for colour
 * and layout, so `<Text variant="h2" className="text-brand-cyan">` reads the
 * same way as the web markup.
 */

import { forwardRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type TypeToken, type } from '@/theme/typography';
import { cn } from '@/utils/cn';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  className?: string;
}

export const Text = forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', className, style, ...props },
  ref,
) {
  const token = type[variant];

  return (
    <RNText
      ref={ref}
      className={cn('text-foreground', className)}
      // `maxFontSizeMultiplier` keeps very large OS font settings from breaking
      // card layouts while still honouring dynamic type up to 1.4x.
      maxFontSizeMultiplier={1.4}
      style={[
        {
          fontFamily: token.family,
          fontSize: token.size,
          lineHeight: token.lineHeight,
        },
        style,
      ]}
      {...props}
    />
  );
});
