/** A place from search or the phone, before it is saved on a transaction. */
export interface PlaceResult {
  /** Apple's place id; null for a spot (the current location, a street). */
  id: string | null;
  name: string;
  /** One-line address without the name or country; may be empty. */
  address: string;
  latitude: number;
  longitude: number;
  /** Apple's PoiCategory ("Cafe"), or null. */
  category: string | null;
  countryCode: string | null;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}
