import { requireOptionalNativeModule } from 'expo';

/** Native side of Meta app events; null on web, in tests and in older builds. */
export type MetaAppEventsNativeModule = {
  /** Starts the SDK with automatic install and launch events. Resolves false without config. */
  start(debug: boolean): Promise<boolean>;
  /** Keeps the SDK from starting or sending on its own on later launches. */
  disable(): Promise<void>;
};

export function getMetaAppEventsModule(): MetaAppEventsNativeModule | null {
  return requireOptionalNativeModule<MetaAppEventsNativeModule>('MetaAppEvents');
}
