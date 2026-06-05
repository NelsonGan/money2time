import * as Slot from '@rn-primitives/slot';
import * as React from 'react';
import { Platform, Text as RNText, type TextStyle } from 'react-native';

import { cn } from '~/utils';
import { FONT } from '~/utils/fonts';

const TextClassContext = React.createContext<string | undefined>(undefined);

type TextVariant =
  | 'hero'
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'friendly'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono'
  | 'monoLg';

type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'inverse';

interface VariantConfig {
  className: string;
  fontFamily: string;
  fontWeight?: TextStyle['fontWeight'];
}

const variantMap: Record<TextVariant, VariantConfig> = {
  hero: {
    className: 'text-[48px] leading-[54px] tracking-tighter',
    fontFamily: FONT.extrabold,
    fontWeight: '800',
  },
  display: {
    className: 'text-[38px] leading-[44px] tracking-tight',
    fontFamily: FONT.extrabold,
    fontWeight: '800',
  },
  title: { className: 'text-[30px] leading-[36px]', fontFamily: FONT.extrabold, fontWeight: '800' },
  heading: { className: 'text-[24px] leading-[30px]', fontFamily: FONT.bold, fontWeight: '700' },
  subheading: { className: 'text-[19px] leading-[26px]', fontFamily: FONT.bold, fontWeight: '700' },
  friendly: { className: 'text-[17px] leading-[24px]', fontFamily: FONT.medium, fontWeight: '500' },
  body: { className: 'text-[16px] leading-6', fontFamily: FONT.regular, fontWeight: '400' },
  bodyStrong: { className: 'text-[16px] leading-6', fontFamily: FONT.bold, fontWeight: '700' },
  caption: {
    className: 'text-[13px] leading-[18px]',
    fontFamily: FONT.semibold,
    fontWeight: '600',
  },
  label: {
    className: 'text-[11px] leading-[14px] tracking-widest uppercase',
    fontFamily: FONT.bold,
    fontWeight: '700',
  },
  mono: {
    className: 'text-[16px] leading-[20px] tracking-tight',
    fontFamily: FONT.monoBold,
    fontWeight: '700',
  },
  monoLg: {
    className: 'text-[22px] leading-[26px] tracking-tight',
    fontFamily: FONT.monoBold,
    fontWeight: '700',
  },
};

const toneMap: Record<TextTone, string> = {
  default: 'text-foreground',
  secondary: 'text-secondary-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
  inverse: 'text-white',
};

const Text = React.forwardRef<
  React.ElementRef<typeof RNText>,
  React.ComponentPropsWithoutRef<typeof RNText> & {
    asChild?: boolean;
    variant?: TextVariant;
    tone?: TextTone;
  }
>(({ className, asChild = false, variant = 'body', tone = 'default', style, ...props }, ref) => {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  const config = variantMap[variant];
  return (
    <Component
      className={cn('web:select-text', config.className, toneMap[tone], textClass, className)}
      ref={ref}
      style={[
        { fontFamily: config.fontFamily },
        Platform.OS === 'ios' ? { fontWeight: config.fontWeight } : null,
        Platform.OS === 'android' && (variant === 'mono' || variant === 'monoLg')
          ? { fontVariant: ['tabular-nums'] }
          : null,
        style,
      ]}
      {...props}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
    />
  );
});
Text.displayName = 'Text';

export { Text, TextClassContext };
