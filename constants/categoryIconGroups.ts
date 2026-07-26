/**
 * Display names, search keywords and section order for the bundled icon packs.
 *
 * Sections themselves come from the folder layout under assets/icon-packs/, not
 * from here: a group is whatever folder an icon sits in. What a folder cannot
 * carry is a readable name for artwork whose filename lies, or the search terms
 * someone would actually type, so those stay hand-maintained.
 *
 * Several ids are historical and do not describe their artwork, which is why
 * the picker shows `name` rather than the slug:
 *
 *   - `ballone`     a red balloon with a party hat, i.e. a celebration
 *   - `balloon`     a baby wrapped in a blanket, i.e. the baby/nursery icon
 *   - `work-bag`    a stickered travel suitcase, not a briefcase
 *   - `mountain`    a camera in front of a mountain, i.e. sightseeing
 *   - `price-tag`   a red sale tag
 *
 * An icon with no entry falls back to its title-cased id, which is fine for a
 * self-describing filename. `__tests__/constants/categoryIcons.test.ts` still
 * fails if a section folder has no i18n label, since an unlabelled section
 * header would ship as a raw key.
 */

/**
 * Section order in the picker, by group id (the slugified folder name).
 * Editorial rather than alphabetical: money and everyday spend lead. Groups
 * missing from this list are appended alphabetically, so a new folder shows up
 * without needing a change here.
 */
export const CATEGORY_ICON_GROUP_ORDER = [
  'money',
  'food-and-drink',
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

export interface CategoryIconMetaEntry {
  /** Display name. Overrides the title-cased id when the id misleads. */
  name?: string;
  /** Extra space-separated search terms beyond the display name. */
  keywords?: string;
}

export const CATEGORY_ICON_METADATA: Record<string, CategoryIconMetaEntry> = {
  bank: { keywords: 'savings deposit branch finance' },
  cash: { name: 'Cash', keywords: 'money banknote salary income paycheck' },
  coins: { keywords: 'money savings change investment' },
  'coins-checkmark': { name: 'Coins paid', keywords: 'money settled cleared approved' },
  'coins-euro': { name: 'Euro coins', keywords: 'money currency europe' },
  'credit-card': { keywords: 'debit payment card bank' },
  'globe-money': {
    name: 'Foreign currency',
    keywords: 'exchange forex international remittance abroad',
  },
  'globe-shield': { name: 'Insurance', keywords: 'protection cover policy security travel' },
  'piggy-bank': { keywords: 'savings goal save nest egg' },
  wallet: { keywords: 'money cash purse pocket' },
  alcohol: { name: 'Drinks', keywords: 'beer wine bar pub alcohol night out' },
  coffee: { keywords: 'cafe tea espresso latte drink' },
  'grocery-basket': { name: 'Groceries', keywords: 'supermarket market shopping produce food' },
  meal: { name: 'Meal', keywords: 'food dining restaurant lunch dinner eating out' },
  bus: { keywords: 'transit public transport commute' },
  'camper-van': { name: 'Camper van', keywords: 'rv road trip motorhome' },
  car: { keywords: 'vehicle auto drive taxi parking' },
  'gas-pump': { name: 'Fuel', keywords: 'petrol gas diesel charging station' },
  plane: { name: 'Flight', keywords: 'airline airfare airport travel' },
  van: { keywords: 'delivery moving cargo vehicle' },
  beach: { keywords: 'holiday vacation summer sea resort' },
  camera: { name: 'Camera', keywords: 'photo photography gear hobby' },
  mountain: { name: 'Sightseeing', keywords: 'mountain hiking nature outdoors scenery photo' },
  'work-bag': { name: 'Suitcase', keywords: 'luggage baggage trip travel packing' },
  faucet: { name: 'Water', keywords: 'tap plumbing utility bill' },
  house: { name: 'Home', keywords: 'rent mortgage housing property apartment' },
  keys: { keywords: 'rent deposit lock house move in' },
  'light-bulb': { name: 'Electricity', keywords: 'power utility bill energy lighting' },
  'potted-plant': { name: 'Plants', keywords: 'garden gardening flowers greenery' },
  sofa: { name: 'Furniture', keywords: 'couch home decor living room' },
  wrench: { name: 'Repairs', keywords: 'tools maintenance fix diy handyman' },
  'bill-calendar': { name: 'Recurring bill', keywords: 'subscription monthly due schedule' },
  invoice: { keywords: 'bill receipt statement tax payment due' },
  warning: { name: 'Overdue', keywords: 'alert late penalty fee attention' },
  cosmetics: { name: 'Beauty', keywords: 'makeup skincare salon grooming' },
  dress: { keywords: 'clothes clothing fashion apparel' },
  'price-tag': { name: 'Sale', keywords: 'discount price tag deal offer' },
  'shopping-bag': { name: 'Shopping', keywords: 'retail purchase mall store' },
  sneaker: { name: 'Shoes', keywords: 'sneakers footwear trainers running' },
  't-shirt': { name: 'T-shirt', keywords: 'clothes clothing casual apparel' },
  'boxing-gloves': { name: 'Boxing', keywords: 'gym sport martial arts training' },
  dumbbell: { name: 'Gym', keywords: 'fitness workout weights exercise' },
  heart: { name: 'Wellbeing', keywords: 'love health self care charity donation' },
  medicine: { keywords: 'pharmacy pills prescription drugs vitamins' },
  stethoscope: { name: 'Healthcare', keywords: 'doctor hospital clinic medical dentist' },
  'yoga-mat': { name: 'Yoga', keywords: 'pilates stretching wellness exercise' },
  'chess-knight': { name: 'Games', keywords: 'chess board game hobby club' },
  clapperboard: { name: 'Movies', keywords: 'cinema film streaming entertainment' },
  'game-controller': { name: 'Gaming', keywords: 'video games console esports' },
  gift: { name: 'Gifts', keywords: 'present birthday wedding celebration' },
  headphone: { name: 'Music', keywords: 'audio headphones streaming podcast' },
  ballone: { name: 'Party', keywords: 'balloon celebration birthday event festive' },
  briefcase: { name: 'Work', keywords: 'business job office professional' },
  gear: { name: 'Services', keywords: 'settings utilities admin fees tools' },
  'graduation-cap': { name: 'Education', keywords: 'school university tuition course study books' },
  laptop: { name: 'Tech', keywords: 'computer electronics software phone gadget' },
  balloon: { name: 'Baby', keywords: 'child kid infant nursery childcare' },
  cat: { keywords: 'pet kitten animal vet' },
  dog: { keywords: 'pet puppy animal vet walking' },
  'paw-print': { name: 'Pets', keywords: 'animal vet grooming pet food' },
  'question-mark': { name: 'Uncategorized', keywords: 'unknown misc other question' },
  target: { name: 'Goal', keywords: 'target savings goal aim objective' },
};
