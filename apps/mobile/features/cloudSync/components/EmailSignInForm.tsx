import {
  CircleAlert,
  CircleCheck,
  Mail,
  MailCheck,
  PencilLine,
  RotateCw,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputInstance, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { FatButton, Input, NoticeBanner, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import { useCloudSync } from '../CloudSyncContext';
import { errorMessage } from '../lib/messages';
import { useTurnstile } from './Turnstile';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
/**
 * Seconds before another code can be asked for. The Worker allows three per
 * address a minute; waiting this long keeps a tap from ever hitting that.
 */
const RESEND_COOLDOWN_SECONDS = 30;

/** Email sign-in: the address, then the 6-digit code sent to it. */
export function EmailSignInForm({ onCancel }: { onCancel: () => void }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const captcha = useTurnstile();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // A request finishing after the form went away (signed in, backed out)
  // must not touch it.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(I18n.t('cloud_sync.errors.invalid_email'));
      return;
    }
    setError(null);
    setNotice(null);
    setBusy('send');
    try {
      const token = await captcha.requestToken();
      // Cancelled on the challenge, or the form closed: nothing is sent.
      if (token === null || !alive.current) return;
      await sync.sendEmailCode(trimmed, token);
      if (!alive.current) return;
      if (step === 'code') {
        setNotice(I18n.t('cloud_sync.code_sent'));
        setCode('');
      }
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const verify = async (value = code) => {
    if (value.trim().length < CODE_LENGTH || busy) return;
    setError(null);
    setNotice(null);
    setBusy('verify');
    try {
      await sync.verifyEmailCode(email, value);
      // Signed in: the provider swaps this form for the next view.
    } catch (e) {
      if (!alive.current) return;
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
    setNotice(null);
  };

  const isCode = step === 'code';
  const Icon = isCode ? MailCheck : Mail;

  return (
    <View className="gap-5 pt-2">
      <View className="items-center gap-2">
        <View style={[styles.icon, { backgroundColor: withColorAlpha(colors.primary, 0.12) }]}>
          <Icon size={30} color={colors.primary} />
        </View>
        <Text variant="headingSm" className="text-center">
          {isCode ? I18n.t('cloud_sync.code_title') : I18n.t('cloud_sync.email_title')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {isCode ? I18n.t('cloud_sync.code_sent_to') : I18n.t('cloud_sync.email_body')}
        </Text>
        {isCode ? (
          <Text variant="bodyStrong" className="text-center" numberOfLines={1}>
            {email.trim()}
          </Text>
        ) : null}
      </View>

      {error ? (
        <NoticeBanner key={`e:${error}`} icon={CircleAlert} tone="error" text={error} />
      ) : notice ? (
        <NoticeBanner key={`n:${notice}`} icon={CircleCheck} tone="success" text={notice} />
      ) : null}

      {isCode ? (
        <CodeBoxes
          value={code}
          onChange={(next) => {
            // Held while a code is checked or a new one is sent (which clears
            // the boxes); the field stays editable so the keyboard stays up.
            if (busy) return;
            setCode(next);
            if (error) setError(null);
            // A full code (typed or filled from the keyboard) goes at once.
            if (next.length === CODE_LENGTH) void verify(next);
          }}
          busy={busy !== null}
          hasError={error !== null}
        />
      ) : (
        <Input
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            if (error) setError(null);
          }}
          placeholder={I18n.t('cloud_sync.email_placeholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          invalid={error !== null}
          autoFocus
        />
      )}

      <FatButton
        color={colors.primary}
        label={isCode ? I18n.t('cloud_sync.verify') : I18n.t('cloud_sync.send_code')}
        loading={busy === (isCode ? 'verify' : 'send')}
        disabled={busy !== null || (isCode && code.length < CODE_LENGTH)}
        onPress={() => void (isCode ? verify() : send())}
      />

      {isCode ? (
        <View className="flex-row gap-3">
          <Chip
            icon={<RotateCw size={16} color={colors.primary} />}
            label={I18n.t('cloud_sync.resend')}
            trailing={cooldown > 0 ? `0:${String(cooldown).padStart(2, '0')}` : undefined}
            loading={busy === 'send'}
            disabled={busy !== null || cooldown > 0}
            onPress={() => void send()}
            testID="cloud-sync-resend"
          />
          <Chip
            icon={<PencilLine size={16} color={colors.primary} />}
            label={I18n.t('cloud_sync.change_email')}
            disabled={busy !== null}
            onPress={changeEmail}
            testID="cloud-sync-change-email"
          />
        </View>
      ) : (
        <Chip
          label={I18n.t('cloud_sync.other_options')}
          disabled={busy !== null}
          onPress={onCancel}
          plain
          testID="cloud-sync-email-back"
        />
      )}

      {captcha.element}
    </View>
  );
}

/**
 * The code as six boxes over one hidden input, so paste and the keyboard's
 * one-time-code suggestion fill all six at once.
 */
function CodeBoxes({
  value,
  onChange,
  busy,
  hasError,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  hasError: boolean;
}) {
  const colors = useThemeColors();
  const input = useRef<TextInputInstance | null>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable
      accessible={false}
      onPress={() => input.current?.focus()}
      style={styles.codeRow}
      testID="cloud-sync-code-boxes"
    >
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? '';
        const current = focused && !busy && index === Math.min(value.length, CODE_LENGTH - 1);
        const borderColor = hasError
          ? colors.error
          : current
            ? colors.primary
            : withColorAlpha(colors.text, digit ? 0.22 : 0.12);
        return (
          <View
            key={index}
            // The hidden input below is what a screen reader reads.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.codeBox,
              { borderColor, backgroundColor: colors.card },
              current && styles.codeBoxCurrent,
            ]}
          >
            <Text style={[styles.codeDigit, { color: colors.text }]}>{digit}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel={I18n.t('cloud_sync.code_title')}
        testID="cloud-sync-code"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

/** A compact action under the main button: outlined, icon and label on one line. */
function Chip({
  label,
  icon,
  trailing,
  loading = false,
  disabled = false,
  plain = false,
  onPress,
  testID,
}: {
  label: string;
  icon?: React.ReactNode;
  trailing?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Text only, no outline: a way back rather than an action. */
  plain?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useThemeColors();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${label}, ${trailing}` : label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={testID}
      // A plain style array: NativeWind's Pressable drops function styles.
      style={[
        styles.chip,
        plain
          ? styles.chipPlain
          : { borderColor: withColorAlpha(colors.text, 0.12), backgroundColor: colors.card },
        pressed && styles.pressed,
        disabled && !loading && styles.dimmed,
      ]}
    >
      {loading ? <LoadingDots size="tiny" /> : icon}
      <Text variant="bodyStrong" tone={plain ? 'muted' : undefined} numberOfLines={1}>
        {label}
      </Text>
      {trailing ? (
        <Text variant="caption" tone="muted" style={styles.tabular}>
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  // A fixed size: a flex-sized box with an aspect ratio collapses in Yoga.
  codeBox: {
    width: 48,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxCurrent: { borderWidth: 2 },
  codeDigit: { fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.011,
    color: 'transparent',
  },
  chip: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  chipPlain: { borderColor: 'transparent', backgroundColor: 'transparent' },
  pressed: { opacity: 0.7 },
  dimmed: { opacity: 0.5 },
  tabular: { fontVariant: ['tabular-nums'] },
});
