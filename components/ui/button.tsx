import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '~/hooks/usePressScale';
import { type HapticKind, triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { TextClassContext } from './text';

const buttonVariants = cva(
  'group flex-row items-center justify-center border border-transparent web:ring-offset-background web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary rounded-pill shadow-glow web:hover:opacity-95 active:opacity-90',
        destructive:
          'bg-destructive rounded-pill shadow-sm shadow-destructive/20 web:hover:opacity-95 active:opacity-90',
        outline:
          'border border-border/60 bg-card rounded-[22px] web:hover:bg-secondary active:bg-secondary',
        secondary:
          'border border-border/50 bg-secondary/60 rounded-[22px] web:hover:opacity-95 active:opacity-95',
        ghost: 'bg-transparent rounded-[22px] web:hover:bg-secondary/80 active:bg-secondary/80',
        link: 'web:underline-offset-4 web:hover:underline web:focus:underline',
        warm: 'bg-accent rounded-pill shadow-warm-lg web:hover:opacity-95 active:opacity-90',
        glass:
          'bg-card/70 border border-border/30 rounded-pill shadow-float web:hover:opacity-95 active:opacity-90',
      },
      size: {
        default: 'h-[54px] px-7',
        sm: 'h-10 px-5',
        lg: 'h-[58px] px-8',
        icon: 'h-11 w-11 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const buttonTextVariants = cva('web:whitespace-nowrap font-bold web:transition-colors', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'text-foreground',
      link: 'text-primary group-active:underline',
      warm: 'text-accent-foreground',
      glass: 'text-foreground',
    },
    size: {
      default: 'text-[15px]',
      sm: 'text-[14px]',
      lg: 'text-[16px]',
      icon: 'text-[15px]',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    bouncy?: boolean;
    haptic?: HapticKind;
  };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, bouncy = true, haptic, ...props }, ref) => {
    const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.95 });
    const hapticKind = haptic ?? 'light';

    return (
      <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
        <AnimatedPressable
          style={bouncy ? animatedStyle : undefined}
          className={cn(
            props.disabled && 'opacity-45 web:pointer-events-none',
            buttonVariants({ variant, size, className }),
          )}
          ref={ref}
          role="button"
          onPressIn={(e) => {
            handlePressIn();
            void triggerHaptic(hapticKind);
            props.onPressIn?.(e);
          }}
          onPressOut={(e) => {
            handlePressOut();
            props.onPressOut?.(e);
          }}
          {...props}
        />
      </TextClassContext.Provider>
    );
  },
);
Button.displayName = 'Button';

export { Button };
