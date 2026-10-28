import { ChevronRight, CreditCard, type LucideIcon, Pencil, Tag } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import {
  Button,
  CategoryEmoji,
  CurrencyPickerSheet,
  FormScrollView,
  InfoTooltipButton,
  Input,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencyNameForCode, currencySymbolForCode } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';

import { ledgerDisplayName, ledgerIcon } from '../lib/ledgerDisplay';

const SCROLL_CONTENT = { gap: 16, paddingHorizontal: 20, paddingTop: 8 };

interface LedgerEditorScreenProps {
  /** The ledger to edit; absent to create one. */
  ledgerId?: string;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
  onBack: () => void;
  /** After a ledger is created and opened. */
  onCreated: () => void;
}

/**
 * Create a ledger (icon, name, currency, and what it starts with) or rename
 * and re-icon one. A ledger's currency is set once, here: changing it later is
 * the Multi currency page's "start over in a new currency".
 */
export function LedgerEditorScreen({
  ledgerId,
  onOpenIconPicker,
  onBack,
  onCreated,
}: LedgerEditorScreenProps) {
  const { ledgers, activeLedger, settings, categories, accounts, createLedger, updateLedger } =
    useApp();
  const themeColors = useThemeColors();
  // The page sits in the Settings tab, under the floating tab bar.
  const bottomNavInset = useSettingsBottomNavInset();
  const existing = useMemo(
    () => (ledgerId ? (ledgers.find((ledger) => ledger.id === ledgerId) ?? null) : null),
    [ledgerId, ledgers],
  );
  const isEditing = existing != null;
  // The ledger being edited was deleted meanwhile: leave rather than turn
  // into a New ledger form.
  const isGone = ledgerId != null && existing == null;
  useEffect(() => {
    if (isGone) onBack();
  }, [isGone, onBack]);
  // A second tap while the screen animates away must not create a second ledger.
  const savedRef = useRef(false);

  const [icon, setIcon] = useState(() => ledgerIcon(existing));
  // The default ledger's name stays empty until the user types one, so it
  // keeps following the app language ("Main") instead of freezing one.
  const [name, setName] = useState(() => existing?.name ?? '');
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  // On copies from the open ledger; off starts with the starter set.
  const [copyAccounts, setCopyAccounts] = useState(true);
  const [copyCategories, setCopyCategories] = useState(true);

  const openLedgerName = ledgerDisplayName(activeLedger);
  const copyableAccountCount = useMemo(
    () =>
      accounts.filter((account) => account.type === 'debit' || account.type === 'credit').length,
    [accounts],
  );

  const trimmedName = name.trim();
  const isDefaultLedger = existing?.id === DEFAULT_LEDGER_ID;
  const canSave = trimmedName.length > 0 || isDefaultLedger;

  const handleSave = () => {
    if (!canSave || savedRef.current) return;
    savedRef.current = true;
    void triggerHaptic('success');
    if (existing) {
      updateLedger(existing.id, { name: trimmedName, emoji: icon });
      onBack();
      return;
    }
    try {
      createLedger({
        name: trimmedName,
        emoji: icon,
        currencyCode,
        currencySymbol: currencySymbolForCode(currencyCode),
        copyAccounts,
        copyCategories,
      });
    } catch (error) {
      savedRef.current = false;
      Alert.alert(getErrorMessage(error, I18n.t('errors.generic_operation_failed')));
      return;
    }
    onCreated();
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title={isEditing ? I18n.t('ledgers.edit_title') : I18n.t('ledgers.new')}
        onBack={onBack}
      />
      <FormScrollView contentContainerStyle={[SCROLL_CONTENT, bottomNavInset]}>
        <View className="items-center py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('category_icon.choose_title')}
            testID="ledger-icon"
            onPress={() => {
              void triggerHaptic('selection');
              onOpenIconPicker({
                selectedValue: icon,
                onSelect: (value) => {
                  if (value) setIcon(value);
                },
              });
            }}
            className="h-24 w-24 items-center justify-center rounded-full border border-border/30 bg-card shadow-soft active:opacity-80"
          >
            <CategoryEmoji icon={icon} size={48} />
            <View className="absolute -bottom-0.5 -right-0.5 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary">
              <Pencil size={14} color="#fff" />
            </View>
          </Pressable>
        </View>

        <Input
          label={I18n.t('ledgers.name_label')}
          value={name}
          onChangeText={setName}
          placeholder={
            isDefaultLedger ? I18n.t('ledgers.default_name') : I18n.t('ledgers.name_placeholder')
          }
          maxLength={40}
          autoFocus={!isEditing}
          testID="ledger-name"
        />

        {!isEditing ? (
          <>
            <View>
              <Text variant="label" tone="muted" className="mb-2.5 px-1">
                {I18n.t('ledgers.currency_label')}
              </Text>
              <Pressable
                accessibilityRole="button"
                testID="ledger-currency"
                onPress={() => {
                  void triggerHaptic('selection');
                  setCurrencyPickerVisible(true);
                }}
                className="flex-row items-center gap-3 rounded-[22px] border border-border/30 bg-card px-4 py-3.5 active:opacity-80"
              >
                <Text variant="bodyStrong">{currencyCode}</Text>
                <Text variant="body" tone="muted" className="flex-1" numberOfLines={1}>
                  {currencyNameForCode(currencyCode)}
                </Text>
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>

            <View className="-mb-1 mt-2 flex-row items-center gap-2 px-1">
              <Text variant="label" tone="muted">
                {I18n.t('ledgers.start_with')}
              </Text>
              <InfoTooltipButton
                title={I18n.t('ledgers.start_with')}
                infoTooltip={I18n.t('ledgers.create_footnote')}
                iconSize={14}
              />
            </View>
            <View className="rounded-3xl border border-border/30 bg-card">
              <View className="flex-row items-center gap-3 px-4 pb-3 pt-4">
                <Text variant="body" tone="muted">
                  {I18n.t('ledgers.copy_from')}
                </Text>
                <View className="flex-1 items-start">
                  <View className="max-w-full flex-row items-center gap-2 rounded-full bg-primary/10 py-1.5 pl-2 pr-3">
                    <CategoryEmoji icon={ledgerIcon(activeLedger)} size={18} />
                    <Text variant="bodyStrong" numberOfLines={1} className="shrink">
                      {openLedgerName}
                    </Text>
                  </View>
                </View>
              </View>
              <StartWithRow
                icon={CreditCard}
                title={I18n.t('ledgers.accounts')}
                subtitle={
                  copyAccounts
                    ? I18n.t(
                        copyableAccountCount === 1
                          ? 'ledgers.copy_accounts_one'
                          : 'ledgers.copy_accounts_other',
                        { count: copyableAccountCount },
                      )
                    : I18n.t('ledgers.starter_accounts_caption')
                }
                value={copyAccounts}
                onChange={setCopyAccounts}
              />
              <StartWithRow
                icon={Tag}
                title={I18n.t('ledgers.categories')}
                subtitle={
                  copyCategories
                    ? I18n.t(
                        categories.length === 1
                          ? 'ledgers.copy_categories_one'
                          : 'ledgers.copy_categories_other',
                        { count: categories.length },
                      )
                    : I18n.t('ledgers.starter_categories_caption')
                }
                value={copyCategories}
                onChange={setCopyCategories}
              />
            </View>
          </>
        ) : null}

        <Button onPress={handleSave} disabled={!canSave} testID="ledger-save" className="mt-2">
          <Text>{isEditing ? I18n.t('common.save') : I18n.t('ledgers.create')}</Text>
        </Button>
      </FormScrollView>

      <CurrencyPickerSheet
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        onSelect={setCurrencyCode}
        selectedCode={currencyCode}
      />
    </SettingsPageLayout>
  );
}

/**
 * One thing the new ledger can copy from the open one. The subtitle says what
 * the choice gives: the copied count, or the starter set when off.
 */
function StartWithRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const themeColors = useThemeColors();
  const toggle = (next: boolean) => {
    void triggerHaptic('selection');
    onChange(next);
  };
  return (
    <Pressable
      accessible={false}
      onPress={() => toggle(!value)}
      className="flex-row items-center gap-3 border-t border-border/30 px-4 py-3.5 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
        <Icon size={20} color={themeColors.primary} />
      </View>
      <View className="flex-1">
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {subtitle}
        </Text>
      </View>
      <Switch
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        value={value}
        onValueChange={toggle}
        trackColor={{ true: themeColors.primary }}
      />
    </Pressable>
  );
}
