import { NativeModules, Platform } from 'react-native';

import type { LiveEarningsWidgetPayload } from '~/features/widgets/lib/liveEarningsWidget';

/**
 * Hands the live-earnings widget its precomputed timeline.
 *
 * Deliberately its own App Group key rather than a section of the big widget
 * snapshot: the snapshot is rebuilt from app data on a schedule of its own, so
 * folding a running session into it would mean any unrelated rebuild could
 * quietly wipe the session out. This is written only by the code that starts,
 * stops or re-syncs the activity.
 */

interface NativeWidgetModule {
  writeLiveEarnings?: (json: string) => Promise<void>;
}

const nativeWidgetModule = NativeModules.Money2TimeWidget as NativeWidgetModule | undefined;

/** iOS-only, and absent from a build made before the widget target existed. */
const isLiveEarningsWidgetAvailable =
  Platform.OS === 'ios' && typeof nativeWidgetModule?.writeLiveEarnings === 'function';

/**
 * Never throws: this rides along with the activity's own lifecycle, and a
 * widget that failed to update must not take the Live Activity down with it.
 */
export async function writeLiveEarningsWidget(payload: LiveEarningsWidgetPayload): Promise<void> {
  if (!isLiveEarningsWidgetAvailable) return;
  try {
    await nativeWidgetModule?.writeLiveEarnings?.(JSON.stringify(payload));
  } catch {
    // Best effort.
  }
}
