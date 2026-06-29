import { ChevronRight, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import {
  Button,
  CurrencyPickerSheet,
  Input,
  ItemIcon,
  ItemIconPickerSheet,
  SettingsActionBar,
  SettingsHeader,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromDateLocal, formatRelativeDate } from '~/utils/formatters';

interface ItemEditorScreenProps {
  itemId?: string;
  onClose: () => void;
  /** Called when the free item limit is hit while adding (host reveals paywall). */
  onLimitReached?: () => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 40 } as const;

export function ItemEditorScreen({ itemId, onClose, onLimitReached }: ItemEditorScreenProps) {
  const { items, settings, fxCurrencies, createItem, updateItem, deleteItem } = useApp();
  const themeColors = useThemeColors();

  const existing = useMemo(() => items.find((i) => i.id === itemId) ?? null, [itemId, items]);
  const isEditing = existing != null;

  const [name, setName] = useState(existing?.name ?? '');
  const [iconId, setIconId] = useState<string | null>(existing?.iconId ?? null);
  const [price, setPrice] = useState(existing ? String(existing.purchasePrice) : '');
  const [currency, setCurrency] = useState(existing?.currency ?? settings.currencyCode);
  const [purchaseDate, setPurchaseDate] = useState(
    existing?.purchaseDate ?? dayKeyFromDateLocal(new Date()),
  );
  const [isInactive, setIsInactive] = useState(existing?.endDate != null);
  const [endDate, setEndDate] = useState(existing?.endDate ?? dayKeyFromDateLocal(new Date()));
  const [hasSalePrice, setHasSalePrice] = useState(existing?.salePrice != null);
  const [salePrice, setSalePrice] = useState(
    existing?.salePrice != null ? String(existing.salePrice) : '',
  );
  const [note, setNote] = useState(existing?.note ?? '');

  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showPurchasePicker, setShowPurchasePicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const currencySymbol = currencySymbolForCode(currency);
  const parsedPrice = Number.parseFloat(price);
  const canSave = name.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice >= 0;

  // Currency choices = the main currency + the user's sub-currencies (plus the
  // item's own currency, so an existing value is always selectable).
  const currencyCodes = useMemo(
    () => Array.from(new Set([settings.currencyCode, ...fxCurrencies, currency])),
    [settings.currencyCode, fxCurrencies, currency],
  );

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const parsedSale = Number.parseFloat(salePrice);
    const input = {
      name: name.trim(),
      iconId,
      purchasePrice: parsedPrice,
      currency,
      purchaseDate,
      endDate: isInactive ? endDate : null,
      salePrice: isInactive && hasSalePrice && Number.isFinite(parsedSale) ? parsedSale : null,
      note: note.trim() || null,
    };
    void triggerHaptic('success');
    if (isEditing && existing) {
      updateItem(existing.id, input);
    } else {
      createItem(input);
    }
    onClose();
  }, [
    canSave,
    createItem,
    currency,
    endDate,
    existing,
    hasSalePrice,
    iconId,
    isEditing,
    isInactive,
    name,
    note,
    onClose,
    parsedPrice,
    purchaseDate,
    salePrice,
    updateItem,
  ]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    void triggerHaptic('warning');
    Alert.alert(I18n.t('items.delete_title'), I18n.t('items.delete_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteItem(existing.id);
          onClose();
        },
      },
    ]);
  }, [deleteItem, existing, onClose]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-2"
          onBack={onClose}
          title={isEditing ? I18n.t('items.edit_title') : I18n.t('items.add_title')}
          rightAccessory={
            isEditing ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
              >
                <Trash2 size={18} color={themeColors.coral} />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          {/* Icon */}
          <View className="items-center">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setShowIconPicker(true);
              }}
              className="items-center gap-2"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('items.icon.choose_title')}
            >
              <View className="h-20 w-20 items-center justify-center rounded-[22px] border border-border/30 bg-secondary/30">
                <ItemIcon iconId={iconId} size={64} />
              </View>
              <Text variant="caption" className="text-primary">
                {I18n.t('items.choose_icon')}
              </Text>
            </Pressable>
          </View>

          <Input
            label={I18n.t('items.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={I18n.t('items.name_placeholder')}
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={I18n.t('items.price_label')}
                variant="currency"
                currencySymbol={currencySymbol}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
              />
            </View>
            <View className="w-[110px]">
              <Text variant="label" tone="muted" className="mb-1.5">
                {I18n.t('items.currency_label')}
              </Text>
              <Pressable
                onPress={() => setShowCurrencyPicker(true)}
                className="h-[52px] flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-3"
              >
                <Text variant="body">{currency}</Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Purchase date */}
          <View className="gap-1.5">
            <Text variant="label" tone="muted">
              {I18n.t('items.purchase_date_label')}
            </Text>
            <Pressable
              onPress={() => setShowPurchasePicker(true)}
              className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
            >
              <Text variant="body">{formatRelativeDate(purchaseDate, settings.locale)}</Text>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          </View>

          {/* Mark as inactive — flat fields, consistent with the rest of the form */}
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body">{I18n.t('items.mark_inactive')}</Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('items.mark_inactive_hint')}
              </Text>
            </View>
            <Switch
              value={isInactive}
              onValueChange={(v) => {
                void triggerHaptic('selection');
                setIsInactive(v);
              }}
              trackColor={{ true: themeColors.primary }}
            />
          </View>

          {isInactive ? (
            <>
              <View className="gap-1.5">
                <Text variant="label" tone="muted">
                  {I18n.t('items.end_date_label')}
                </Text>
                <Pressable
                  onPress={() => setShowEndPicker(true)}
                  className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
                >
                  <Text variant="body">{formatRelativeDate(endDate, settings.locale)}</Text>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <View className="flex-row items-center justify-between gap-3">
                <Text variant="body" className="flex-1">
                  {I18n.t('items.sold_toggle')}
                </Text>
                <Switch
                  value={hasSalePrice}
                  onValueChange={(v) => {
                    void triggerHaptic('selection');
                    setHasSalePrice(v);
                  }}
                  trackColor={{ true: themeColors.primary }}
                />
              </View>

              {hasSalePrice ? (
                <Input
                  label={I18n.t('items.sale_price_label')}
                  variant="currency"
                  currencySymbol={currencySymbol}
                  value={salePrice}
                  onChangeText={setSalePrice}
                  placeholder="0.00"
                />
              ) : null}
            </>
          ) : null}

          <Input
            label={I18n.t('items.note_label')}
            variant="multiline"
            value={note}
            onChangeText={setNote}
            placeholder={I18n.t('items.note_placeholder')}
          />
        </View>
      </ScrollView>

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />

      <ItemIconPickerSheet
        visible={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        selectedIconId={iconId}
        onSelect={setIconId}
        onLimitReached={onLimitReached}
      />
      <CurrencyPickerSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        selectedCode={currency}
        restrictToCodes={currencyCodes}
        onSelect={(code) => {
          setCurrency(code);
          setShowCurrencyPicker(false);
        }}
      />
      <DatePickerModal
        visible={showPurchasePicker}
        value={purchaseDate}
        title={I18n.t('items.purchase_date_label')}
        onSelect={(date) => {
          setPurchaseDate(date);
          setShowPurchasePicker(false);
        }}
        onClose={() => setShowPurchasePicker(false)}
      />
      <DatePickerModal
        visible={showEndPicker}
        value={endDate}
        title={I18n.t('items.end_date_label')}
        onSelect={(date) => {
          setEndDate(date);
          setShowEndPicker(false);
        }}
        onClose={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  );
}
