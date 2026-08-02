/**
 * Eventerz - mobile Tailwind config.
 *
 * Ported 1:1 from the web app's `tailwind.config.ts` so class names mean the
 * same thing on both platforms. Web-only features (backdrop-blur, keyframes,
 * container queries) are intentionally dropped - on native those are handled
 * by `<GlassCard>` (expo-blur) and Reanimated instead.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        /*
         * Surface tokens, resolved at runtime from CSS variables.
         *
         * These were baked hex, with a comment saying NativeWind could not read
         * CSS variables. It can - v4 ships `vars()`, which sets them on a view
         * and lets every class below inherit. That is what makes the theme
         * switch work at all: `bg-card` now means "whatever the current palette
         * calls card", so no screen needs a `dark:` variant and no call site
         * changed. The values live in `theme/palettes.ts`.
         *
         * The fallback after the comma is the dark value, so anything rendered
         * outside the provider still looks like the app rather than unstyled.
         */
        background: 'var(--color-background, #050816)',
        foreground: 'var(--color-foreground, #f8fafc)',
        card: 'var(--color-card, #0b0e1e)',
        'card-foreground': 'var(--color-card-foreground, #f8fafc)',
        // Brand hues do not change with the theme - purple is purple on both.
        primary: '#9945ff',
        'primary-foreground': '#ffffff',
        secondary: 'var(--color-secondary, #151d32)',
        'secondary-foreground': 'var(--color-secondary-foreground, #f8fafc)',
        // Surface, not text. `text-muted` paints the surface tint onto text,
        // which is very nearly invisible - it had silently hidden 37 captions,
        // timestamps and hints across 9 screens before anyone noticed, because
        // the text is *there* and technically rendering. Secondary text is
        // `text-muted-foreground`; this token is for `bg-muted`.
        muted: 'var(--color-muted, #191f2e)',
        'muted-foreground': 'var(--color-muted-foreground, #94a2b8)',
        accent: '#3ebaf4',
        'accent-foreground': '#ffffff',
        border: 'var(--color-border, #20273c)',
        input: 'var(--color-input, #20273c)',
        ring: '#9945ff',

        // Eventerz brand palette - identical values to the web app.
        brand: {
          bg: '#050816',
          'bg-soft': '#0a0f24',
          purple: '#9945ff',
          violet: '#7c3aed',
          blue: '#2f80ff',
          cyan: '#22d3ee',
          green: '#14f195',
        },
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
        display: ['SpaceGrotesk_600SemiBold'],
        'display-bold': ['SpaceGrotesk_700Bold'],
        mono: ['JetBrainsMono_400Regular'],
      },
      borderRadius: {
        '4xl': 32,
        '3xl': 24,
        '2xl': 16,
        xl: 12,
        lg: 14, // matches web --radius: 0.9rem
        md: 12,
        sm: 10,
      },
      fontSize: {
        '2xs': ['10px', '13px'],
      },
      spacing: {
        // Touch-target floor used across interactive elements (a11y >= 44px).
        touch: '44px',
      },
    },
  },
  plugins: [],
};
