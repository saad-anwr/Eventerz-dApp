/**
 * RN's `TextInput` with a translated placeholder.
 *
 * A placeholder is copy the same as any label - "Search languages", "Where is
 * it?", "Amount" - but it arrives as a prop rather than as children, so the
 * interception in `<Text>` never sees it. On device that showed up as a Spanish
 * settings screen with an English search box sitting in the middle of it.
 *
 * Wrapping the primitive rather than editing the ~23 call sites keeps the same
 * shape as `<Text>`: one place decides what gets translated, and a new screen
 * gets it by importing from `@/components/ui` like everything else.
 */

import { forwardRef } from 'react';
import {
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
} from 'react-native';

import { useTranslate } from '@/i18n/use-translation';

export interface TextInputProps extends RNTextInputProps {
  /** Leave the placeholder exactly as written - see `<Text noTranslate>`. */
  noTranslate?: boolean;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  function TextInput({ placeholder, noTranslate, ...props }, ref) {
    const t = useTranslate();

    return (
      <RNTextInput
        ref={ref}
        placeholder={
          placeholder && !noTranslate ? t(placeholder) : placeholder
        }
        {...props}
      />
    );
  },
);
