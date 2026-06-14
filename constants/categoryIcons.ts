import type { ImageSourcePropType } from 'react-native';

import { DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';

// Hand-drawn category icons. Keyed by icon name (filename without extension).
export const CATEGORY_ICON_SOURCES: Record<string, ImageSourcePropType> = {
  alcohol: require('../assets/category-icons/alcohol.png'),
  ballone: require('../assets/category-icons/ballone.png'),
  balloon: require('../assets/category-icons/balloon.png'),
  bank: require('../assets/category-icons/bank.png'),
  beach: require('../assets/category-icons/beach.png'),
  'bill-calendar': require('../assets/category-icons/bill-calendar.png'),
  'boxing-gloves': require('../assets/category-icons/boxing-gloves.png'),
  briefcase: require('../assets/category-icons/briefcase.png'),
  bus: require('../assets/category-icons/bus.png'),
  camera: require('../assets/category-icons/camera.png'),
  'camper-van': require('../assets/category-icons/camper-van.png'),
  car: require('../assets/category-icons/car.png'),
  cash: require('../assets/category-icons/cash.png'),
  cat: require('../assets/category-icons/cat.png'),
  'chess-knight': require('../assets/category-icons/chess-knight.png'),
  clapperboard: require('../assets/category-icons/clapperboard.png'),
  coffee: require('../assets/category-icons/coffee.png'),
  'coins-checkmark': require('../assets/category-icons/coins-checkmark.png'),
  'coins-euro': require('../assets/category-icons/coins-euro.png'),
  coins: require('../assets/category-icons/coins.png'),
  cosmetics: require('../assets/category-icons/cosmetics.png'),
  'credit-card': require('../assets/category-icons/credit-card.png'),
  dog: require('../assets/category-icons/dog.png'),
  dress: require('../assets/category-icons/dress.png'),
  dumbbell: require('../assets/category-icons/dumbbell.png'),
  faucet: require('../assets/category-icons/faucet.png'),
  'game-controller': require('../assets/category-icons/game-controller.png'),
  'gas-pump': require('../assets/category-icons/gas-pump.png'),
  gear: require('../assets/category-icons/gear.png'),
  gift: require('../assets/category-icons/gift.png'),
  'globe-money': require('../assets/category-icons/globe-money.png'),
  'globe-shield': require('../assets/category-icons/globe-shield.png'),
  'graduation-cap': require('../assets/category-icons/graduation-cap.png'),
  'grocery-basket': require('../assets/category-icons/grocery-basket.png'),
  headphone: require('../assets/category-icons/headphone.png'),
  heart: require('../assets/category-icons/heart.png'),
  house: require('../assets/category-icons/house.png'),
  invoice: require('../assets/category-icons/invoice.png'),
  keys: require('../assets/category-icons/keys.png'),
  laptop: require('../assets/category-icons/laptop.png'),
  'light-bulb': require('../assets/category-icons/light-bulb.png'),
  meal: require('../assets/category-icons/meal.png'),
  medicine: require('../assets/category-icons/medicine.png'),
  mountain: require('../assets/category-icons/mountain.png'),
  'paw-print': require('../assets/category-icons/paw-print.png'),
  'piggy-bank': require('../assets/category-icons/piggy-bank.png'),
  plane: require('../assets/category-icons/plane.png'),
  'potted-plant': require('../assets/category-icons/potted-plant.png'),
  'price-tag': require('../assets/category-icons/price-tag.png'),
  'question-mark': require('../assets/category-icons/question-mark.png'),
  'shopping-bag': require('../assets/category-icons/shopping-bag.png'),
  sneaker: require('../assets/category-icons/sneaker.png'),
  sofa: require('../assets/category-icons/sofa.png'),
  stethoscope: require('../assets/category-icons/stethoscope.png'),
  't-shirt': require('../assets/category-icons/t-shirt.png'),
  target: require('../assets/category-icons/target.png'),
  van: require('../assets/category-icons/van.png'),
  wallet: require('../assets/category-icons/wallet.png'),
  warning: require('../assets/category-icons/warning.png'),
  'work-bag': require('../assets/category-icons/work-bag.png'),
  wrench: require('../assets/category-icons/wrench.png'),
  'yoga-mat': require('../assets/category-icons/yoga-mat.png'),
};

export type CategoryIconName = keyof typeof CATEGORY_ICON_SOURCES;

// Backward-compat: emoji values stored in the DB (the legacy icon format) map to
// hand-drawn icons at render time. Keys mirror DEFAULT_CATEGORY_EMOJIS in
// constants/appDefaults.ts plus the onboarding "Other" tag. Emojis without a
// matching icon are intentionally omitted and fall back to the emoji glyph.
export const EMOJI_TO_ICON: Record<string, CategoryIconName> = {
  '🍔': 'meal',
  '🍕': 'meal',
  '🛒': 'grocery-basket',
  '🚗': 'car',
  '🏠': 'house',
  '📱': 'laptop',
  '💊': 'medicine',
  '🎮': 'game-controller',
  '🎬': 'clapperboard',
  '🎓': 'graduation-cap',
  '📚': 'graduation-cap',
  '🏋️': 'dumbbell',
  '🧳': 'camper-van',
  '✈️': 'plane',
  '🐶': 'dog',
  '👶': 'balloon',
  '👕': 't-shirt',
  '💡': 'light-bulb',
  '🍺': 'alcohol',
  '☕': 'coffee',
  '💼': 'briefcase',
  '💰': 'cash',
  '🎁': 'gift',
  '📈': 'coins',
  '🏦': 'bank',
  '🧾': 'invoice',
  '🔁': 'bill-calendar',
  '🛍️': 'shopping-bag',
  '🏥': 'stethoscope',
  '🧼': 'faucet',
  '🏷️': 'price-tag',
};

/**
 * All selectable icon values for the category icon picker (one entry per icon,
 * so the picker offers every hand-drawn icon). Icons that have a legacy emoji
 * mapping are represented by the emoji (kept first, in the curated common-first
 * order) so existing categories stay backward-compatible; the rest are
 * represented by their icon name, which resolveCategoryIconSource resolves
 * directly.
 */
export const CATEGORY_ICON_PICKER_VALUES: string[] = (() => {
  const values: string[] = [];
  const usedIcons = new Set<CategoryIconName>();
  for (const emoji of DEFAULT_CATEGORY_EMOJIS) {
    const name = EMOJI_TO_ICON[emoji];
    if (name && !usedIcons.has(name)) {
      values.push(emoji);
      usedIcons.add(name);
    }
  }
  for (const name of Object.keys(CATEGORY_ICON_SOURCES) as CategoryIconName[]) {
    if (!usedIcons.has(name)) {
      values.push(name);
      usedIcons.add(name);
    }
  }
  return values;
})();

/**
 * Resolves an icon value (emoji or icon name) to a static image source.
 * Accepts a raw icon name directly (so we can store names in the future) and
 * falls back to the legacy emoji map. Returns null when there is no matching
 * icon, in which case callers should render the emoji glyph as text.
 */
export function resolveCategoryIconSource(value?: string | null): ImageSourcePropType | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (CATEGORY_ICON_SOURCES[trimmed]) return CATEGORY_ICON_SOURCES[trimmed];
  const mapped = EMOJI_TO_ICON[trimmed];
  return mapped ? CATEGORY_ICON_SOURCES[mapped] : null;
}
