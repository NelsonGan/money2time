import * as Slot from '@rn-primitives/slot';
import * as React from 'react';
import { Text as RNText } from 'react-native';

import { cn } from '~/utils';

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

const variantMap: Record<TextVariant, string> = {
  hero: 'text-[48px] leading-[54px] font-extrabold tracking-tighter',
  display: 'text-[38px] leading-[44px] font-extrabold tracking-tight',
  title: 'text-[30px] leading-[36px] font-extrabold',
  heading: 'text-[24px] leading-[30px] font-bold',
  subheading: 'text-[19px] leading-[26px] font-bold',
  friendly: 'text-[17px] leading-[24px] font-medium',
  body: 'text-[16px] leading-6 font-normal',
  bodyStrong: 'text-[16px] leading-6 font-bold',
  caption: 'text-[13px] leading-[18px] font-semibold',
  label: 'text-[11px] leading-[14px] font-bold tracking-widest uppercase',
  mono: 'text-[16px] leading-[20px] font-bold tracking-tight',
  monoLg: 'text-[22px] leading-[26px] font-extrabold tracking-tight',
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
>(({ className, asChild = false, variant = 'body', tone = 'default', ...props }, ref) => {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      className={cn('web:select-text', variantMap[variant], toneMap[tone], textClass, className)}
      ref={ref}
      {...props}
    />
  );
});
Text.displayName = 'Text';

export { Text, TextClassContext };
