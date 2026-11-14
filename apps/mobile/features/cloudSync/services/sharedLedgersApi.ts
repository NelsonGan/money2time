// The cloud-sync Worker's shared-ledger routes (apps/cloudflare/workers/
// cloud-sync/src/ledgers.ts). See README.md > Cloud Sync > Shared ledgers.

import { request, type SyncCredentials } from './cloudSyncApi';
import type { ShareKind } from './sharedLedgerStore';

export interface RemoteSharedLedger {
  /** The Worker's id of the share. */
  id: string;
  /** The app's id of the ledger. */
  ledgerId: string;
  name: string;
  emoji: string | null;
  role: 'owner' | 'member';
  /** The owner's account id (absent from an older Worker). */
  ownerId?: string;
  ownerName: string;
  memberCount: number;
  /** False while nobody in it (owner or member) is Pro. */
  active: boolean;
  /** 'album' for a shared album's group; absent (a ledger) from an older Worker. */
  kind?: ShareKind;
}

export interface LedgerPerson {
  name: string;
  /** Only the owner sees addresses. */
  email: string | null;
}

export interface LedgerMembers {
  owner: LedgerPerson;
  members: (LedgerPerson & { id: string; joinedAt: number })[];
  maxMembers: number;
}

export interface InvitePreview {
  /** The app's id of the ledger (absent from an older Worker). */
  ledgerId?: string;
  name: string;
  emoji: string | null;
  ownerName: string;
  memberCount: number;
  /** No place left: joining would be refused. */
  full?: boolean;
  active: boolean;
  /** 'album' when the link is to a shared album; absent (a ledger) from an older Worker. */
  kind?: ShareKind;
}

const path = (shareId: string, rest = '') => `/v1/ledgers/${encodeURIComponent(shareId)}${rest}`;

/**
 * Everything this account shares or has joined. `albums=1` says this app
 * knows shared albums: the Worker leaves them out for one that does not ask,
 * which would take an album's group for a ledger.
 */
export async function listSharedLedgers(token: string): Promise<RemoteSharedLedger[]> {
  return (await request<{ ledgers: RemoteSharedLedger[] }>('/v1/ledgers?albums=1', { token }))
    .ledgers;
}

/** Shares a ledger, or with `kind: 'album'` an album (`ledgerId` is then the album's id). */
export async function shareLedger(
  token: string,
  ledger: { ledgerId: string; name: string; emoji: string | null; kind?: ShareKind },
): Promise<RemoteSharedLedger> {
  return (await request<{ ledger: RemoteSharedLedger }>('/v1/ledgers', { body: ledger, token }))
    .ledger;
}

export async function stopSharing(token: string, shareId: string): Promise<void> {
  await request(path(shareId), { method: 'DELETE', token });
}

export async function leaveLedger(token: string, shareId: string): Promise<void> {
  await request(path(shareId, '/leave'), { body: {}, token });
}

/**
 * A token for the ledger's database. `final`: the owner's last download of a
 * paused ledger before stopping it, read-only (the Worker refuses others).
 */
export function getLedgerCredentials(
  token: string,
  shareId: string,
  opts: { final?: boolean } = {},
): Promise<SyncCredentials> {
  return request<SyncCredentials>(path(shareId, '/credentials'), {
    body: opts.final ? { final: true } : {},
    token,
  });
}

/** A row the Worker wrote to a shared album's database, as `sync_rows` holds it. */
export interface WrittenGroupRow {
  table: string;
  id: string;
  data: string;
  rev: string;
}

/** A change to a shared album's group, in the shape `albumGroupWrites` sends it. */
export type AlbumGroupWrite =
  | { action: 'join'; name: string }
  | {
      action: 'write';
      rows: { table: string; row: Record<string, unknown> }[];
      reason?: 'close_even';
    };

/**
 * Writes to a shared album's group. Its phones only read its database: the
 * Worker checks the change, stamps it with this account and logs it, then
 * answers with the rows it wrote. `device` keeps this phone from being told
 * to sync for its own change.
 */
export async function writeAlbumGroup(
  token: string,
  shareId: string,
  change: AlbumGroupWrite,
  device: string,
): Promise<WrittenGroupRow[]> {
  return (
    await request<{ rows: WrittenGroupRow[] }>(path(shareId, '/album'), {
      body: { ...change, device },
      token,
    })
  ).rows;
}

export function getLedgerMembers(token: string, shareId: string): Promise<LedgerMembers> {
  return request<LedgerMembers>(path(shareId, '/members'), { token });
}

export async function removeMember(token: string, shareId: string, userId: string): Promise<void> {
  await request(path(shareId, `/members/${encodeURIComponent(userId)}`), {
    method: 'DELETE',
    token,
  });
}

export interface InviteLink {
  url: string;
  /** Epoch ms. The Worker hands out a link with at least an hour left. */
  expiresAt: number;
}

/**
 * The ledger's invite link: the open one, or a new one that lasts a day.
 * `rotate` always makes a new one, and the old link stops working at once.
 */
export function getInviteLink(
  token: string,
  shareId: string,
  ledger: { name: string; emoji: string | null },
  options: { rotate?: boolean } = {},
): Promise<InviteLink> {
  return request(path(shareId, '/invites'), {
    body: options.rotate ? { ...ledger, rotate: true } : ledger,
    token,
  });
}

export function previewInvite(code: string): Promise<InvitePreview> {
  return request<InvitePreview>(`/v1/invites/${encodeURIComponent(code)}`);
}

/** Joins. `albums: true` says this app can join a shared album (the Worker refuses one that cannot). */
export async function acceptInvite(token: string, code: string): Promise<RemoteSharedLedger> {
  return (
    await request<{ ledger: RemoteSharedLedger }>(
      `/v1/invites/${encodeURIComponent(code)}/accept`,
      { body: { albums: true }, token },
    )
  ).ledger;
}
