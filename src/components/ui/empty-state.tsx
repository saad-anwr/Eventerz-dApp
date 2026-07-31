/**
 * Empty and error states.
 *
 * Both share the same anatomy - haloed icon, headline, supporting line,
 * optional action - so a list that flips between "no results" and "failed to
 * load" does not jump around.
 */

import { memo } from 'react';
import { View } from 'react-native';

import { brand } from '@/theme/colors';
import { radius } from '@/theme/layout';
import { cn } from '@/utils/cn';

import { Button } from './button';
import { CircleAlert, type LucideIcon } from './icon';
import { Text } from './text';

interface StateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Halo tint - defaults to brand purple. */
  accent?: string;
  className?: string;
}

export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  accent = brand.purple,
  className,
}: StateProps) {
  return (
    <View
      className={cn('items-center px-8 py-14', className)}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      {Icon && (
        <View
          className="items-center justify-center"
          style={{
            width: 64,
            height: 64,
            borderRadius: radius['2xl'],
            backgroundColor: `${accent}1a`,
            borderWidth: 1,
            borderColor: `${accent}33`,
          }}
        >
          <Icon size={26} color={accent} strokeWidth={1.8} />
        </View>
      )}

      <Text variant="h3" className="mt-5 text-center">
        {title}
      </Text>

      {description && (
        <Text
          variant="bodySm"
          className="mt-2 text-center text-muted-foreground"
        >
          {description}
        </Text>
      )}

      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          className="mt-6"
        />
      )}
    </View>
  );
});

export const ErrorState = memo(function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this right now. Check your connection and try again.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      description={description}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
      accent="#f87171"
      className={className}
    />
  );
});
