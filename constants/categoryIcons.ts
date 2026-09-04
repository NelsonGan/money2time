import type { ImageSourcePropType } from 'react-native';

import { CATEGORY_ICON_GROUP_ORDER, CATEGORY_ICON_METADATA } from '~/constants/categoryIconGroups';

import {
  CATEGORY_ICON_SOURCES,
  GENERATED_CATEGORY_ICONS,
  type GeneratedIconPack,
  ICON_PACKS as GENERATED_ICON_PACKS,
} from './categoryIcons.generated';

export { CATEGORY_ICON_SOURCES, type GeneratedIconPack };

/** Pack every bundled icon belongs to unless a future pack says otherwise. */
export const DEFAULT_ICON_PACK_ID = 'default';

/**
 * Packs in display order. The generator lists them alphabetically by folder,
 * which buries the free default in the middle; it leads instead, and the rest
 * stay alphabetical.
 */
export const ICON_PACKS: GeneratedIconPack[] = [...GENERATED_ICON_PACKS].sort((a, b) => {
  if (a.id === DEFAULT_ICON_PACK_ID) return -1;
  if (b.id === DEFAULT_ICON_PACK_ID) return 1;
  return a.name.localeCompare(b.name);
});

export type CategoryIconName = keyof typeof CATEGORY_ICON_SOURCES;

/**
 * ## Stored icon value grammar
 *
 * One tagged string covers every icon a category, savings goal or budget
 * template can carry. It is what lives in `categories.icon`,
 * `accounts.goal_emoji`, `budget_templates.emoji` and
 * `monthly_budgets.template_emoji`:
 *
 * | value                              | meaning                                 |
 * | ---------------------------------- | --------------------------------------- |
 * | `''` / `null`                      | no icon                                 |
 * | `meal`                             | bundled hand-drawn PNG (bare id)        |
 * | `emoji:X`                          | a literal Unicode emoji the user picked |
 * | `custom:category-icons/<uuid>.png` | a user-uploaded image                   |
 *
 * Emoji are prefixed rather than stored bare because a bare glyph is exactly
 * what pre-migration rows hold, where it meant "look me up in
 * LEGACY_EMOJI_TO_ICON". Tagging makes "is this a legacy value?" decidable, so
 * `normalizeIconValue` (lib/db/normalizeIcons.ts) is a true fixpoint: an
 * unmapped legacy glyph becomes `emoji:X` once and stays there, instead of
 * being reconsidered on every restore or re-run. It also means classification
 * is an ASCII `startsWith` rather than a Unicode regex, which matters because
 * emoji are routinely multi-codepoint (a flag is a surrogate pair of regional
 * indicators, a ZWJ family runs five codepoints or more).
 *
 * `custom:` reuses the prefix account logos and item icons already use, so
 * `assetRelativePathFromRef` in services/userAssets.ts handles these refs
 * unchanged. No bundled id contains `:`, so the three namespaces are disjoint.
 */
export const EMOJI_VALUE_PREFIX = 'emoji:';
export const CUSTOM_ICON_PREFIX = 'custom:';

/** True when the value contains any non-ASCII character, i.e. it looks like a
 *  glyph rather than a kebab-case id. Written as a scan rather than a regex so
 *  the source carries no control-character escapes. */
function hasNonAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return true;
  }
  return false;
}

export type ClassifiedCategoryIcon =
  | { kind: 'none' }
  | { kind: 'bundled'; id: string; source: ImageSourcePropType }
  | { kind: 'custom'; ref: string }
  | { kind: 'emoji'; glyph: string };

const NONE: ClassifiedCategoryIcon = { kind: 'none' };

/**
 * Resolves a stored value to what should be drawn. Pure, and deliberately free
 * of native imports: services/widgetSnapshot.shared.ts and the node-env Jest
 * suites import this module, so it must not reach for expo-file-system. The
 * `custom` branch therefore returns the raw ref and leaves the filesystem hop
 * to the renderer (see components/ui/CategoryEmoji.tsx).
 */
