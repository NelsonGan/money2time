// How a phone and the cloud copy come together on the first sign-in.

interface HasData {
  hasMeaningfulData: boolean;
}

export type LinkDecision = 'upload' | 'download' | 'choose';

/**
 * - The cloud copy has nothing recorded: this phone's data becomes it.
 * - This phone has nothing recorded: it takes the cloud copy.
 * - Both have data: the user picks one. The two are never merged: merging
 *   would duplicate the default categories and double-count balances.
 */
export function decideLink(cloud: HasData, local: HasData): LinkDecision {
  if (!cloud.hasMeaningfulData) return 'upload';
  if (!local.hasMeaningfulData) return 'download';
  return 'choose';
}
