// The cloud-sync Worker's shared-ledger routes (apps/cloudflare/workers/
// cloud-sync/src/ledgers.ts). See README.md > Cloud Sync > Shared ledgers.

import { request, type SyncCredentials } from './cloudSyncApi';

export interface RemoteSharedLedger {
  /** The Worker's id of the share. */
  id: string;
  /** The app's id of the ledger. */
  ledgerId: string;
  name: string;
  emoji: string | null;
  role: 'owner' | 'member';
  ownerName: string;
  memberCount: number;
  /** False while nobody in it (owner or member) is Pro. */
  active: boolean;
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
}

const path = (shareId: string, rest = '') => `/v1/ledgers/${encodeURIComponent(shareId)}${rest}`;

export async function listSharedLedgers(token: string): Promise<RemoteSharedLedger[]> {
  return (await request<{ ledgers: RemoteSharedLedger[] }>('/v1/ledgers', { token })).ledgers;
}

export async function shareLedger(
  token: string,
  ledger: { ledgerId: string; name: string; emoji: string | null },
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

export function getLedgerCredentials(token: string, shareId: string): Promise<SyncCredentials> {
  return request<SyncCredentials>(path(shareId, '/credentials'), { body: {}, token });
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

/** The ledger's invite link: the open one, or a new one that lasts a day. */
export function getInviteLink(
  token: string,
  shareId: string,
  ledger: { name: string; emoji: string | null },
): Promise<{ url: string; expiresAt: number }> {
  return request(path(shareId, '/invites'), { body: ledger, token });
}

export function previewInvite(code: string): Promise<InvitePreview> {
  return request<InvitePreview>(`/v1/invites/${encodeURIComponent(code)}`);
}

export async function acceptInvite(token: string, code: string): Promise<RemoteSharedLedger> {
  return (
    await request<{ ledger: RemoteSharedLedger }>(
      `/v1/invites/${encodeURIComponent(code)}/accept`,
      { body: {}, token },
    )
  ).ledger;
}
