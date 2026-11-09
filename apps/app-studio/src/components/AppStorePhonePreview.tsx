'use client';

import type { ReactNode } from 'react';
import type { CreativePlacement } from '../data/appStoreCreative';
import { getScenes } from '../scenes/sceneData';
import { ScreenshotScene } from './ScreenshotScene';
import styles from './AppStorePhonePreview.module.css';

export const STORE_PREVIEW = {
  screenWidth: 393,
  screenHeight: 852,
  bezel: 13,
  headerHeight: 258,
  searchCardWidth: 353,
} as const;

type SymbolName = 'back' | 'share' | 'search' | 'close' | 'today' | 'games' | 'apps' | 'arcade' | 'person';

function StoreSymbol({ name, size = 24 }: { name: SymbolName; size?: number }) {
  const paths: Record<SymbolName, ReactNode> = {
    back: <path d="m15 4-8 8 8 8" />,
    share: <><path d="M8 8H5v13h14V8h-3M12 15V2m-4 4 4-4 4 4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    today: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6h6M9 10h6M9 14h6M9 18h4" /></>,
    games: <><path d="M9 16 5 19l1-5M9 16l-1-5C12 3 18 2 21 3c1 3 0 9-8 13l-4-1Z" /><circle cx="16" cy="8" r="2" /><path d="m8 17-4 4" /></>,
    apps: <><path d="m12 2 10 6-10 6L2 8l10-6Zm-10 11 10 6 10-6M2 18l10 6 10-6" /></>,
    arcade: <><path d="M3 16h18v5H3zM12 5v9m-5 2 5-3 5 3" /><circle cx="12" cy="3" r="2" /><circle cx="6" cy="18" r=".6" /></>,
    person: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="9" r="3" /><path d="M6 20v-2a6 6 0 0 1 12 0v2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function AppIcon({ large = false }: { large?: boolean }) {
  return <img src="/assets/icons/play_store_512.png" alt="" className={large ? styles.largeIcon : styles.appIcon} />;
}

function GetPill({ primary = false }: { primary?: boolean }) {
  return <span className={`${styles.getPill} ${primary ? styles.primaryPill : ''}`}>Get</span>;
}

function StoreTabs({ placement }: { placement: CreativePlacement }) {
  const tabs = [
    { name: 'today' as const, label: 'Today' },
    { name: 'games' as const, label: 'Games' },
    { name: 'apps' as const, label: 'Apps' },
    { name: 'arcade' as const, label: 'Arcade' },
    { name: 'search' as const, label: 'Search' },
  ];
  return <div className={styles.tabBar} aria-hidden="true">
    {tabs.map(tab => <div key={tab.name} className={`${styles.tab} ${tab.name === (placement === 'header' ? 'apps' : 'search') ? styles.selectedTab : ''}`}>
      <StoreSymbol name={tab.name} size={22} /><span>{tab.label}</span>
    </div>)}
  </div>;
}

function ProductDetails({ locale }: { locale: string }) {
  const gallery = getScenes(locale).slice(0, 2);
  return <>
    <div className={styles.productDetails}>
      <div className={styles.productIdentity}>
        <AppIcon large />
        <div className={styles.productCopy}>
          <p className={styles.productTitle}>Money2Time:<br />Expense Tracker</p>
          <p className={styles.subtitle}>Offline expense tracker</p>
          <GetPill primary />
        </div>
      </div>
      <div className={styles.facts} aria-hidden="true">
        <div><span className={styles.factLabel}>— RATINGS</span><strong>—</strong><span className={styles.stars}>★★★★★</span></div>
        <div><span className={styles.factLabel}>AGE RATING</span><strong>—</strong><span>Years</span></div>
        <div><span className={styles.factLabel}>DEVELOPER</span><StoreSymbol name="person" size={20} /><span>Leong Wai Gan</span></div>
      </div>
    </div>
    <div className={styles.gallery} aria-label="Localized screenshot gallery">
      {gallery.map(scene => <div key={scene.id} className={styles.galleryItem}>
        <ScreenshotScene scene={scene} previewScale={228 / 1284} />
      </div>)}
    </div>
  </>;
}

function SearchPlaceholder() {
  return <div className={styles.searchPlaceholder} aria-hidden="true">
    <div className={styles.placeholderListing}>
      <div className={styles.placeholderIcon} />
      <div><div className={styles.placeholderTitle} /><div className={styles.placeholderSubtitle} /><span className={styles.placeholderStars}>★★★★★</span></div>
      <div className={styles.placeholderGet} />
    </div>
    <div className={styles.placeholderMeta}><span /><span /></div>
    <div className={styles.placeholderGallery}>{[0, 1, 2].map(index => <div key={index} />)}</div>
  </div>;
}

/** Store chrome is outside the referenced creative canvas used for every export and upload. */
export function AppStorePhonePreview({ placement, locale, availableWidth, children }: {
  placement: CreativePlacement; locale: string; availableWidth: number; children: ReactNode;
}) {
  const width = STORE_PREVIEW.screenWidth + STORE_PREVIEW.bezel * 2;
  const height = STORE_PREVIEW.screenHeight + STORE_PREVIEW.bezel * 2;
  const scale = Math.min(1, availableWidth / width);
  return <div className={styles.preview} style={{ width: width * scale, height: height * scale }}>
    <div className={styles.phone} style={{ transform: `scale(${scale})` }}
      role="region" aria-label={placement === 'header' ? 'App Store product page preview' : 'App Store search results preview'}
      data-store-preview={placement}>
      <div className={styles.screen}>
        <div className={styles.island} aria-hidden="true" />
        {placement === 'header' ? <>
          <div className={styles.headerArtwork} data-store-artwork="header">{children}</div>
          <div className={styles.headerNavigation} aria-hidden="true">
            <span className={styles.glassCircle}><StoreSymbol name="back" /></span>
            <span className={styles.glassCircle}><StoreSymbol name="share" /></span>
          </div>
          <ProductDetails locale={locale} />
        </> : <>
          <div className={styles.searchNavigation} aria-hidden="true">
            <div className={styles.searchField}><StoreSymbol name="search" size={16} /><span>Search</span></div>
            <span className={styles.glassCircle}><StoreSymbol name="close" /></span>
          </div>
          <div className={styles.searchContent}>
            <div className={styles.searchIdentity}>
              <AppIcon />
              <div className={styles.searchCopy}>
                <p className={styles.searchTitle}>Money2Time: Expense Tracker</p>
                <p className={styles.subtitle}>Offline expense tracker</p>
                <span className={styles.stars} aria-hidden="true">★★★★★</span>
              </div>
              <GetPill />
            </div>
            <p className={styles.developer}><StoreSymbol name="person" size={10} />Leong Wai Gan</p>
            <div className={styles.searchArtwork} data-store-artwork="search">{children}</div>
            <SearchPlaceholder />
          </div>
        </>}
        <StoreTabs placement={placement} />
      </div>
    </div>
  </div>;
}
