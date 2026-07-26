/**
 * Section + search metadata for the bundled hand-drawn category icons.
 *
 * Hand-maintained on purpose: the grouping comes from what each PNG actually
 * depicts, which a filename cannot always tell you. Several ids are historical
 * and do not describe their artwork, so the `name` here (not the slug) is what
 * the picker shows:
 *
 *   - `ballone`     a red balloon with a party hat, i.e. a celebration
 *   - `balloon`     a baby wrapped in a blanket, i.e. the baby/nursery icon
 *   - `work-bag`    a stickered travel suitcase, not a briefcase
 *   - `mountain`    a camera in front of a mountain, i.e. sightseeing
 *   - `price-tag`   a red sale tag
 *
 * `__tests__/constants/categoryIcons.test.ts` fails if a PNG in
 * assets/category-icons/ is missing an entry here, so adding artwork forces a
 * deliberate grouping decision rather than silently landing in a catch-all.
 *
 * Adding another icon style later (a second pack) means adding a pack folder
 * and its own metadata file; stored values are bare ids, so packs share one
 * flat id namespace and must not collide.
 */

/** Section ids. Display labels are i18n keys (`category_icon.group_<id>`). */
export const CATEGORY_ICON_GROUPS = [
  'money',
  'food',
  'transport',
  'travel',
  'home',
  'bills',
  'shopping',
  'health',
  'leisure',
  'work',
  'family',
  'other',
] as const;

export type CategoryIconGroup = (typeof CATEGORY_ICON_GROUPS)[number];

export interface CategoryIconGroupEntry {
  group: CategoryIconGroup;
  /** Display name. Overrides the title-cased slug when the slug misleads. */
  name?: string;
  /** Extra space-separated search terms beyond the display name. */
  keywords?: string;
}

