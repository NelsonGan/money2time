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
  alcohol: { name: 'Drinks', keywords: 'beer wine bar pub alcohol night out' },
  atm: { name: 'ATM', keywords: 'cash machine withdrawal bank card' },
  baby: { keywords: 'child infant newborn kid nursery childcare' },
  backpack: { keywords: 'rucksack bag hiking travel' },
  ballone: { name: 'Party', keywords: 'balloon celebration birthday event festive' },
  balloon: { name: 'Baby', keywords: 'child kid infant nursery childcare' },
  bank: { keywords: 'savings deposit branch finance' },
  beach: { keywords: 'holiday vacation summer sea resort' },
  bear: { keywords: 'animal wildlife zoo grizzly' },
  bed: { keywords: 'bedroom sleep furniture mattress hotel' },
  bell: { keywords: 'notification alert reminder ring' },
  bento: { keywords: 'lunch box japanese meal food' },
  bicycle: { keywords: 'bike cycling commute' },
  'bill-calendar': { name: 'Recurring bill', keywords: 'subscription monthly due schedule' },
  'birthday-cake': {
    name: 'Birthday cake',
    keywords: 'party celebration candles anniversary dessert',
  },
  book: { keywords: 'reading library study literature' },
  bookmark: { keywords: 'save tag label ribbon' },
  'boxing-gloves': { name: 'Boxing', keywords: 'gym sport martial arts training' },
  briefcase: { name: 'Work', keywords: 'business job office professional' },
  'bubble-tea': { name: 'Bubble tea', keywords: 'boba milk tea drink pearl' },
  burger: { keywords: 'fast food hamburger takeaway' },
  bus: { keywords: 'transit public transport commute' },
  cake: { keywords: 'dessert sweet bakery slice pastry' },
  calculator: { keywords: 'maths accounting numbers finance' },
  camera: { name: 'Camera', keywords: 'photo photography gear hobby' },
  'camera-vintage': { name: 'Vintage camera', keywords: 'photo retro film photography' },
  'camper-van': { name: 'Camper van', keywords: 'rv road trip motorhome' },
  car: { keywords: 'vehicle auto drive taxi parking' },
  cash: { name: 'Cash', keywords: 'money banknote salary income paycheck' },
  cat: { keywords: 'pet kitten animal vet' },
  checklist: { name: 'Checklist', keywords: 'todo tasks tick done form survey approved' },
  cheeseburger: { keywords: 'burger fast food takeaway' },
  'chess-knight': { name: 'Games', keywords: 'chess board game hobby club' },
  clapperboard: { name: 'Movies', keywords: 'cinema film streaming entertainment' },
  clipboard: { keywords: 'form document notes board attach' },
  coffee: { keywords: 'cafe tea espresso latte drink' },
  coins: { keywords: 'money savings change investment' },
  'coins-checkmark': { name: 'Coins paid', keywords: 'money settled cleared approved' },
  'coins-euro': { name: 'Euro coins', keywords: 'money currency europe' },
  computer: { keywords: 'desktop pc monitor workstation' },
  cosmetics: { name: 'Beauty', keywords: 'makeup skincare salon grooming' },
  'credit-card': { keywords: 'debit payment card bank' },
  cupcake: { keywords: 'muffin dessert sweet bakery' },
  document: { keywords: 'file paper page doc letter contract statement' },
  dog: { keywords: 'pet puppy animal vet walking' },
  dots: { name: 'More', keywords: 'ellipsis menu other misc' },
  dress: { keywords: 'clothes clothing fashion apparel' },
  dumbbell: { name: 'Gym', keywords: 'fitness workout weights exercise' },
  envelope: { keywords: 'mail letter post message bill' },
  'envelope-open': { name: 'Open envelope', keywords: 'mail letter read post opened' },
  faucet: { name: 'Water', keywords: 'tap plumbing utility bill' },
  'film-slate': { name: 'Film slate', keywords: 'movie cinema clapper video' },
  'first-aid': { name: 'First aid', keywords: 'medical kit emergency bandage health' },
  folder: { keywords: 'files documents directory archive' },
  football: { keywords: 'soccer sport ball game' },
  'game-controller': { name: 'Gaming', keywords: 'video games console esports' },
  'gas-pump': { name: 'Fuel', keywords: 'petrol gas diesel charging station' },
  gear: { name: 'Services', keywords: 'settings utilities admin fees tools' },
  gift: { name: 'Gifts', keywords: 'present birthday wedding celebration' },
  glasses: { keywords: 'eyewear spectacles optician vision eyes' },
  'globe-money': {
    name: 'Foreign currency',
    keywords: 'exchange forex international remittance abroad',
  },
  'globe-shield': { name: 'Insurance', keywords: 'protection cover policy security travel' },
  'graduation-cap': { name: 'Education', keywords: 'school university tuition course study books' },
  'grocery-basket': { name: 'Groceries', keywords: 'supermarket market shopping produce food' },
  handbag: { keywords: 'purse bag fashion accessory' },
  headphone: { name: 'Music', keywords: 'audio headphones streaming podcast' },
  heart: { name: 'Wellbeing', keywords: 'love health self care charity donation' },
  'heart-hands': { name: 'Care', keywords: 'love charity donation kindness giving hands' },
  'heart-pulse': { name: 'Heart rate', keywords: 'health pulse cardio ecg fitness' },
  'hiking-backpack': {
    name: 'Hiking pack',
    keywords: 'rucksack backpack trekking outdoors camping',
  },
  'hospital-bed': { name: 'Hospital', keywords: 'bed clinic ward patient medical' },
  house: { name: 'Home', keywords: 'rent mortgage housing property apartment' },
  'id-card': { name: 'ID badge', keywords: 'identity pass lanyard employee work' },
  invoice: { keywords: 'bill receipt statement tax payment due' },
  keys: { keywords: 'rent deposit lock house move in' },
  lamp: { keywords: 'light bulb lighting electricity' },
  laptop: { name: 'Tech', keywords: 'computer electronics software phone gadget' },
  'light-bulb': { name: 'Electricity', keywords: 'power utility bill energy lighting' },
  magnifier: { name: 'Search', keywords: 'find magnify look zoom' },
  map: { keywords: 'location navigation directions pin travel' },
  'market-stall': { name: 'Market', keywords: 'stall shop store vendor bazaar' },
  meal: { name: 'Meal', keywords: 'food dining restaurant lunch dinner eating out' },
  'medical-bag': { name: 'Medical bag', keywords: 'doctor kit first aid emergency' },
  'medical-cart': { name: 'Medical cart', keywords: 'hospital equipment trolley clinic' },
  medicine: { keywords: 'pharmacy pills prescription drugs vitamins' },
  meter: { keywords: 'gauge utility electricity water reading dial usage' },
  mountain: { name: 'Sightseeing', keywords: 'mountain hiking nature outdoors scenery photo' },
  notebook: { keywords: 'notes journal diary writing' },
  notification: { keywords: 'bell alert reminder alarm' },
  'office-building': { name: 'Office', keywords: 'building work corporate company' },
  padlock: { name: 'Lock', keywords: 'security private locked password' },
  pancakes: { keywords: 'breakfast brunch syrup stack sweet' },
  parcel: { keywords: 'package delivery box shipping post' },
  passport: { keywords: 'travel document visa immigration border' },
  'paw-print': { name: 'Pets', keywords: 'animal vet grooming pet food' },
  'picnic-basket': { name: 'Picnic', keywords: 'hamper basket outdoors food' },
  'piggy-bank': { keywords: 'savings goal save nest egg' },
  plane: { name: 'Flight', keywords: 'airline airfare airport travel' },
  'plush-bear': { name: 'Plush bear', keywords: 'toy teddy soft stuffed kids' },
  popcorn: { keywords: 'cinema movie snack' },
  'potted-plant': { name: 'Plants', keywords: 'garden gardening flowers greenery' },
  pram: { keywords: 'stroller buggy pushchair baby child' },
  'price-tag': { name: 'Sale', keywords: 'discount price tag deal offer' },
  printer: { keywords: 'print scanner office paper' },
  puppy: { keywords: 'dog pet animal vet' },
  purse: { keywords: 'wallet coin money pouch' },
  'question-mark': { name: 'Uncategorized', keywords: 'unknown misc other question' },
  ramen: { keywords: 'noodles soup japanese bowl food' },
  refresh: { name: 'Recurring', keywords: 'subscription renew cycle repeat auto arrows monthly' },
  'rice-bowl': { name: 'Rice bowl', keywords: 'donburi asian meal food' },
  safe: { keywords: 'vault security deposit savings lock' },
  sandwich: { keywords: 'sub lunch bread deli' },
  'school-backpack': { name: 'School bag', keywords: 'backpack rucksack student education kids' },
  scooter: { keywords: 'moped motorbike delivery vespa' },
  shield: { keywords: 'insurance protection security guard cover safety' },
  'shopping-bag': { name: 'Shopping', keywords: 'retail purchase mall store' },
  'shopping-cart': { name: 'Cart', keywords: 'trolley basket supermarket checkout' },
  skateboard: { keywords: 'skate sport board' },
  sneaker: { name: 'Shoes', keywords: 'sneakers footwear trainers running' },
  sofa: { name: 'Furniture', keywords: 'couch home decor living room' },
  star: { keywords: 'favourite rating special highlight' },
  stethoscope: { name: 'Healthcare', keywords: 'doctor hospital clinic medical dentist' },
  sundress: { keywords: 'dress clothes summer fashion' },
  sunglasses: { keywords: 'shades eyewear summer beach' },
  sushi: { keywords: 'japanese fish rice roll' },
  't-shirt': { name: 'T-shirt', keywords: 'clothes clothing casual apparel' },
  tap: { keywords: 'faucet water plumbing sink utility' },
  target: { name: 'Goal', keywords: 'target savings goal aim objective' },
  taxi: { keywords: 'cab ride hail fare' },
  'teddy-bear': { name: 'Teddy bear', keywords: 'toy plush soft kids gift' },
  toiletries: { keywords: 'bathroom soap shampoo hygiene' },
  tooth: { keywords: 'dentist dental teeth molar' },
  train: { keywords: 'rail metro subway commute station' },
  trolley: { keywords: 'cart shopping supermarket basket' },
  truck: { keywords: 'lorry delivery freight cargo' },
  van: { keywords: 'delivery moving cargo vehicle' },
  'vinyl-record': { name: 'Vinyl record', keywords: 'music album lp record player' },
  wallet: { keywords: 'money cash purse pocket' },
  warning: { name: 'Overdue', keywords: 'alert late penalty fee attention' },
  'water-drop': { name: 'Water drop', keywords: 'liquid plumbing rain utility bill' },
  'work-bag': { name: 'Suitcase', keywords: 'luggage baggage trip travel packing' },
  wrench: { name: 'Repairs', keywords: 'tools maintenance fix diy handyman' },
  'yoga-mat': { name: 'Yoga', keywords: 'pilates stretching wellness exercise' },
};
