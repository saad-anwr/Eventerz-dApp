/**
 * Dashboard charts.
 *
 * Hand-rolled with react-native-svg rather than a charting library: the app
 * needs exactly two chart types, and a dependency-free implementation keeps
 * full control of the gradient fills and stays consistent with the brand.
 */

import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { fontFamily } from '@/theme/typography';
import type { AnalyticsPoint } from '@/types';
import { useThemeColors } from '@/theme/theme-provider';

/** Catmull-Rom -> cubic Bézier, so the trend line reads as a smooth curve. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export const AreaChart = memo(function AreaChart({
  data,
  height = 150,
  width,
}: {
  data: AnalyticsPoint[];
  height?: number;
  width: number;
}) {
  const themeColors = useThemeColors();
  const { line, area, points } = useMemo(() => {
    if (data.length === 0) return { line: '', area: '', points: [] };

    const max = Math.max(...data.map((d) => d.value), 1);
    const padY = 16;
    const usableHeight = height - padY * 2;
    const step = width / Math.max(1, data.length - 1);

    const pts = data.map((d, i) => ({
      x: i * step,
      y: padY + usableHeight - (d.value / max) * usableHeight,
    }));

    const linePath = smoothPath(pts);
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
    return { line: linePath, area: areaPath, points: pts };
  }, [data, height, width]);

  if (data.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <Svg
        width={width}
        height={height}
        accessibilityLabel={`Trend chart, ${data.length} points, peaking at ${Math.max(
          ...data.map((d) => d.value),
        )}`}
      >
        <Defs>
          <SvgGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={brand.purple} stopOpacity="0.42" />
            <Stop offset="1" stopColor={brand.purple} stopOpacity="0" />
          </SvgGradient>
          <SvgGradient id="area-stroke" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={brand.purple} />
            <Stop offset="0.5" stopColor={brand.blue} />
            <Stop offset="1" stopColor={brand.cyan} />
          </SvgGradient>
        </Defs>

        <Path d={area} fill="url(#area-fill)" />
        <Path
          d={line}
          stroke="url(#area-stroke)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Terminal marker on the most recent point */}
        {points.length > 0 && (
          <Rect
            x={points[points.length - 1].x - 3.5}
            y={points[points.length - 1].y - 3.5}
            width={7}
            height={7}
            rx={3.5}
            fill={brand.cyan}
          />
        )}
      </Svg>

      <View className="mt-2 flex-row justify-between">
        {data.map((point, i) =>
          // Thin the axis labels so they never collide on a narrow phone.
          i % 2 === 0 || i === data.length - 1 ? (
            <Text
              key={point.label}
              style={{
                fontFamily: fontFamily.medium,
                fontSize: 10,
                color: themeColors.mutedForeground,
              }}
            >
              {point.label}
            </Text>
          ) : (
            <View key={point.label} />
          ),
        )}
      </View>
    </Animated.View>
  );
});

export const BarChart = memo(function BarChart({
  data,
}: {
  data: AnalyticsPoint[];
}) {
  const themeColors = useThemeColors();
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View className="gap-3">
      {data.map((point, index) => (
        <Animated.View
          key={point.label}
          entering={FadeIn.delay(index * 70).duration(400)}
          className="flex-row items-center gap-3"
          accessible
          accessibilityLabel={`${point.label}: ${point.value} percent`}
        >
          <Text
            className="w-16"
            style={{
              fontFamily: fontFamily.medium,
              fontSize: 12,
              color: themeColors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {point.label}
          </Text>

          <View
            className="flex-1 overflow-hidden bg-white/[0.06]"
            style={{ height: 8, borderRadius: radius.full }}
          >
            <View
              style={{
                width: `${(point.value / max) * 100}%`,
                height: '100%',
                borderRadius: radius.full,
                backgroundColor:
                  point.value >= 90
                    ? brand.green
                    : point.value >= 75
                      ? brand.cyan
                      : brand.purple,
              }}
            />
          </View>

          <Text
            className="w-9 text-right"
            style={{
              fontFamily: fontFamily.semibold,
              fontSize: 12,
              color: themeColors.foreground,
            }}
          >
            {point.value}%
          </Text>
        </Animated.View>
      ))}
    </View>
  );
});
