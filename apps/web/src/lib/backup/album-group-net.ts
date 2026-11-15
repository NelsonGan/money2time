/**
 * The user's net in a shared album, from its group's debts, as the app's
 * Balances page and the album's Balances tab work it out (the app's
 * `lib/selfNet.ts` over `openShares`): payments past a share, on a deleted
 * bill or in another currency than their bill's are owed back, so this can
 * differ from what the user's own entries say. Never converted. Null when
 * the phone sent no payments for the album (an older app): the dashboard
 * then reads the album's entries, as before. Its imports end in `.ts`, so
 * the tests can load it.
 */

import { openShares } from "../album/debts.ts";
import { albumGroupOf, cents } from "./album-group.ts";
import type { CurrencyAmount } from "./split-payer.ts";
import type { BackupTables } from "./types";

export type AlbumGroupNet = {
  /** Owed to the user above zero; currencies that come to nothing left out; `mainCurrency` first, then by code. */
  netByCurrency: CurrencyAmount[];
  /** The open shares the user owes or is owed: 0 when there is nothing to settle. */
  count: number;
};

export function albumGroupNet(tables: Pick<BackupTables, "web_album_members" | "web_album_bills" | "web_album_settlements">, albumId: string, mainCurrency?: string): AlbumGroupNet | null {
  const group = albumGroupOf(tables, albumId);
  if (!group || !group.settlements || !group.selfId) return null;
  const self = group.selfId;
  const net = new Map<string, number>();
  let count = 0;
  for (const share of openShares([...group.bills.values()], group.settlements)) {
    const sign = share.to === self ? 1 : share.from === self ? -1 : 0;
    if (!sign) continue;
    count += 1;
    net.set(share.currency, (net.get(share.currency) ?? 0) + sign * cents(share.amount));
  }
  return {
    count,
    netByCurrency: [...net]
      .filter(([, amount]) => amount !== 0)
      .map(([currency, amount]) => ({ currency, amount: amount / 100 }))
      .sort((a, b) => Number(b.currency === mainCurrency) - Number(a.currency === mainCurrency) || a.currency.localeCompare(b.currency)),
  };
}

/** The albums the phone sent a group for: shared now, whether or not the user has an entry in them. */
export function groupAlbumIds(tables: Pick<BackupTables, "web_album_members">): Set<string> {
  return new Set((tables.web_album_members ?? []).filter((row) => row && typeof row.album_id === "string").map((row) => row.album_id));
}
