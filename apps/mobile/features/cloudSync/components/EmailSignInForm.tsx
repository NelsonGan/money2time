import { Mail } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, FatButton, Input, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

import { useCloudSync } from '../CloudSyncContext';
import { errorMessage } from '../lib/messages';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;

/** Email sign-in: the address, then the 6-digit code sent to it. */
export function EmailSignInForm({ onCancel }: { onCancel: () => void }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const send = async () => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(I18n.t('cloud_sync.errors.invalid_email'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sync.sendEmailCode(trimmed);
      if (step === 'code') setNotice(I18n.t('cloud_sync.code_sent'));
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < CODE_LENGTH) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sync.verifyEmailCode(email, code);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'email') {
      onCancel();
      return;
    }
    setStep('email');
    setCode('');
    setError(null);
    setNotice(null);
  };

  return (
    <View className="gap-4 pt-2">
      <View className="items-center gap-2">
        <View style={[styles.icon, { backgroundColor: withColorAlpha(colors.primary, 0.12) }]}>
          <Mail size={30} color={colors.primary} />
        </View>
        <Text variant="headingSm" className="text-center">
          {step === 'email' ? I18n.t('cloud_sync.email_title') : I18n.t('cloud_sync.code_title')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {step === 'email'
            ? I18n.t('cloud_sync.email_body')
            : I18n.t('cloud_sync.code_body', { email: email.trim() })}
        </Text>
      </View>

      {step === 'email' ? (
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder={I18n.t('cloud_sync.email_placeholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          autoFocus
        />
      ) : (
        <Input
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={CODE_LENGTH}
          style={styles.codeInput}
          autoFocus
        />
      )}

      {error ? (
        <Text variant="caption" tone="error" className="text-center">
          {error}
        </Text>
      ) : notice ? (
        <Text variant="caption" tone="success" className="text-center">
          {notice}
        </Text>
      ) : null}

      <FatButton
        color={colors.primary}
        label={step === 'email' ? I18n.t('cloud_sync.send_code') : I18n.t('cloud_sync.verify')}
        disabled={busy || (step === 'code' && code.length < CODE_LENGTH)}
        onPress={() => void (step === 'email' ? send() : verify())}
      />
      {busy ? <ActivityIndicator /> : null}

      <View className="items-center gap-1">
        {step === 'code' ? (
          <Button variant="ghost" size="sm" disabled={busy} onPress={() => void send()}>
            <Text tone="muted">{I18n.t('cloud_sync.resend')}</Text>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" disabled={busy} onPress={back}>
          <Text tone="muted">
            {step === 'code' ? I18n.t('cloud_sync.change_email') : I18n.t('common.back')}
          </Text>
        </Button>
      </View>
    </View>
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
  codeInput: {
    fontSize: 26,
    letterSpacing: 8,
    textAlign: 'center',
  },
});
