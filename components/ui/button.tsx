import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useResolvedTheme } from '~/context/ThemeContext';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { type HapticKind, triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { darkenColor } from '~/utils/color';

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

const buttonTextVariants = cva('web:whitespace-nowrap font-extrabold web:transition-colors', {
  variants: {
    variant: {
      default: 'text-white',
      destructive: 'text-white',
      outline: 'text-white',
      secondary: 'text-white',
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

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;

// Solid/raised variants get the 3D "fat-button" ledge; transparent/text-like
// ones (ghost, link, glass) and round icon buttons stay flat.
const FAT_VARIANTS = new Set<ButtonVariant>([
  'default',
  'destructive',
  'warm',
  'secondary',
  'outline',
]);
const FAT_LEDGE = 4;
const FAT_SINK = FAT_LEDGE - 1;
// Neutral face shared by secondary/outline so their white label reads on both
// backgrounds: a dark charcoal on the light cream UI, a lighter slate on the
// dark UI so the button still stands out.
const NEUTRAL_FACE_LIGHT = '#3A3A3C';
const NEUTRAL_FACE_DARK = '#4A5263';

type ButtonProps = React.ComponentPropsWithoutRef<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    bouncy?: boolean;
    haptic?: HapticKind;
  };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, bouncy = true, haptic, ...props }, ref) => {
    const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.95 });
    const themeColors = useThemeColors();
    const isDark = useResolvedTheme() === 'dark';
    const hapticKind = haptic ?? 'light';

    const resolvedVariant = variant ?? 'default';
    const isFat = size !== 'icon' && FAT_VARIANTS.has(resolvedVariant);
    // Face color is resolved per-variant and per-mode so the white label always
    // has enough contrast: theme colors are darkened in dark mode (where they're
    // lightened for accents), and the neutral face flips light/dark.
    const faceColor = React.useMemo(() => {
      switch (resolvedVariant) {
        case 'destructive':
          return isDark ? darkenColor(themeColors.error, 0.18) : themeColors.error;
        case 'warm':
          return themeColors.accent;
        case 'secondary':
        case 'outline':
          return isDark ? NEUTRAL_FACE_DARK : NEUTRAL_FACE_LIGHT;
        default:
          return isDark ? darkenColor(themeColors.primary, 0.32) : themeColors.primary;
      }
    }, [resolvedVariant, isDark, themeColors]);
    const ledgeColor = React.useMemo(() => darkenColor(faceColor, 0.28), [faceColor]);

    // Press-through: sink the face onto the base while the ledge collapses.
    const fat = useSharedValue(0);
    const fatStyle = useAnimatedStyle(() => ({
      backgroundColor: faceColor,
      // Hide the side/top borders some variants carry (e.g. outline/secondary)
      // so only the colored face and the bottom ledge show.
      borderColor: 'transparent',
      transform: [{ translateY: fat.value * FAT_SINK }],
      borderBottomWidth: FAT_LEDGE - fat.value * FAT_SINK,
      borderBottomColor: ledgeColor,
    }));

    return (
      <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
        <AnimatedPressable
          style={isFat ? fatStyle : bouncy ? animatedStyle : undefined}
          className={cn(
            props.disabled && 'opacity-45 web:pointer-events-none',
            buttonVariants({ variant, size, className }),
          )}
          ref={ref}
          role="button"
          onPressIn={(e) => {
            if (isFat) {
              fat.value = withTiming(1, { duration: 70 });
            } else {
              handlePressIn();
            }
            void triggerHaptic(hapticKind);
            props.onPressIn?.(e);
          }}
          onPressOut={(e) => {
            if (isFat) {
              fat.value = withTiming(0, { duration: 120 });
            } else {
              handlePressOut();
            }
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