export const CATEGORY_ICON_METADATA: Record<string, CategoryIconGroupEntry> = {
  // Money and banking
  bank: { group: 'money', keywords: 'savings deposit branch finance' },
  cash: { group: 'money', name: 'Cash', keywords: 'money banknote salary income paycheck' },
  coins: { group: 'money', keywords: 'money savings change investment' },
  'coins-checkmark': {
    group: 'money',
    name: 'Coins paid',
    keywords: 'money settled cleared approved',
  },
  'coins-euro': { group: 'money', name: 'Euro coins', keywords: 'money currency europe' },
  'credit-card': { group: 'money', keywords: 'debit payment card bank' },
  'globe-money': {
    group: 'money',
    name: 'Foreign currency',
    keywords: 'exchange forex international remittance abroad',
  },
  'globe-shield': {
    group: 'money',
    name: 'Insurance',
    keywords: 'protection cover policy security travel',
  },
  'piggy-bank': { group: 'money', keywords: 'savings goal save nest egg' },
  wallet: { group: 'money', keywords: 'money cash purse pocket' },

  // Food and drink
  alcohol: { group: 'food', name: 'Drinks', keywords: 'beer wine bar pub alcohol night out' },
  coffee: { group: 'food', keywords: 'cafe tea espresso latte drink' },
  'grocery-basket': {
    group: 'food',
    name: 'Groceries',
    keywords: 'supermarket market shopping produce food',
  },
  meal: { group: 'food', name: 'Meal', keywords: 'food dining restaurant lunch dinner eating out' },

  // Transport
  bus: { group: 'transport', keywords: 'transit public transport commute' },
  'camper-van': { group: 'transport', name: 'Camper van', keywords: 'rv road trip motorhome' },
  car: { group: 'transport', keywords: 'vehicle auto drive taxi parking' },
  'gas-pump': { group: 'transport', name: 'Fuel', keywords: 'petrol gas diesel charging station' },
  plane: { group: 'transport', name: 'Flight', keywords: 'airline airfare airport travel' },
  van: { group: 'transport', keywords: 'delivery moving cargo vehicle' },

  // Travel and outdoors
  beach: { group: 'travel', keywords: 'holiday vacation summer sea resort' },
  camera: { group: 'travel', name: 'Camera', keywords: 'photo photography gear hobby' },
  mountain: {
    group: 'travel',
    name: 'Sightseeing',
    keywords: 'mountain hiking nature outdoors scenery photo',
  },
  'work-bag': {
    group: 'travel',
    name: 'Suitcase',
    keywords: 'luggage baggage trip travel packing',
  },

  // Home and utilities
  faucet: { group: 'home', name: 'Water', keywords: 'tap plumbing utility bill' },
  house: { group: 'home', name: 'Home', keywords: 'rent mortgage housing property apartment' },
  keys: { group: 'home', keywords: 'rent deposit lock house move in' },
  'light-bulb': {
    group: 'home',
    name: 'Electricity',
    keywords: 'power utility bill energy lighting',
  },
  'potted-plant': { group: 'home', name: 'Plants', keywords: 'garden gardening flowers greenery' },
  sofa: { group: 'home', name: 'Furniture', keywords: 'couch home decor living room' },
  wrench: { group: 'home', name: 'Repairs', keywords: 'tools maintenance fix diy handyman' },

  // Bills and admin
  'bill-calendar': {
    group: 'bills',
    name: 'Recurring bill',
    keywords: 'subscription monthly due schedule',
  },
  invoice: { group: 'bills', keywords: 'bill receipt statement tax payment due' },
  warning: { group: 'bills', name: 'Overdue', keywords: 'alert late penalty fee attention' },

  // Shopping and style
  cosmetics: { group: 'shopping', name: 'Beauty', keywords: 'makeup skincare salon grooming' },
  dress: { group: 'shopping', keywords: 'clothes clothing fashion apparel' },
  'price-tag': { group: 'shopping', name: 'Sale', keywords: 'discount price tag deal offer' },
  'shopping-bag': { group: 'shopping', name: 'Shopping', keywords: 'retail purchase mall store' },
  sneaker: { group: 'shopping', name: 'Shoes', keywords: 'sneakers footwear trainers running' },
  't-shirt': { group: 'shopping', name: 'T-shirt', keywords: 'clothes clothing casual apparel' },

  // Health and fitness
  'boxing-gloves': { group: 'health', name: 'Boxing', keywords: 'gym sport martial arts training' },
  dumbbell: { group: 'health', name: 'Gym', keywords: 'fitness workout weights exercise' },
  heart: { group: 'health', name: 'Wellbeing', keywords: 'love health self care charity donation' },
  medicine: { group: 'health', keywords: 'pharmacy pills prescription drugs vitamins' },
  stethoscope: {
    group: 'health',
    name: 'Healthcare',
    keywords: 'doctor hospital clinic medical dentist',
  },
  'yoga-mat': { group: 'health', name: 'Yoga', keywords: 'pilates stretching wellness exercise' },

  // Leisure and entertainment
  'chess-knight': { group: 'leisure', name: 'Games', keywords: 'chess board game hobby club' },
  clapperboard: {
    group: 'leisure',
    name: 'Movies',
    keywords: 'cinema film streaming entertainment',
  },
  'game-controller': { group: 'leisure', name: 'Gaming', keywords: 'video games console esports' },
  gift: { group: 'leisure', name: 'Gifts', keywords: 'present birthday wedding celebration' },
  headphone: { group: 'leisure', name: 'Music', keywords: 'audio headphones streaming podcast' },
  ballone: {
    group: 'leisure',
    name: 'Party',
    keywords: 'balloon celebration birthday event festive',
  },

  // Work and study
  briefcase: { group: 'work', name: 'Work', keywords: 'business job office professional' },
  gear: { group: 'work', name: 'Services', keywords: 'settings utilities admin fees tools' },
  'graduation-cap': {
    group: 'work',
    name: 'Education',
    keywords: 'school university tuition course study books',
  },
  laptop: { group: 'work', name: 'Tech', keywords: 'computer electronics software phone gadget' },

  // Family and pets
  balloon: { group: 'family', name: 'Baby', keywords: 'child kid infant nursery childcare' },
  cat: { group: 'family', keywords: 'pet kitten animal vet' },
  dog: { group: 'family', keywords: 'pet puppy animal vet walking' },
  'paw-print': { group: 'family', name: 'Pets', keywords: 'animal vet grooming pet food' },

  // Other
  'question-mark': {
    group: 'other',
    name: 'Uncategorized',
    keywords: 'unknown misc other question',
  },
  target: { group: 'other', name: 'Goal', keywords: 'target savings goal aim objective' },
};