export function classifyCategoryIcon(value?: string | null): ClassifiedCategoryIcon {
  const trimmed = value?.trim();
  if (!trimmed) return NONE;
  if (trimmed.startsWith(CUSTOM_ICON_PREFIX)) return { kind: 'custom', ref: trimmed };
  if (trimmed.startsWith(EMOJI_VALUE_PREFIX)) {
    const glyph = trimmed.slice(EMOJI_VALUE_PREFIX.length);
    return glyph ? { kind: 'emoji', glyph } : NONE;
  }
  // Own-property lookup: the stored value comes from a DB row, and a restored
  // backup can carry anything. A plain index read would resolve `constructor`
  // or `__proto__` to something off Object.prototype and hand the renderer a
  // function where it expects an image source.
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ICON_SOURCES, trimmed)) {
    return { kind: 'bundled', id: trimmed, source: CATEGORY_ICON_SOURCES[trimmed] };
  }
  // Safety net for a legacy glyph that dodged normalization (an old backup
  // restored through a path we missed). Degrades to "shows an emoji", never to
  // "shows nothing", and needs no lookup table to do it.
  if (hasNonAscii(trimmed)) return { kind: 'emoji', glyph: trimmed };
  return NONE;
}

/**
 * Resolves a value to a bundled static image source, or null when it is not a
 * bundled icon. Callers that also need the emoji/custom cases should use
 * {@link classifyCategoryIcon} directly.
 */
export function resolveCategoryIconSource(value?: string | null): ImageSourcePropType | null {
  const classified = classifyCategoryIcon(value);
  return classified.kind === 'bundled' ? classified.source : null;
}

export interface CategoryIconMeta {
  id: string;
  /** Trailing segment of the id; the key metadata and emoji are stored under. */
  concept: string;
  name: string;
  /** Slug of the pack folder the artwork came from. */
  pack: string;
  /** Slug of the group folder, i.e. its section in the picker. */
  group: string;
  /** Space-separated lowercase search terms (name and id included). */
  keywords: string;
}

/**
 * Every bundled icon, joining the generated pack/group layout with the
 * hand-maintained names and keywords. An icon with no metadata entry keeps its
 * title-cased id, which reads fine for a self-describing filename.
 */
export const CATEGORY_ICONS: CategoryIconMeta[] = GENERATED_CATEGORY_ICONS.map(
  ({ id, concept, pack, group, fallbackName }) => {
    const meta = CATEGORY_ICON_METADATA[concept];
    const name = meta?.name ?? fallbackName;
    const keywords = `${name} ${concept.replace(/-/g, ' ')} ${meta?.keywords ?? ''}`.toLowerCase();
    return { id, concept, name, pack, group, keywords };
  },
);

const ICONS_BY_ID = new Map(CATEGORY_ICONS.map((icon) => [icon.id, icon]));

export function getCategoryIconMeta(id: string): CategoryIconMeta | null {
  return ICONS_BY_ID.get(id) ?? null;
}

/**
 * Icons of one pack bucketed into sections, in CATEGORY_ICON_GROUP_ORDER, with
 * any group missing from that list appended alphabetically so a newly added
 * folder shows up without a code change.
 */
export function categoryIconsByGroup(
  packId: string,
): { group: string; icons: CategoryIconMeta[] }[] {
  const inPack = CATEGORY_ICONS.filter((icon) => icon.pack === packId);
  const groups = Array.from(new Set(inPack.map((icon) => icon.group)));
  const order = CATEGORY_ICON_GROUP_ORDER as readonly string[];
  groups.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return groups.map((group) => ({
    group,
    icons: inPack.filter((icon) => icon.group === group),
  }));
}

/**
 * i18n key for a section header. Group ids come from folder names and may
 * contain hyphens (`food-and-drink`), while i18n keys are underscore-separated,
 * so the two must not be derived independently.
 */
export function categoryIconGroupLabelKey(group: string): string {
  return `category_icon.group_${group.replace(/-/g, '_')}`;
}

/**
 * Substring/prefix search over icon names and keywords, ranked prefix >
 * word-boundary > substring, then default pack, then alphabetically. Mirrors
 * `searchItemIcons` in constants/itemIcons.ts.
 *
 * The default pack wins ties because an unscoped search spans every pack and
 * the others are Pro-only: without it, registry order (pack folders, alphabetical)
 * put `bold/meal` and `clay/meal` ahead of the free `meal`, so a free user's
 * first two hits both opened the paywall while the icon they could actually
 * use sat third.
 */
