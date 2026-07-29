/**
 * Eventerz — mobile Tailwind config.
 *
 * Ported 1:1 from the web app's `tailwind.config.ts` so class names mean the
 * same thing on both platforms. Web-only features (backdrop-blur, keyframes,
 * container queries) are intentionally dropped — on native those are handled
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
        // Design-system surface tokens (mirrors the web `globals.css` HSL vars,
        // resolved to hex here because NativeWind cannot read CSS variables).
        background: '#050816',
        foreground: '#f8fafc',
        card: '#0b0e1e',
        'card-foreground': '#f8fafc',
        primary: '#9945ff',
        'primary-foreground': '#ffffff',
        secondary: '#151d32',
        'secondary-foreground': '#f8fafc',
        muted: '#191f2e',
        'muted-foreground': '#94a2b8',
        accent: '#3ebaf4',
        'accent-foreground': '#ffffff',
        border: '#20273c',
        input: '#20273c',
        ring: '#9945ff',

        // Eventerz brand palette — identical values to the web app.
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
        // Touch-target floor used across interactive elements (a11y ≥ 44px).
        touch: '44px',
      },
    },
  },
  plugins: [],
};
