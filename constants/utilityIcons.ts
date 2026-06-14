import type { ImageSourcePropType } from 'react-native';

// Hand-drawn finance/utility illustrations used for the insights type selector.
// Keyed by icon name (filename without extension) in assets/utility-icons/.
export const UTILITY_ICON_SOURCES: Record<string, ImageSourcePropType> = {
  'growth-analysis': require('../assets/utility-icons/growth-analysis.png'),
  'home-savings': require('../assets/utility-icons/home-savings.png'),
  'market-analysis': require('../assets/utility-icons/market-analysis.png'),
  'money-bags': require('../assets/utility-icons/money-bags.png'),
  'mood-faces': require('../assets/utility-icons/mood-faces.png'),
  'pie-chart': require('../assets/utility-icons/pie-chart.png'),
  'piggy-bank-coins': require('../assets/utility-icons/piggy-bank-coins.png'),
  'profit-analysis': require('../assets/utility-icons/profit-analysis.png'),
  'property-listing': require('../assets/utility-icons/property-listing.png'),
  'revenue-growth': require('../assets/utility-icons/revenue-growth.png'),
  'time-money': require('../assets/utility-icons/time-money.png'),
  'wallet-cash': require('../assets/utility-icons/wallet-cash.png'),
  'wallet-cash-blue': require('../assets/utility-icons/wallet-cash-blue.png'),
};
