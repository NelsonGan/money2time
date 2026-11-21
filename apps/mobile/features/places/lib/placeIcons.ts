import {
  BedDouble,
  Building2,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Landmark,
  type LucideIcon,
  MapPin,
  Pill,
  Plane,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  SquareParking,
  Stethoscope,
  TrainFront,
  Trees,
  Utensils,
  Wine,
} from 'lucide-react-native';

import type { NearbyCategory } from './placeTypes';

/**
 * A place's icon in both icon styles: the clay art from the bundled category
 * pack (the default style) and the Lucide line icon for flat icons.
 */
export interface PlaceIconSpec {
  flat: LucideIcon;
  /** A bundled category icon id (`assets/icon-packs/default`). */
  clay: string;
}

const PIN: PlaceIconSpec = { flat: MapPin, clay: 'location-pin' };

// Apple's PoiCategory values (README: Transaction locations) grouped onto the
// app's icons. Anything unlisted, and a spot with no category, is a pin.
const ICON_BY_CATEGORY: Record<string, PlaceIconSpec> = {
  Cafe: { flat: Coffee, clay: 'coffee' },
  Bakery: { flat: Coffee, clay: 'bread' },
  Restaurant: { flat: Utensils, clay: 'meal' },
  Brewery: { flat: Wine, clay: 'alcohol' },
  Winery: { flat: Wine, clay: 'alcohol' },
  Distillery: { flat: Wine, clay: 'alcohol' },
  Nightlife: { flat: Wine, clay: 'alcohol' },
  FoodMarket: { flat: ShoppingBasket, clay: 'grocery-basket' },
  Store: { flat: ShoppingBag, clay: 'shopping-bag' },
  Beauty: { flat: Scissors, clay: 'hair-salon' },
  GasStation: { flat: Fuel, clay: 'gas-pump' },
  EVCharger: { flat: Fuel, clay: 'ev-charger' },
  AutomotiveRepair: { flat: Fuel, clay: 'wrench' },
  Hotel: { flat: BedDouble, clay: 'hotel' },
  Airport: { flat: Plane, clay: 'plane' },
  AirportGate: { flat: Plane, clay: 'plane' },
  AirportTerminal: { flat: Plane, clay: 'plane' },
  PublicTransport: { flat: TrainFront, clay: 'train' },
  Parking: { flat: SquareParking, clay: 'parking-garage' },
  Pharmacy: { flat: Pill, clay: 'pharmacy' },
  Hospital: { flat: Stethoscope, clay: 'hospital' },
  Bank: { flat: Landmark, clay: 'bank' },
  ATM: { flat: Landmark, clay: 'atm' },
  MovieTheater: { flat: Film, clay: 'cinema' },
  Theater: { flat: Film, clay: 'clapperboard' },
  MusicVenue: { flat: Film, clay: 'concert' },
  FitnessCenter: { flat: Dumbbell, clay: 'dumbbell' },
  Park: { flat: Trees, clay: 'hammock' },
  NationalPark: { flat: Trees, clay: 'mountain' },
  Beach: { flat: Trees, clay: 'beach' },
  Museum: { flat: Building2, clay: 'museum' },
  University: { flat: Building2, clay: 'university' },
  School: { flat: Building2, clay: 'school' },
  Library: { flat: Building2, clay: 'book' },
};

export function placeCategoryIcon(category: string | null | undefined): PlaceIconSpec {
  // Own keys only: the category is synced data, and "constructor" is not an icon.
  return category && Object.hasOwn(ICON_BY_CATEGORY, category)
    ? (ICON_BY_CATEGORY[category] as PlaceIconSpec)
    : PIN;
}

/** The location picker's category chips. */
export const NEARBY_CHIP_ICONS: Record<Exclude<NearbyCategory, 'all'>, PlaceIconSpec> = {
  food: { flat: Utensils, clay: 'meal' },
  coffee: { flat: Coffee, clay: 'coffee' },
  groceries: { flat: ShoppingBasket, clay: 'grocery-basket' },
  shopping: { flat: ShoppingBag, clay: 'shopping-bag' },
  fuel: { flat: Fuel, clay: 'gas-pump' },
  transport: { flat: TrainFront, clay: 'train' },
  health: { flat: Pill, clay: 'pharmacy' },
};
