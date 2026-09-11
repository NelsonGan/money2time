export const RICECAL_APP_STORE_URL =
  'https://apps.apple.com/app/ricecal-asia-calorie-tracker/id6795558595';
export const RICECAL_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nelsongan.ricecal';
export const RICECAL_DOWNLOAD_URL = 'https://ricecal.app/download';

/** Pick the live RiceCal listing for this device, with the website as a safe web fallback. */
export function riceCalStoreUrl(platformOS: string): string {
  if (platformOS === 'ios') return RICECAL_APP_STORE_URL;
  if (platformOS === 'android') return RICECAL_PLAY_STORE_URL;
  return RICECAL_DOWNLOAD_URL;
}
