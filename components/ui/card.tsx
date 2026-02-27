import * as React from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '~/hooks/usePressScale';
import { cn } from '~/utils';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outline' | 'hero' | 'soft';
  interactive?: boolean;
}

const Card = React.forwardRef<View, CardProps>(
  ({ className, children, variant = 'default', interactive = false, ...props }, ref) => {
    const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.985 });

    const variantStyles = {
      default: 'bg-card border border-border/50 shadow-sm shadow-black/4',
      elevated: 'bg-card border border-border/40 shadow-lg shadow-black/8',
      outline: 'bg-transparent border border-border/70',
      hero: 'bg-primary border-0 shadow-glow',
      soft: 'bg-secondary/50 border border-border/30',
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