export function searchCategoryIcons(query: string, packId?: string): CategoryIconMeta[] {
  const pool = packId ? CATEGORY_ICONS.filter((icon) => icon.pack === packId) : CATEGORY_ICONS;
  const q = query.trim().toLowerCase();
  // Copy, so a caller sorting the result in place cannot reorder the registry.
  if (!q) return [...pool];

  const scored: { icon: CategoryIconMeta; score: number }[] = [];
  for (const icon of pool) {
    const name = icon.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q) || icon.concept.startsWith(q)) {
      score = 3;
    } else if (icon.keywords.includes(` ${q}`)) {
      score = 2;
    } else if (icon.keywords.includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ icon, score });
  }

  const packRank = (icon: CategoryIconMeta) => (icon.pack === DEFAULT_ICON_PACK_ID ? 0 : 1);
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      packRank(a.icon) - packRank(b.icon) ||
      a.icon.name.localeCompare(b.icon.name),
  );
  return scored.map((entry) => entry.icon);
}

/**
 * A representative emoji per icon CONCEPT, for the surfaces that cannot render a
 * bundled PNG: the native home-screen widgets and the Siri Shortcuts catalog
 * (both render a plain string), plus the human-facing Excel export.
 *
 * Keyed by concept rather than by id, so every pack's `meal` shares one entry
 * and a new pack only needs additions for concepts nothing ships yet.
 * Hand-authored rather than derived by inverting LEGACY_EMOJI_TO_ICON, which is
 * many-to-one and covers only half the set. A test asserts every concept in
 * CATEGORY_ICONS appears here, so adding artwork cannot silently blank a widget.
 */
