export declare const APP_NAME: string;
export declare const IOS_SUBTITLES: Record<string, string>;
export declare const PLAY_SHORT_DESCRIPTIONS: Record<string, string>;
export declare const IOS_KEYWORDS: Record<string, string>;

export interface StoreLocaleCopy {
  subtitle?: string;
  keywords?: string;
}

export declare const IOS_STORE_LOCALE_COPY: Record<string, Record<string, StoreLocaleCopy>>;
export declare const PLAY_STORE_LOCALE_COPY: Record<string, Record<string, Pick<StoreLocaleCopy, 'subtitle'>>>;

export declare function copyForStoreLocale<T extends { storeLocales?: Record<string, object> }>(
  copy: T,
  storeLocale: string,
): Omit<T, 'storeLocales'>;
