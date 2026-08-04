import type { ImageSourcePropType } from 'react-native';

import { CLAY_ICON_SOURCES } from './clayIcons.generated';

/**
 * Finance illustrations for the insights type selector, keyed by the names
 * `INSIGHT_TYPE_ICON_NAME` uses.
 *
 * These are the clay set (`assets/clay-icons/insights/`), which replaced the
 * flat `assets/utility-icons/` art one-for-one. The indirection stays so the
 * insight-type map keeps reading as a plain concept name rather than a
 * clay-icon path, and so a future re-art swap touches only this file.
 */
export const UTILITY_ICON_SOURCES: Record<string, ImageSourcePropType> = {
  'growth-analysis': CLAY_ICON_SOURCES['insights/growth-analysis'],
  'home-savings': CLAY_ICON_SOURCES['insights/home-savings'],
  'market-analysis': CLAY_ICON_SOURCES['insights/market-analysis'],
  'money-bags': CLAY_ICON_SOURCES['insights/money-bags'],
  'mood-faces': CLAY_ICON_SOURCES['insights/mood-faces'],
  'pie-chart': CLAY_ICON_SOURCES['insights/pie-chart'],
  'piggy-bank-coins': CLAY_ICON_SOURCES['insights/piggy-bank-coins'],
  'profit-analysis': CLAY_ICON_SOURCES['insights/profit-analysis'],
  'property-listing': CLAY_ICON_SOURCES['insights/property-listing'],
  'revenue-growth': CLAY_ICON_SOURCES['insights/revenue-growth'],
  'time-money': CLAY_ICON_SOURCES['insights/time-money'],
  'wallet-cash': CLAY_ICON_SOURCES['insights/wallet-cash'],
  'wallet-cash-blue': CLAY_ICON_SOURCES['insights/wallet-cash-blue'],
};