export const ICON_NAME_TO_EMOJI: Record<string, string> = {
  // 2026 Clay expansion: widget / Shortcuts / export stand-ins for the eight
  // generated 5x5 sheets. Concepts already present in another pack reuse the
  // older entries below.
  'air-conditioner': '❄️',
  ambulance: '🚑',
  'american-football': '🏈',
  anniversary: '💝',
  apartment: '🏢',
  'art-class': '🎨',
  'baby-clothes': '👶',
  babysitting: '🤱',
  bandage: '🩹',
  barber: '💈',
  basketball: '🏀',
  binoculars: '🔭',
  birthday: '🎂',
  'board-game': '🎲',
  'book-club': '📖',
  bonds: '📜',
  bonus: '🎁',
  boots: '🥾',
  bread: '🍞',
  'budget-planner': '📊',
  'business-trip': '💼',
  'camping-tent': '⛺',
  cashback: '💳',
  certificate: '🎓',
  charity: '🤲',
  cheese: '🧀',
  cheque: '🧾',
  childcare: '🧸',
  children: '🧒',
  chocolate: '🍫',
  cinema: '🎬',
  'cleaning-spray': '🧴',
  community: '🫂',
  compass: '🧭',
  concert: '🎵',
  'contactless-payment': '💳',
  cookie: '🍪',
  'cooking-pot': '🍲',
  couple: '👫',
  coworking: '💻',
  crafting: '🧶',
  croissant: '🥐',
  'cruise-ship': '🛳️',
  'crypto-coin': '🪙',
  'currency-exchange': '💱',
  debt: '💳',
  'dentist-chair': '🦷',
  'diamond-ring': '💍',
  doctor: '🧑‍⚕️',
  'dog-walk': '🐕',
  donation: '🤲',
  doughnut: '🍩',
  'electric-car': '🚙',
  elderly: '🧓',
  email: '📧',
  'emergency-fund': '💖',
  'ev-charger': '🔌',
  'eye-care': '👁️',
  'family-group': '👪',
  ferry: '⛴️',
  'fire-extinguisher': '🧯',
  fish: '🐟',
  flowers: '💐',
  'french-fries': '🍟',
  freelance: '🧑‍💻',
  'fried-egg': '🍳',
  fruit: '🍎',
  'gaming-console': '🎮',
  'garden-trowel': '🌱',
  gardening: '🌻',
  'gas-flame': '🔥',
  globe: '🌍',
  'hair-dryer': '💨',
  'hair-salon': '✂️',
  hammock: '🏖️',
  hammer: '🔨',
  hat: '👒',
  'health-insurance': '🛡️',
  'hearing-aid': '🦻',
  helicopter: '🚁',
  'high-heels': '👠',
  'home-insurance': '🏠',
  hospital: '🏥',
  'hot-dog': '🌭',
  hotel: '🏨',
  'ice-cream': '🍦',
  interest: '💹',
  'investment-chart': '📈',
  jacket: '🧥',
  jeans: '👖',
  jewelry: '💎',
  juice: '🧃',
  landmark: '🏛️',
  'language-learning': '🗣️',
  'laundry-basket': '🧺',
  'location-pin': '📍',
  meditation: '🧘',
  meeting: '👥',
  'mental-health': '🧠',
  microwave: '🍚',
  milk: '🥛',
  'money-transfer': '💸',
  motorcycle: '🏍️',
  'moving-boxes': '📦',
  museum: '🏛️',
  'music-lesson': '🎹',
  'nail-polish': '💅',
  'office-chair': '🪑',
  'online-banking': '🏦',
  'online-course': '🧑‍🏫',
  'online-shopping': '🛒',
  'paint-roller': '🖼️',
  painting: '🎨',
  'parking-garage': '🅿️',
  pasta: '🍝',
  pen: '🖋️',
  pencil: '✏️',
  'personal-loan': '🤝',
  'pet-food': '🐾',
  perfume: '🧴',
  pharmacy: '⚕️',
  'phone-call': '📞',
  photography: '📷',
  pills: '💊',
  pizza: '🍕',
  'power-drill': '🛠️',
  presentation: '📊',
  'property-tax': '🧾',
  'protein-shaker': '🥤',
  puzzle: '🧩',
  'qr-payment': '📱',
  receipt: '🧾',
  'recycling-bin': '♻️',
  refrigerator: '🧊',
  refund: '↩️',
  'rental-car': '🚘',
  retirement: '🧓',
  'reusable-bag': '🛙️',
  'road-trip': '🗺️',
  'roast-chicken': '🍗',
  'rolling-luggage': '🧳',
  ruler: '📏',
  running: '🏃',
  sailboat: '⛵',
  salad: '🥗',
  salary: '💵',
  'savings-jar': '🪙',
  scarf: '🧣',
  school: '🏫',
  'science-lab': '🧪',
  signpost: '🪧',
  skis: '🎿',
  skincare: '🧴',
  sleep: '😴',
  smartphone: '📱',
  smartwatch: '⌚',
  socks: '🧦',
  'solar-panel': '☀️',
  soup: '🍲',
  spa: '💆',
  stationery: '✏️',
  steak: '🥩',
  stocks: '📈',
  subway: '🚇',
  'surgical-mask': '😷',
  swimming: '🏊',
  syringe: '💉',
  tablet: '📱',
  taco: '🌮',
  taxes: '🧾',
  tea: '🍵',
  television: '📺',
  tennis: '🎾',
  therapy: '💬',
  thermometer: '🌡️',
  'theme-park': '🎡',
  'time-clock': '🕒',
  'tip-jar': '🪙',
  'toll-booth': '🛣️',
  toolbox: '🧰',
  'toy-blocks': '🧱',
  tram: '🚊',
  'trash-bin': '🗑️',
  'travel-ticket': '🎫',
  university: '🎓',
  'utility-pole': '⚡',
  'vacuum-cleaner': '🧹',
  vegetables: '🥦',
  veterinarian: '🐈',
  vitamins: '💊',
  'washing-machine': '🧺',
  'water-bottle': '💧',
  wedding: '💍',
  'wifi-router': '📶',
  'work-calendar': '📅',
  computer: '🖥️',
  'film-slate': '🎬',
  folder: '📁',
  printer: '🖨️',
  puppy: '🐕',
  tap: '🚰',
  bear: '🐻',
  bento: '🍱',
  book: '📖',
  cake: '🍰',
  calculator: '🧮',
  checklist: '✅',
  cheeseburger: '🍔',
  football: '⚽',
  'heart-hands': '🫶',
  'hospital-bed': '🛏️',
  'id-card': '🪪',
  lamp: '💡',
  'medical-cart': '🏥',
  passport: '🛂',
  'picnic-basket': '🧺',
  'plush-bear': '🧸',
  popcorn: '🍿',
  refresh: '🔄',
  'rice-bowl': '🍚',
  safe: '🔐',
  sandwich: '🥪',
  'shopping-cart': '🛒',
  skateboard: '🛹',
  sundress: '👗',
  sunglasses: '🕶️',
  truck: '🚛',
  'vinyl-record': '💿',
  'water-drop': '💧',
  atm: '🏧',
  baby: '👶',
  backpack: '🎒',
  bed: '🛏️',
  bell: '🔔',
  bicycle: '🚲',
  'birthday-cake': '🎂',
  bookmark: '🔖',
  'bubble-tea': '🧋',
  burger: '🍔',
  'camera-vintage': '📸',
  clipboard: '📋',
  cupcake: '🧁',
  document: '📄',
  dots: '⋯',
  envelope: '✉️',
  'envelope-open': '📨',
  'first-aid': '🩹',
  glasses: '👓',
  handbag: '👜',
  'heart-pulse': '💓',
  'hiking-backpack': '🎒',
  magnifier: '🔍',
  map: '🗺️',
  'market-stall': '🏪',
  'medical-bag': '💼',
  meter: '⏱️',
  monitor: '🖥️',
  notebook: '📓',
  notification: '🔔',
  'office-building': '🏢',
  padlock: '🔒',
  pancakes: '🥞',
  parcel: '📦',
  pram: '🍼',
  purse: '👛',
  ramen: '🍜',
  'school-backpack': '🎒',
  scooter: '🛵',
  shield: '🛡️',
  star: '⭐',
  sushi: '🍣',
  taxi: '🚕',
  'teddy-bear': '🧸',
  toiletries: '🧴',
  tooth: '🦷',
  train: '🚆',
  trolley: '🛒',
  alcohol: '🍺',
  ballone: '🎉',
  balloon: '👶',
  bank: '🏦',
  beach: '🏖️',
  'bill-calendar': '📅',
  'boxing-gloves': '🥊',
  briefcase: '💼',
  bus: '🚌',
  camera: '📷',
  'camper-van': '🚐',
  car: '🚗',
  cash: '💰',
  cat: '🐱',
  'chess-knight': '♟️',
  clapperboard: '🎬',
  coffee: '☕',
  'coins-checkmark': '💰',
  'coins-euro': '💶',
  coins: '🪙',
  cosmetics: '💄',
  'credit-card': '💳',
  dog: '🐶',
  dress: '👗',
  dumbbell: '🏋️',
  faucet: '🚰',
  'game-controller': '🎮',
  'gas-pump': '⛽',
  gear: '⚙️',
  gift: '🎁',
  'globe-money': '💱',
  'globe-shield': '🛡️',
  'graduation-cap': '🎓',
  'grocery-basket': '🛒',
  headphone: '🎧',
  heart: '❤️',
  house: '🏠',
  invoice: '🧾',
  keys: '🔑',
  laptop: '💻',
  'light-bulb': '💡',
  meal: '🍔',
  medicine: '💊',
  mountain: '🏞️',
  'paw-print': '🐾',
  'piggy-bank': '🐷',
  plane: '✈️',
  'potted-plant': '🪴',
  'price-tag': '🏷️',
  'question-mark': '❓',
  'shopping-bag': '🛍️',
  sneaker: '👟',
  sofa: '🛋️',
  stethoscope: '🩺',
  't-shirt': '👕',
  target: '🎯',
  van: '🚚',
  wallet: '👛',
  warning: '⚠️',
  'work-bag': '🧳',
  wrench: '🔧',
  'yoga-mat': '🧘',
};

/**
 * Best-effort emoji for a stored icon value, for string-only surfaces. Returns
 * '' when nothing sensible exists, which every caller already renders as a
 * bullet. Uploaded images deliberately return '' rather than a wrong stand-in.
 */
/** Trailing segment of an icon id: `clay/meal` and `meal` both give `meal`. */
export function conceptOf(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? id : id.slice(slash + 1);
}

export function categoryIconToEmoji(value?: string | null): string {
  const classified = classifyCategoryIcon(value);
  switch (classified.kind) {
    case 'emoji':
      return classified.glyph;
    case 'bundled': {
      const concept = conceptOf(classified.id);
      return Object.prototype.hasOwnProperty.call(ICON_NAME_TO_EMOJI, concept)
        ? ICON_NAME_TO_EMOJI[concept]
        : '';
    }
    case 'custom':
    case 'none':
      return '';
  }
}
