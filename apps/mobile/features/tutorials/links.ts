/** Public home of the tutorials, mirrored from `features/tutorials/content`. */
export const TUTORIALS_WEB_BASE = 'https://money2time.com/tutorials';

/**
 * Shareable link for one tutorial. The website page opens the same tutorial in
 * the app when it is installed, and reads on its own when it is not, which a
 * bare `money2time://` link cannot do.
 */
export function tutorialWebUrl(id: string): string {
  return `${TUTORIALS_WEB_BASE}/${id}`;
}
