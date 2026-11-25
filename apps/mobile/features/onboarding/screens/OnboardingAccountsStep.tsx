import { Check, ChevronDown, Plus, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AccountLogo, CategoryEmoji, Text } from '~/components/ui';
import { LogoCountryPickerModal } from '~/components/ui/LogoCountryPickerModal';
import {
  ACCOUNT_LOGO_COUNTRIES,
  getCountryFlag,
  searchAccountLogos,
} from '~/constants/accountLogos';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { ONBOARDING_CARD, ONBOARDING_CARD_SELECTED } from '~/features/onboarding/constants/styles';
import {
  MAX_STARTER_ACCOUNTS,
  type StarterKind,
  starterKindForLogo,
  starterSectionsForCountry,
  type StarterSelection,
  starterSelectionKey,
} from '~/features/onboarding/lib/starterAccounts';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

/** Search shows this many logos at most; the rest are a sharper query away. */
const MAX_SEARCH_RESULTS = 24;
const COLUMNS = 3;
const TILE_GAP = 8;

const SECTION_TITLE_KEY: Record<StarterKind, string> = {
  cash: 'onboarding.accounts.section_wallets',
  wallet: 'onboarding.accounts.section_wallets',
  bank: 'onboarding.accounts.section_banks',
  card: 'onboarding.accounts.section_cards',
};

interface Tile {
  selection: StarterSelection;
  /** The tile's caption: a card says "Maybank card" where the account is "Maybank Card". */
  label: string;
}

function cashSelection(): StarterSelection {
  return { kind: 'cash', logoId: null, name: I18n.t('onboarding.accounts.cash') };
}

/** The selection the step starts with: everyone has a wallet of cash. */
export function initialStarterSelections(): StarterSelection[] {
  return [cashSelection()];
}

function tileFor(kind: Exclude<StarterKind, 'cash'>, logo: { id: string; name: string }): Tile {
  return {
    selection: { kind, logoId: logo.id, name: logo.name },
    label:
      kind === 'card' ? I18n.t('onboarding.accounts.card_tile', { name: logo.name }) : logo.name,
  };
}

