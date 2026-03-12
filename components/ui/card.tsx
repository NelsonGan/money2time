import * as React from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outline' | 'hero' | 'soft' | 'glass' | 'accent';
  interactive?: boolean;
}

const Card = React.forwardRef<View, CardProps>(
  ({ className, children, variant = 'default', interactive = false, ...props }, ref) => {
    const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.985 });
    const themeColors = useThemeColors();

    const variantStyles = {
      default: 'bg-card border border-border/50 shadow-soft-lg',
      elevated: 'bg-card border border-border/30 shadow-float',
      outline: 'bg-transparent border border-border/60',
      hero: 'bg-primary border-0 shadow-glow-lg',
      soft: 'bg-secondary/40 border border-border/20',
      glass: 'bg-card/80 border border-border/25 shadow-float',
      accent: 'bg-card border border-primary/20 shadow-glow',
    };

    return (
      <Animated.View
        style={interactive ? animatedStyle : undefined}
        onTouchStart={interactive ? handlePressIn : undefined}
        onTouchEnd={interactive ? handlePressOut : undefined}
        onTouchCancel={interactive ? handlePressOut : undefined}
      >
        <View
          ref={ref}
          className={cn('rounded-[28px] p-5', variantStyles[variant], className)}
          {...props}
        >
          {/* Decorative corner accent for 'accent' variant */}
          {variant === 'accent' ? (
            <View
              className="absolute -top-1 -right-1 h-20 w-20 rounded-full opacity-[0.07]"
              style={{ backgroundColor: themeColors.primary }}
            />
          ) : null}
          {children}
        </View>
      </Animated.View>
    );
  },
);

Card.displayName = 'Card';

const CardContent = React.forwardRef<View, ViewProps>(({ className, ...props }, ref) => (
  <View ref={ref} className={cn('', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardContent };
