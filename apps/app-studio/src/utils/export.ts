import { toJpeg, toPng } from 'html-to-image';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { APP_STORE_CREATIVE, isCreativePlacement } from '../data/appStoreCreative';
import { PAYMENT_LAYERS } from '../data/paymentAnimation.mjs';
import type { CreativePlacement } from '../data/appStoreCreative';

const EXPORT_WIDTH = 1284;
const EXPORT_HEIGHT = 2778;
const IPAD_EXPORT_WIDTH = 2732;
const IPAD_EXPORT_HEIGHT = 2048;
/** The open iPhone Duo's inner display, landscape: App Store Connect's APP_IPHONE_DUO size. */
const DUO_EXPORT_WIDTH = 2853;
const DUO_EXPORT_HEIGHT = 2007;
const FEATURE_EXPORT_WIDTH = 1024;
const FEATURE_EXPORT_HEIGHT = 500;
const LANDING_EXPORT_WIDTH = 1200;
const LANDING_EXPORT_HEIGHT = 1200;

export type DeviceType = 'phone' | 'ipad' | 'duo' | 'feature' | 'landing';
export type ExportDeviceType = DeviceType | CreativePlacement;

function dimsFor(device: ExportDeviceType) {
  if (isCreativePlacement(device)) {
    const { width, height } = APP_STORE_CREATIVE[device];
    return { width, height };
  }
  if (device === 'ipad') return { width: IPAD_EXPORT_WIDTH, height: IPAD_EXPORT_HEIGHT };
  if (device === 'duo') return { width: DUO_EXPORT_WIDTH, height: DUO_EXPORT_HEIGHT };
  if (device === 'feature') return { width: FEATURE_EXPORT_WIDTH, height: FEATURE_EXPORT_HEIGHT };
  if (device === 'landing') return { width: LANDING_EXPORT_WIDTH, height: LANDING_EXPORT_HEIGHT };
  return { width: EXPORT_WIDTH, height: EXPORT_HEIGHT };
}

function extensionFor(device: ExportDeviceType) {
  return device === 'search' ? 'mp4' : isCreativePlacement(device) ? 'jpg' : 'png';
}

export async function rasterize(element: HTMLElement, device: ExportDeviceType): Promise<string> {
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll('img'), (img) => img.decode()));
  // Let font-ready headline fitting complete, including in background tabs
  // where animation frames are suspended.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const options = {
    ...dimsFor(device), pixelRatio: 1, cacheBust: true,
    style: { transform: 'none' },
  };
  if (isCreativePlacement(device)) {
    // JPEG encodes RGB, satisfying Apple's prohibition on alpha channels.
    return toJpeg(element, { ...options, backgroundColor: '#FBF2EA', quality: 0.98 });
  }
  return toPng(element, options);
}

/** Downloads and Store uploads share the same deterministic MP4 encoder. */
export async function captureCreativeMedia(element: HTMLElement, device: ExportDeviceType): Promise<string> {
  if (device !== 'search') return rasterize(element, device);
  const previous = element.getAttribute('data-payment-capture');
  const locale = element.getAttribute('data-search-locale') ?? 'en';
  let data: string;
  const layers: Record<string, string> = {};
  try {
    element.setAttribute('data-payment-capture', 'base');
    data = (await rasterize(element, 'search')).split(',')[1];
    for (const layer of PAYMENT_LAYERS) {
      element.setAttribute('data-payment-capture', layer);
      const png = await toPng(element, { ...dimsFor('search'), pixelRatio: 1, cacheBust: true,
        style: { transform: 'none', background: 'transparent' },
        filter: node => node === element || !(node as HTMLElement).hasAttribute?.('data-payment-static') });
      layers[layer] = png.split(',')[1];
    }
  } finally {
    if (previous === null) element.removeAttribute('data-payment-capture');
    else element.setAttribute('data-payment-capture', previous);
  }
  const response = await fetch('/api/creatives/search-video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale, data, layers }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? 'Could not encode the payment animation. Check that ffmpeg and ffprobe are installed.');
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the Search video.'));
    reader.readAsDataURL(blob);
  });
}

export async function exportSingleScreenshot(
  element: HTMLElement,
  filename: string,
  device: ExportDeviceType = 'phone',
): Promise<void> {
  const dataUrl = await captureCreativeMedia(element, device);
  const link = document.createElement('a');
  link.download = `${filename}.${extensionFor(device)}`;
  link.href = dataUrl;
  link.click();
}

export async function exportAllScreenshots(
  elements: Map<string, HTMLElement>,
  locale: string,
  device: ExportDeviceType = 'phone',
): Promise<void> {
  if (!elements.size) throw new Error('No screenshots are ready to export. Please try again.');
  const zip = new JSZip();
  const folderName = device === 'ipad' || device === 'duo'
    ? `money2time-screenshots-${device}-${locale}`
    : isCreativePlacement(device) ? `money2time-app-store-${device}-${locale}`
    : `money2time-screenshots-${locale}`;
  const folder = zip.folder(folderName)!;

  for (const [name, element] of elements) {
    const dataUrl = await captureCreativeMedia(element, device);
    const base64 = dataUrl.split(',')[1];
    folder.file(`${name}.${extensionFor(device)}`, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${folderName}.zip`);
}

/**
 * Export every locale into one zip, a folder per locale.
 * `prepareLocale` must switch the app to the locale, wait for the scenes to
 * render, and return the elements to capture keyed by file name (no extension).
 */
export async function exportAllLocalesScreenshots(
  locales: string[],
  device: ExportDeviceType,
  prepareLocale: (locale: string) => Promise<Map<string, HTMLElement>>,
): Promise<void> {
  const zip = new JSZip();
  const root = device === 'phone'
    ? 'money2time-screenshots-all'
    : isCreativePlacement(device) ? `money2time-app-store-${device}-all`
    : `money2time-${device}-all`;

  for (const locale of locales) {
    const elements = await prepareLocale(locale);
    if (!elements.size) throw new Error(`No assets are ready for ${locale}. Please try again.`);
    const folder = zip.folder(`${root}/${locale}`)!;
    for (const [name, element] of elements) {
      const dataUrl = await captureCreativeMedia(element, device);
      folder.file(`${name}.${extensionFor(device)}`, dataUrl.split(',')[1], { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${root}.zip`);
}

export {
  EXPORT_WIDTH, EXPORT_HEIGHT,
  IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT,
  DUO_EXPORT_WIDTH, DUO_EXPORT_HEIGHT,
  FEATURE_EXPORT_WIDTH, FEATURE_EXPORT_HEIGHT,
  LANDING_EXPORT_WIDTH, LANDING_EXPORT_HEIGHT,
};
