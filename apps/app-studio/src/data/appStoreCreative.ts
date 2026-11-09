/** Dimensions and safe areas measured from Apple's static Photoshop templates. */
export const APP_STORE_CREATIVE = {
  header: {
    label: 'App Store Header',
    width: 3840,
    height: 1646,
    safe: { x: 1098, y: 494, width: 1644, height: 660 },
  },
  search: {
    label: 'App Store Search',
    width: 3840,
    height: 2560,
    safe: { x: 838, y: 766, width: 2164, height: 1028 },
  },
} as const;

export type CreativePlacement = keyof typeof APP_STORE_CREATIVE;

export function isCreativePlacement(value: string): value is CreativePlacement {
  return value === 'header' || value === 'search';
}
