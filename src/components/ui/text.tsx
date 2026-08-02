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
import { useTranslate } from '@/i18n/use-translation';
import { cn } from '@/utils/cn';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  className?: string;
  /**
   * Leave this string exactly as written.
   *
   * For text a machine translator would damage rather than help: wallet
   * addresses, handles, and strings built out of language names - the settings
   * subtitle is `"Español · Spanish"`, which came back from the provider as
   * "Español/Spanish" with the separator rewritten.
   *
   * Bare language names are already exempt in `translate()`; this is for the
   * cases that only look like ordinary copy.
   */
  noTranslate?: boolean;
}

export const Text = forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', className, style, children, noTranslate, ...props },
  ref,
) {
  const token = type[variant];
  const translateText = useTranslate();
  const t = noTranslate ? (value: string) => value : translateText;

  /*
   * Translation happens here, once, for the whole app.
   *
   * Every string on screen passes through this component - the codebase has
   * exactly one other `react-native` Text import, in the root error boundary.
   * So intercepting children is what makes "change the language" work without
   * touching ~580 call sites or shipping a locale file per language.
   *
   * Only plain strings are touched. An array of children may hold elements, and
   * a number is a count or an amount that a translator would only damage.
   * Untranslated text is returned unchanged, so this is a no-op in English and
   * whenever no translation endpoint is configured.
   */
  const content =
    typeof children === 'string'
      ? t(children)
      : Array.isArray(children)
        ? children.map((child) =>
            typeof child === 'string' ? t(child) : child,
          )
        : children;

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
    >
      {content}
    </RNText>
  );
});
