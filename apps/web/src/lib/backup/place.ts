/**
 * Where a transaction happened, as the app stores it (its migration 098,
 * README: Transaction locations): a point with a name, an optional one-line
 * address, Apple's place id and category. The dashboard shows it and never
 * edits it: place search needs the phone (its location and its Apple Maps
 * search), so an edit from here leaves the location as it was. Rows from an
 * app that predates locations carry none of the columns. No imports, so the
 * tests can load it.
 */

export type TxPlace = {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
};

type PlaceColumns = {
  latitude?: number | null;
  longitude?: number | null;
  place_name?: string | null;
  place_address?: string | null;
  place_category?: string | null;
};

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** A row's place, all or nothing, the same rule as the app's `transactionLocationFields`. */
export function placeOf(row: PlaceColumns): TxPlace | null {
  const { latitude, longitude } = row;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  const address = text(row.place_address, 300);
  return {
    name: text(row.place_name, 200) ?? address ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    address,
    latitude,
    longitude,
    category: text(row.place_category, 64),
  };
}
