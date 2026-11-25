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

/**
 * A tile takes a third of its row: a 30% basis puts three on a line, and
 * growing shares out the rest, so a line always adds up to exactly the grid.
 * Tiles measured to a third of the grid wrapped the third one onto its own
 * line whenever the grid came out a hair narrower (the 430 pt iPhone Pro Max).
 */
const TILE_STYLE = { flexBasis: '30%', flexGrow: 1 } as const;

/** Pads the last line with spacers, so its tiles keep a third of the width. */
function withSpacers(items: React.ReactNode[]): React.ReactNode[] {
  const tiles = items.filter((item) => item != null && item !== false);
  const spacers = (COLUMNS - (tiles.length % COLUMNS)) % COLUMNS;
  for (let index = 0; index < spacers; index++) {
    tiles.push(<View key={`spacer-${index}`} style={TILE_STYLE} />);
  }
  return tiles;
}

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
    // A brand in two countries (Mercado Pago) makes one account, so it shows once.
    const seen = new Set<string>();
    return searchAccountLogos(trimmedQuery)
      .map((logo) => tileFor(starterKindForLogo(logo.id), logo))
      .filter((tile) => {
        const key = starterSelectionKey(tile.selection);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_SEARCH_RESULTS);
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

  // A name the set has, typed in full, is that result: it takes its logo,
  // and no "Add" tile repeats it.
  const exact = trimmedQuery
    ? searchTiles.find((tile) => tile.selection.name.toLowerCase() === trimmedQuery.toLowerCase())
    : undefined;

  // A name the logo set does not have becomes a bank account without a logo.
  // The field keeps the name when the limit refuses it.
  const addTyped = () => {
    if (!trimmedQuery) return;
    const typed: StarterSelection = exact?.selection ?? {
      kind: 'bank',
      logoId: null,
      name: trimmedQuery,
    };
    // Already picked (typed before, or a logo of that name): adding again
    // must not take it back.
    if (selectedKeys.has(starterSelectionKey(typed)) || toggle(typed)) setQuery('');
  };

  const renderTile = (tile: Tile) => {
    const key = starterSelectionKey(tile.selection);
    const selected = selectedKeys.has(key);
    return (
      <Pressable
        key={`${key}|${tile.selection.logoId ?? ''}`}
        onPress={() => toggle(tile.selection)}
        style={TILE_STYLE}
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

  const count = selections.length;

  // How many are picked sits beside the first section's title; at the limit
  // it says why a tap did nothing.
  const counter = (
    <Text
      variant="caption"
      tone={limitHit ? 'default' : 'muted'}
      numberOfLines={2}
      className={cn('flex-shrink text-right', limitHit && 'text-primary')}
      accessibilityLiveRegion="polite"
    >
      {limitHit
        ? I18n.t('onboarding.accounts.limit', { max: MAX_STARTER_ACCOUNTS })
        : I18n.t('onboarding.accounts.count', { count, max: MAX_STARTER_ACCOUNTS })}
    </Text>
  );

  const renderGrid = (
    title: string,
    tiles: Tile[],
    options: { first?: boolean; extra?: React.ReactNode } = {},
  ) => (
    <View className="mt-5" key={title}>
      <View className="mb-2.5 flex-row items-center justify-between gap-3">
        <Text variant="label" tone="muted">
          {title}
        </Text>
        {options.first ? counter : null}
      </View>
      <View className="flex-row flex-wrap" style={{ gap: TILE_GAP }}>
        {withSpacers([...tiles.map(renderTile), options.extra])}
      </View>
    </View>
  );

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
      {/* The country rides in the search field, as in the logo pickers. */}
      <View
        className={cn('h-12 flex-row items-center gap-2 px-3.5', ONBOARDING_CARD, 'rounded-2xl')}
      >
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setShowCountries(true);
          }}
          hitSlop={6}
          className="flex-row items-center gap-0.5"
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('accounts.logo.country')}: ${countryName}`}
        >
          <Text className="text-[18px]">{getCountryFlag(country)}</Text>
          <ChevronDown size={13} color={themeColors.textMuted} />
        </Pressable>
        <View className="my-3 w-px self-stretch bg-border" />
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={I18n.t('onboarding.accounts.search_placeholder')}
          placeholderTextColor={themeColors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (searchTiles.length === 0 || exact) addTyped();
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

      <View>
        {trimmedQuery ? (
          renderGrid(I18n.t('onboarding.accounts.section_results'), searchTiles, {
            first: true,
            extra: exact ? null : (
              <Pressable
                key="add-typed"
                onPress={addTyped}
                style={TILE_STYLE}
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
              </Pressable>
            ),
          })
        ) : (
          <>
            {otherPicks.length > 0
              ? renderGrid(I18n.t('onboarding.accounts.section_picked'), otherPicks, {
                  first: true,
                })
              : null}
            {sections.map((section, index) =>
              renderGrid(I18n.t(SECTION_TITLE_KEY[section.kind]), section.tiles, {
                first: index === 0 && otherPicks.length === 0,
              }),
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