interface OnboardingAccountsStepProps {
  country: string;
  onCountryChange: (country: string) => void;
  selections: StarterSelection[];
  onSelectionsChange: (selections: StarterSelection[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Account building as part of setup: the popular wallets, banks and cards of
 * the user's country, one tap each, up to MAX_STARTER_ACCOUNTS. The accounts
 * are created when onboarding finishes; skipping leaves the starter set.
 */
export function OnboardingAccountsStep({
  country,
  onCountryChange,
  selections,
  onSelectionsChange,
  onBack,
  onContinue,
  onSkip,
}: OnboardingAccountsStepProps) {
  const themeColors = useThemeColors();
  const [query, setQuery] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth > 0 ? (gridWidth - TILE_GAP * (COLUMNS - 1)) / COLUMNS : 0;

  const selectedKeys = useMemo(() => new Set(selections.map(starterSelectionKey)), [selections]);
  const countryName =
    ACCOUNT_LOGO_COUNTRIES.find((entry) => entry.slug === country)?.name ?? country;
  const trimmedQuery = query.trim();

  const sections = useMemo(() => {
    const offered = starterSectionsForCountry(country);
    const wallets = offered.find((section) => section.kind === 'wallet');
    const cash: Tile = { selection: cashSelection(), label: I18n.t('onboarding.accounts.cash') };
    const walletTiles = [cash, ...(wallets?.logos ?? []).map((logo) => tileFor('wallet', logo))];
    return [
      { kind: 'wallet' as const, tiles: walletTiles },
      ...offered
        .filter((section) => section.kind !== 'wallet')
        .map((section) => ({
          kind: section.kind,
          tiles: section.logos.map((logo) => tileFor(section.kind, logo)),
        })),
    ];
  }, [country]);

  // Picks that the page is not showing (another country's, or found by
  // search) stay in view at the top, so they can be taken back.
  const otherPicks = useMemo<Tile[]>(() => {
    const shown = new Set(
      sections.flatMap((section) =>
        section.tiles.map((tile) => starterSelectionKey(tile.selection)),
      ),
    );
    return selections
      .filter((selection) => !shown.has(starterSelectionKey(selection)))
      .map((selection) => ({
        selection,
        label:
          selection.kind === 'card'
            ? I18n.t('onboarding.accounts.card_tile', { name: selection.name })
            : selection.name,
      }));
  }, [sections, selections]);

  const searchTiles = useMemo<Tile[]>(() => {
    if (!trimmedQuery) return [];
    return searchAccountLogos(trimmedQuery)
      .slice(0, MAX_SEARCH_RESULTS)
      .map((logo) => tileFor(starterKindForLogo(logo.id), logo));
  }, [trimmedQuery]);

  /** Picks or unpicks; false when the pick was refused at the limit. */
  const toggle = (selection: StarterSelection): boolean => {
    const key = starterSelectionKey(selection);
    if (selectedKeys.has(key)) {
      void triggerHaptic('selection');
      setLimitHit(false);
      onSelectionsChange(selections.filter((item) => starterSelectionKey(item) !== key));
      return true;
    }
    if (selections.length >= MAX_STARTER_ACCOUNTS) {
      void triggerHaptic('warning');
      setLimitHit(true);
      return false;
    }
    void triggerHaptic('light');
    onSelectionsChange([...selections, selection]);
    return true;
  };

  // A name the logo set does not have becomes a bank account without a logo.
  // The field keeps the name when the limit refuses it.
  const addTyped = () => {
    if (!trimmedQuery) return;
    if (toggle({ kind: 'bank', logoId: null, name: trimmedQuery })) setQuery('');
  };

  const renderTile = (tile: Tile) => {
    const key = starterSelectionKey(tile.selection);
    const selected = selectedKeys.has(key);
    return (
      <Pressable
        key={key}
        onPress={() => toggle(tile.selection)}
        style={{ width: tileWidth }}
        className={cn(
          'items-center gap-2 px-1.5 pb-2.5 pt-3',
          selected ? ONBOARDING_CARD_SELECTED : ONBOARDING_CARD,
        )}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={tile.label}
      >
        {tile.selection.kind === 'cash' ? (
          <View className="h-10 w-10 items-center justify-center">
            <CategoryEmoji icon="wallet" size={36} />
          </View>
        ) : (
          <AccountLogo
            logoId={tile.selection.logoId}
            type={tile.selection.kind === 'card' ? 'credit' : 'debit'}
            size={40}
          />
        )}
        <Text
          variant="caption"
          numberOfLines={2}
          className={cn('text-center text-[12px] leading-[16px]', selected && 'text-primary')}
        >
          {tile.label}
        </Text>
        {selected ? (
          <View className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Check size={12} strokeWidth={3} color={themeColors.card} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderGrid = (title: string, tiles: Tile[], extra?: React.ReactNode) => (
    <View className="mt-5" key={title}>
      <Text variant="label" tone="muted" className="mb-2.5">
        {title}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: TILE_GAP }}>
        {tiles.map(renderTile)}
        {extra}
      </View>
    </View>
  );

  const count = selections.length;

  return (
    <OnboardingStepLayout
      title={I18n.t('onboarding.accounts.title')}
      subtitle={I18n.t('onboarding.accounts.subtitle', { max: MAX_STARTER_ACCOUNTS })}
      mascot="cards"
      onBack={onBack}
      primaryLabel={
        count === 0
          ? I18n.t('onboarding.accounts.add_none')
          : I18n.t(count === 1 ? 'onboarding.accounts.add_one' : 'onboarding.accounts.add_other', {
              count,
            })
      }
      primaryDisabled={count === 0}
      onPrimary={() => {
        void triggerHaptic('medium');
        onContinue();
      }}
      secondary={{ label: I18n.t('onboarding.accounts.skip'), onPress: onSkip }}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setShowCountries(true);
          }}
          className={cn('flex-row items-center gap-2 px-3.5 py-2', ONBOARDING_CARD, 'rounded-full')}
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('accounts.logo.country')}: ${countryName}`}
        >
          <Text className="text-[18px]">{getCountryFlag(country)}</Text>
          <Text variant="bodyStrong" numberOfLines={1} className="max-w-[160px] text-foreground">
            {countryName}
          </Text>
          <ChevronDown size={16} color={themeColors.textMuted} />
        </Pressable>
        <Text
          variant="caption"
          tone={limitHit ? 'default' : 'muted'}
          className={cn('flex-shrink text-right', limitHit && 'text-primary')}
          accessibilityLiveRegion="polite"
        >
          {limitHit
            ? I18n.t('onboarding.accounts.limit', { max: MAX_STARTER_ACCOUNTS })
            : I18n.t('onboarding.accounts.count', { count, max: MAX_STARTER_ACCOUNTS })}
        </Text>
      </View>

      <View
        className={cn(
          'mt-3 h-12 flex-row items-center gap-2 px-3.5',
          ONBOARDING_CARD,
          'rounded-2xl',
        )}
      >
        <Search size={17} color={themeColors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={I18n.t('onboarding.accounts.search_placeholder')}
          placeholderTextColor={themeColors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (searchTiles.length === 0) addTyped();
          }}
          className="flex-1 text-[16px] text-foreground"
          style={{ paddingVertical: 0 }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.clear')}
          >
            <X size={16} color={themeColors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
        {tileWidth <= 0 ? null : trimmedQuery ? (
          renderGrid(
            I18n.t('onboarding.accounts.section_results'),
            searchTiles,
            <Pressable
              onPress={addTyped}
              style={{ width: tileWidth }}
              className={cn(
                'items-center gap-2 px-1.5 pb-2.5 pt-3',
                ONBOARDING_CARD,
                'border-dashed',
              )}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('onboarding.accounts.add_typed', { name: trimmedQuery })}
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Plus size={20} color={themeColors.primary} />
              </View>
              <Text
                variant="caption"
                numberOfLines={2}
                className="text-center text-[12px] leading-[16px] text-primary"
              >
                {I18n.t('onboarding.accounts.add_typed', { name: trimmedQuery })}
              </Text>
            </Pressable>,
          )
        ) : (
          <>
            {otherPicks.length > 0
              ? renderGrid(I18n.t('onboarding.accounts.section_picked'), otherPicks)
              : null}
            {sections.map((section) =>
              renderGrid(I18n.t(SECTION_TITLE_KEY[section.kind]), section.tiles),
            )}
          </>
        )}
      </View>

      <LogoCountryPickerModal
        visible={showCountries}
        onClose={() => setShowCountries(false)}
        countries={ACCOUNT_LOGO_COUNTRIES}
        activeCountry={country}
        getFlag={getCountryFlag}
        onSelect={(slug) => {
          void triggerHaptic('selection');
          setShowCountries(false);
          setQuery('');
          onCountryChange(slug);
        }}
      />
    </OnboardingStepLayout>
  );
}
