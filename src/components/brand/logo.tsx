/**
 * Eventerz brand mark - a direct port of the web app's `components/ui/logo.tsx`.
 *
 * A 3D isometric, folded-ribbon "E" built from three purple facets (light top,
 * violet front, dark side). Pure vector, so it stays crisp from a 20px tab icon
 * to a 120px splash mark.
 */

import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { makeShadow } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import { cn } from '@/utils/cn';

import { Text } from '../ui/text';

interface MarkProps {
  size?: number;
}

export const EventerzMark = memo(function EventerzMark({
  size = 36,
}: MarkProps) {
  return (
    /*
     * The web app nests these paths in a `translate(4 3)` group. `react-native-svg`
     * on web forwards `translateX`/`translateY` straight to the DOM, which React
     * rejects as unknown attributes - so the offset is folded into the viewBox
     * origin instead. Same rendering, no wrapper, works on every platform.
     */
    <Svg width={size} height={size} viewBox="-4 -3 100 100" fill="none">
      <Defs>
        <LinearGradient
          id="ez-front"
          x1="24"
          y1="18"
          x2="80"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#A374FF" />
          <Stop offset="1" stopColor="#7A2BE0" />
        </LinearGradient>
        <LinearGradient
          id="ez-top"
          x1="14"
          y1="10"
          x2="80"
          y2="55"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#E7DCFF" />
          <Stop offset="1" stopColor="#C2A9FF" />
        </LinearGradient>
        <LinearGradient
          id="ez-side"
          x1="14"
          y1="10"
          x2="24"
          y2="82"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#5C24AE" />
          <Stop offset="1" stopColor="#3E1A80" />
        </LinearGradient>
      </Defs>

      {/* Dark left-side fold */}
      <Path d="M24 18 L24 82 L14 74 L14 10 Z" fill="url(#ez-side)" />

      {/* Light top facets */}
      <Path d="M24 18 L80 18 L70 10 L14 10 Z" fill="url(#ez-top)" />
      <Path d="M42 43 L72 43 L62 35 L32 35 Z" fill="url(#ez-top)" />
      <Path d="M42 63 L80 63 L70 55 L32 55 Z" fill="url(#ez-top)" />

      {/* Bright front face */}
      <Path
        d="M24 18 L80 18 L80 37 L42 37 L42 43 L72 43 L72 58 L42 58 L42 63 L80 63 L80 82 L24 82 Z"
        fill="url(#ez-front)"
      />
    </Svg>
  );
});

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  /** Soft violet halo behind the mark - reads well on the dark background. */
  glow?: boolean;
  className?: string;
}

export const Logo = memo(function Logo({
  size = 36,
  showWordmark = true,
  glow = true,
  className,
}: LogoProps) {
  return (
    <View
      className={cn('flex-row items-center', className)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Eventerz"
    >
      <View style={{ width: size, height: size }}>
        {glow && (
          <View
            className="absolute rounded-full bg-brand-purple/40"
            style={{
              left: size * 0.12,
              top: size * 0.12,
              width: size * 0.76,
              height: size * 0.76,
              // Native has no blur filter for shadows on Views, so a soft
              // coloured elevation stands in for the web's `blur-lg`.
              ...makeShadow('#9945ff', 0.9, size * 0.4, 0),
            }}
          />
        )}
        <EventerzMark size={size} />
      </View>

      {showWordmark && (
        <Text
          className="ml-2.5 text-foreground"
          style={{
            fontFamily: fontFamily.display,
            fontSize: size * 0.55,
            letterSpacing: -0.5,
          }}
        >
          Eventerz
        </Text>
      )}
    </View>
  );
});
