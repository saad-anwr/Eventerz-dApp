/**
 * Gradient-filled text - the web app's `.text-gradient` utility.
 *
 * React Native cannot clip a gradient to text with CSS, so we draw the string
 * as an SVG `<Text>` and use it as the gradient's mask. Reserved for short,
 * high-impact strings (hero headline, stat values) - regular copy uses `<Text>`.
 */

import { memo } from 'react';
import { View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { gradients } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

export interface GradientTextProps {
  children: string;
  fontSize?: number;
  /** Defaults to the display family. */
  family?: string;
  /** Height of the SVG canvas; defaults to 1.25x the font size. */
  height?: number;
  letterSpacing?: number;
  /** Gradient stops; defaults to the brand purple->blue->cyan sweep. */
  colors?: readonly string[];
}

export const GradientText = memo(function GradientText({
  children,
  fontSize = 32,
  family = fontFamily.displayBold,
  height,
  letterSpacing = -0.5,
  colors = gradients.brand.colors,
}: GradientTextProps) {
  const canvasHeight = height ?? fontSize * 1.3;
  // Rough advance-width estimate - SVG needs an explicit canvas width and RN
  // gives no text-measurement API outside of onLayout.
  const canvasWidth = children.length * fontSize * 0.62 + fontSize;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={children}
      style={{ height: canvasHeight, width: canvasWidth }}
    >
      <Svg width={canvasWidth} height={canvasHeight}>
        <Defs>
          <LinearGradient id="gradient-text" x1="0" y1="0" x2="1" y2="0.6">
            {colors.map((color, i) => (
              <Stop
                key={color + i}
                offset={i / Math.max(1, colors.length - 1)}
                stopColor={color}
              />
            ))}
          </LinearGradient>
        </Defs>
        <SvgText
          x={0}
          y={fontSize}
          fontSize={fontSize}
          fontFamily={family}
          letterSpacing={letterSpacing}
          fill="url(#gradient-text)"
        >
          {children}
        </SvgText>
      </Svg>
    </View>
  );
});
