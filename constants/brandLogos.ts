import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled brand app-icon logos, downloaded from Brandfetch into
 * assets/brands/social. Used by the onboarding "Where did you hear about us?"
 * step and the Share & Earn screen. Refresh with scripts/fetch-brand-logos.mjs.
 *
 * Each image is a self-contained square app icon (its own background), so it
 * renders edge-to-edge inside a rounded tile.
 */
export const BRAND_LOGOS = {
  instagram: require('../assets/brands/social/instagram.png'),
  tiktok: require('../assets/brands/social/tiktok.jpg'),
  reddit: require('../assets/brands/social/reddit.jpg'),
  facebook: require('../assets/brands/social/facebook.png'),
  threads: require('../assets/brands/social/threads.jpg'),
  x: require('../assets/brands/social/x.jpg'),
  appstore: require('../assets/brands/social/appstore.jpg'),
  googleplay: require('../assets/brands/social/googleplay.png'),
  xiaohongshu: require('../assets/brands/social/xiaohongshu.png'),
} satisfies Record<string, ImageSourcePropType>;

export type BrandLogoKey = keyof typeof BRAND_LOGOS;

/**
 * Realbyte's Money Manager app icon, shown on the ".mmbak" import row so the
 * option is recognizable to users migrating from that app. Same edge-to-edge
 * square-icon shape as BRAND_LOGOS above.
 */
export const MONEY_MANAGER_LOGO: ImageSourcePropType = require('../assets/brands/money-manager-realbyte-logo.png');

/**
 * Our own app icon, used on the Data Management rows that read and write the
 * Money2Time backup format so they are recognizable as "ours" next to the
 * third-party formats. Full-bleed square, like the logos above; downscaled from
 * assets/ios/AppIcon~ios-marketing.png.
 */
export const MONEY2TIME_LOGO: ImageSourcePropType = require('../assets/brands/money2time-app-icon.png');

/**
 * Microsoft Excel's document mark, shown on the spreadsheet export row.
 *
 * Unlike the logos above this is a transparent glyph rather than a square app
 * icon, so it renders at icon size inside the tinted tile instead of filling
 * it. Rasterized from vscode-icons' `file_type_excel.svg` (MIT).
 */
export const EXCEL_LOGO: ImageSourcePropType = require('../assets/brands/microsoft-excel-logo.png');
