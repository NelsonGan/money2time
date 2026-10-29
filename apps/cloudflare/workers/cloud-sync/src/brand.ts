// The Money2Time look for the little this Worker shows people: the invite
// page (pages.ts) and the sign-in code email (email.ts).
//
// Every value is money2time-web's (src/app/globals.css, which ports the app's
// `rosewood` theme from apps/mobile/constants/designSystem.ts), and the dark
// values are that theme's dark palette in the app, since the site has none.
// Change them there first and copy them here, never the other way round.

export const LIGHT = {
  background: '#FCFAF5',
  card: '#FFFFFF',
  surfaceMuted: '#F2EFE7',
  border: '#E4DFD1',
  foreground: '#1A2E2A',
  foregroundSoft: '#6B7A77',
  foregroundMuted: '#94A39F',
  primary: '#B1525F',
  primaryDark: '#8E4250',
  primarySoft: '#F8E7EA',
  primaryMuted: '#EBC1C8',
  onPrimary: '#FFFFFF',
  wordmarkMoney: '#F37D57',
  wordmarkTwo: '#F6B750',
  wordmarkTime: '#B1525F',
} as const;

export const DARK = {
  background: '#121A24',
  card: '#1A1F28',
  surfaceMuted: '#1E2A36',
  border: '#3C4353',
  foreground: '#E8EDF2',
  foregroundSoft: '#9AACA6',
  foregroundMuted: '#6B8078',
  primary: '#DF8693',
  primaryDark: '#DF8693',
  primarySoft: '#3D2328',
  primaryMuted: '#5E3840',
  // The accent gets brighter in dark mode, so its label turns dark (the app's
  // `--primary-foreground` for rosewood dark).
  onPrimary: '#35101A',
  wordmarkMoney: '#F39A79',
  wordmarkTwo: '#E8AD4A',
  wordmarkTime: '#DF8693',
} as const;

/** DM Sans is the site's face; everything falls back to the system font. */
export const FONT_SANS =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap';

/** The site's media bucket (money2time-web src/lib/media.ts), resized at the edge. */
export const MEDIA_ORIGIN = 'https://media.money2time.com';
function resized(path: string, width: number): string {
  return `${MEDIA_ORIGIN}/cdn-cgi/image/width=${width},quality=85,format=auto,fit=scale-down,onerror=redirect/web${path}`;
}
/** The app icon, as the site's wordmark shows it. */
export const ICON_URL = resized('/icon.png', 128);
/** The chick, waving: the site's mascot art. */
export const MASCOT_URL = resized('/mascots/waving.png', 320);
export const MASCOT_THINKING_URL = resized('/mascots/thinking.png', 320);

export const SITE_URL = 'https://money2time.com';
export const SUPPORT_EMAIL = 'hello@money2time.com';
// No storefront in the App Store link, so it opens the visitor's own.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6760418898';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nelsongan.money2time';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text or an attribute value made safe to put in HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
