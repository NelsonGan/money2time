// Shared ledgers. See README.md > Cloud Sync > Shared ledgers.
//
// A Pro user can share up to MAX_OWNED of their ledgers. Each shared ledger
// gets its own Turso database, holding only that ledger's rows, and its own
// image space (src/media.ts). The owner invites up to MAX_MEMBERS people with
// one link per ledger, reused until it expires a day after it was made;
// members need a sign-in but not Pro. A ledger syncs while anyone in it is
// Pro (owner or member) and is paused for everyone while nobody is. Tokens
// last a day and are not revoked early: Turso's revocation is not per
// database (it can reach every database in the group), so a removed member
// or a paused ledger is cut off when the token held expires, and the app
// drops or pauses the ledger at its next list read (at once when its hub
// tells it, src/live.ts).
//
// Trust: a member's token can write anything in the ledger's database, as the
// app itself can (delete entries, say). The owner's phone only ever applies
// rows that belong to the ledger (see the app's syncEngine `accepts`), so a
// member cannot reach the owner's other data.

import { csv, type Env } from './env';
import { json, readJson } from './http';
import { notifyUsers } from './live';
import { deleteAllMedia, ledgerSpace } from './media';
import { isAccountPro } from './revenuecat';
import { open, seal } from './secretBox';
import { applyCloudSchema, createDatabase, createToken, deleteDatabase } from './turso';

const MAX_OWNED = 2;
const MAX_MEMBERS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** An invite link lasts a day; asking again within it returns the same link. */
const INVITE_TTL_MS = DAY_MS;
/** A link this close to expiring is replaced rather than handed out again. */
const INVITE_REUSE_MARGIN_MS = 60 * 60 * 1000;
/** Ledger tokens last a day (see above). */
const TOKEN_TTL_DAYS = 1;
const TOKEN_REUSE_MARGIN_MS = 6 * 60 * 60 * 1000;
const INVITE_CODE = /^[A-Za-z0-9_-]{20,64}$/;
/** The app's ledger ids are UUIDs. */
const LEDGER_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_NAME = 60;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface SharedLedgerRow {
  id: string;
  ledger_id: string;
  owner_user_id: string;
  name: string;
  emoji: string | null;
  db_name: string;
  db_url: string;
  token: string | null;
  token_expires_at: number | null;
  created_at: number;
}

type Role = 'owner' | 'member';

/** What the app is told about a shared ledger. */
interface LedgerView {
  id: string;
  ledgerId: string;
  name: string;
  emoji: string | null;
  role: Role;
  ownerName: string;
  memberCount: number;
  /** False while nobody in it (owner or member) is Pro: nobody syncs it. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Helpers

function randomToken(bytes: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `jo***@gmail.com`: enough for someone who knows them, not an address to write to. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function displayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed || maskEmail(email ?? '');
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_NAME);
  return trimmed || null;
}

function cleanEmoji(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 ? value : null;
}

async function getLedger(env: Env, id: string): Promise<SharedLedgerRow | null> {
  return env.AUTH_DB.prepare('SELECT * FROM shared_ledgers WHERE id = ?1')
    .bind(id)
    .first<SharedLedgerRow>();
}

/** The ledger and the user's role in it, or null when they have none. */
async function access(
  env: Env,
  id: string,
  userId: string,
): Promise<{ ledger: SharedLedgerRow; role: Role } | null> {
  const ledger = await getLedger(env, id);
  if (!ledger) return null;
  if (ledger.owner_user_id === userId) return { ledger, role: 'owner' };
  const member = await env.AUTH_DB.prepare(
    'SELECT 1 FROM ledger_members WHERE ledger_id = ?1 AND user_id = ?2',
  )
    .bind(id, userId)
    .first();
  return member ? { ledger, role: 'member' } : null;
}

async function memberCount(env: Env, id: string): Promise<number> {
  const row = await env.AUTH_DB.prepare(
    'SELECT COUNT(*) AS n FROM ledger_members WHERE ledger_id = ?1',
  )
    .bind(id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function memberIds(env: Env, id: string): Promise<string[]> {
  const { results } = await env.AUTH_DB.prepare(
    'SELECT user_id FROM ledger_members WHERE ledger_id = ?1',
  )
    .bind(id)
    .all<{ user_id: string }>();
  return results.map((row) => row.user_id);
}

/** Everyone who reads the ledger: the owner and its members. */
export async function ledgerAudience(env: Env, ledger: SharedLedgerRow): Promise<string[]> {
  return [ledger.owner_user_id, ...(await memberIds(env, ledger.id))];
}

/**
 * A ledger syncs while anyone in it is Pro: the owner, or any member. So a
 * household's book keeps working when the person who shared it lets Pro
 * lapse but someone else in it pays. Each account's answer is cached
 * (src/revenuecat.ts), so this costs little.
 */
export async function isLedgerActive(env: Env, ledger: SharedLedgerRow): Promise<boolean> {
  if (await isAccountPro(env, ledger.owner_user_id)) return true;
  const members = await memberIds(env, ledger.id);
  const answers = await Promise.all(members.map((id) => isAccountPro(env, id)));
  return answers.includes(true);
}

async function ownerOf(
  env: Env,
  ledger: SharedLedgerRow,
): Promise<{ name: string; email: string }> {
  const owner = await env.AUTH_DB.prepare('SELECT name, email FROM "user" WHERE id = ?1')
    .bind(ledger.owner_user_id)
    .first<{ name: string; email: string }>();
  return owner ?? { name: '', email: '' };
}

async function view(env: Env, ledger: SharedLedgerRow, role: Role): Promise<LedgerView> {
  const [owner, count, active] = await Promise.all([
    ownerOf(env, ledger),
    memberCount(env, ledger.id),
    isLedgerActive(env, ledger),
  ]);
  return {
    id: ledger.id,
    ledgerId: ledger.ledger_id,
    name: ledger.name,
    emoji: ledger.emoji,
    role,
    ownerName: displayName(owner.name, owner.email),
    memberCount: count,
    active,
  };
}

/**
 * Drops a ledger's cloud database, images and rows (members and its link
 * cascade), then tells everyone who had it, so their apps let it go now.
 */
async function destroy(env: Env, ledger: SharedLedgerRow): Promise<void> {
  const audience = await ledgerAudience(env, ledger);
  await Promise.all([
    deleteDatabase(env, ledger.db_name),
    deleteAllMedia(env, ledgerSpace(ledger.id)),
  ]);
  await env.AUTH_DB.prepare('DELETE FROM shared_ledgers WHERE id = ?1').bind(ledger.id).run();
  await notifyUsers(env, audience, ledger.id, null, 'access');
}

// ---------------------------------------------------------------------------
// Routes under /v1/ledgers and /v1/invites (signed in)

export async function routeLedgers(
  request: Request,
  url: URL,
  env: Env,
  user: SessionUser,
): Promise<Response | null> {
  const parts = url.pathname.split('/').filter(Boolean); // ['v1', 'ledgers', id, ...]
  const method = request.method;

  if (parts[1] === 'invites' && parts.length === 4 && parts[3] === 'accept' && method === 'POST') {
    return acceptInvite(env, user, parts[2]);
  }
  if (parts[1] !== 'ledgers') return null;

  if (parts.length === 2) {
    if (method === 'GET') return listLedgers(env, user);
    if (method === 'POST') return shareLedger(env, user, request);
    return null;
  }

  const found = await access(env, parts[2], user.id);
  if (!found) return json({ error: 'not_found' }, 404);
  const { ledger, role } = found;
  const action = parts[3];

  if (!action && method === 'DELETE') {
    if (role !== 'owner') return json({ error: 'forbidden' }, 403);
    await destroy(env, ledger);
    return json({ ok: true });
  }
  if (action === 'leave' && method === 'POST' && parts.length === 4) {
    if (role !== 'member') return json({ error: 'forbidden' }, 403);
    await env.AUTH_DB.prepare('DELETE FROM ledger_members WHERE ledger_id = ?1 AND user_id = ?2')
      .bind(ledger.id, user.id)
      .run();
    // The leaver's own other phones are told it was them (no "removed" notice).
    await notifyUsers(
      env,
      [user.id, ...(await ledgerAudience(env, ledger))],
      ledger.id,
      null,
      'access',
      user.id,
    );
    return json({ ok: true });
  }
  if (action === 'credentials' && method === 'POST' && parts.length === 4) {
    return credentials(env, ledger);
  }
  if (action === 'members' && parts.length === 4 && method === 'GET') {
    return listMembers(env, ledger, role);
  }
  if (action === 'members' && parts.length === 5 && method === 'DELETE') {
    if (role !== 'owner') return json({ error: 'forbidden' }, 403);
    const removed = await env.AUTH_DB.prepare(
      'DELETE FROM ledger_members WHERE ledger_id = ?1 AND user_id = ?2',
    )
      .bind(ledger.id, parts[4])
      .run();
    // Not a member (the owner, a stale id): nothing to do, nobody to tell.
    if (!removed.meta.changes) return json({ error: 'not_found' }, 404);
    // The link they joined with stops working: a new one is made on the next
    // Invite, so the person removed cannot simply join again.
    await env.AUTH_DB.prepare('DELETE FROM ledger_links WHERE ledger_id = ?1')
      .bind(ledger.id)
      .run();
    // Their app lets the ledger go now rather than at its next list read.
    await notifyUsers(env, [parts[4]], ledger.id, null, 'access');
    return json({ ok: true });
  }
  if (action === 'invites' && parts.length === 4 && method === 'POST') {
    if (role !== 'owner') return json({ error: 'forbidden' }, 403);
    return inviteLink(env, ledger, request);
  }
  return null;
}

/** Who to tell when the user changed a shared ledger, or null if it is not theirs. */
export async function audienceIfAllowed(
  env: Env,
  id: string,
  userId: string,
): Promise<string[] | null> {
  const found = await access(env, id, userId);
  return found ? ledgerAudience(env, found.ledger) : null;
}

/** The shared ledger an image route names, if the user may use it. */
export async function ledgerForMedia(
  env: Env,
  id: string,
  userId: string,
): Promise<SharedLedgerRow | null> {
  return (await access(env, id, userId))?.ledger ?? null;
}

async function listLedgers(env: Env, user: SessionUser): Promise<Response> {
  const owned = await env.AUTH_DB.prepare('SELECT * FROM shared_ledgers WHERE owner_user_id = ?1')
    .bind(user.id)
    .all<SharedLedgerRow>();
  const joined = await env.AUTH_DB.prepare(
    `SELECT l.* FROM shared_ledgers l JOIN ledger_members m ON m.ledger_id = l.id
     WHERE m.user_id = ?1`,
  )
    .bind(user.id)
    .all<SharedLedgerRow>();
  const ledgers = await Promise.all([
    ...owned.results.map((row) => view(env, row, 'owner')),
    ...joined.results.map((row) => view(env, row, 'member')),
  ]);
  return json({ ledgers });
}

async function shareLedger(env: Env, user: SessionUser, request: Request): Promise<Response> {
  const body = await readJson<{ ledgerId: unknown; name: unknown; emoji: unknown }>(request);
  const ledgerId = typeof body?.ledgerId === 'string' ? body.ledgerId : '';
  const name = cleanName(body?.name);
  if (!LEDGER_ID.test(ledgerId) || ledgerId === 'default' || !name) {
    return json({ error: 'bad_request' }, 400);
  }
  if (!(await isAccountPro(env, user.id))) return json({ error: 'not_pro' }, 403);

  const existing = await env.AUTH_DB.prepare(
    'SELECT * FROM shared_ledgers WHERE owner_user_id = ?1 AND ledger_id = ?2',
  )
    .bind(user.id, ledgerId)
    .first<SharedLedgerRow>();
  if (existing) return json({ ledger: await view(env, existing, 'owner') });

  const owned = await env.AUTH_DB.prepare(
    'SELECT COUNT(*) AS n FROM shared_ledgers WHERE owner_user_id = ?1',
  )
    .bind(user.id)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= MAX_OWNED) return json({ error: 'limit_reached' }, 409);

  const id = randomHex(12);
  const dbName = `m2t-ledger-${id}`;
  const local = env.LOCAL_SYNC_URL ? await freeLocalServer(env) : null;
  if (env.LOCAL_SYNC_URL && !local) return json({ error: 'not_available_locally' }, 501);
  const url = local ?? `libsql://${await createDatabase(env, dbName)}`;
  let inserted = false;
  try {
    if (!local) await applyCloudSchema(url, await createToken(env, dbName, TOKEN_TTL_DAYS));
    // The limit and the insert are one statement, so two shares at once
    // cannot pass MAX_OWNED. A second tap on the same ledger hits the unique
    // index and gets the first share back below.
    const result = await env.AUTH_DB.prepare(
      `INSERT OR IGNORE INTO shared_ledgers
         (id, ledger_id, owner_user_id, name, emoji, db_name, db_url, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
       WHERE (SELECT COUNT(*) FROM shared_ledgers WHERE owner_user_id = ?3) < ?9`,
    )
      .bind(
        id,
        ledgerId,
        user.id,
        name,
        cleanEmoji(body?.emoji),
        dbName,
        url,
        Date.now(),
        MAX_OWNED,
      )
      .run();
    inserted = result.meta.changes > 0;
  } catch (error) {
    // A deleted account (foreign key): no orphan database.
    await deleteDatabase(env, dbName).catch(() => undefined);
    throw error;
  }
  if (!inserted) {
    await deleteDatabase(env, dbName).catch(() => undefined);
    const raced = await env.AUTH_DB.prepare(
      'SELECT * FROM shared_ledgers WHERE owner_user_id = ?1 AND ledger_id = ?2',
    )
      .bind(user.id, ledgerId)
      .first<SharedLedgerRow>();
    if (raced) return json({ ledger: await view(env, raced, 'owner') });
    return json({ error: 'limit_reached' }, 409);
  }
  const row = await getLedger(env, id);
  if (!row) return json({ error: 'server_error' }, 500);
  return json({ ledger: await view(env, row, 'owner') });
}

/** Local development: the first sync server no shared ledger uses yet. */
async function freeLocalServer(env: Env): Promise<string | null> {
  const { results } = await env.AUTH_DB.prepare('SELECT db_url FROM shared_ledgers').all<{
    db_url: string;
  }>();
  const used = new Set(results.map((row) => row.db_url));
  return csv(env.LOCAL_LEDGER_SYNC_URLS).find((url) => !used.has(url)) ?? null;
}

async function credentials(env: Env, ledger: SharedLedgerRow): Promise<Response> {
  if (!(await isLedgerActive(env, ledger))) return json({ error: 'ledger_paused' }, 403);
  const now = Date.now();
  if (env.LOCAL_SYNC_URL) {
    return json({ url: ledger.db_url, authToken: 'local', expiresAt: now + DAY_MS });
  }
  if (ledger.token && (ledger.token_expires_at ?? 0) - now > TOKEN_REUSE_MARGIN_MS) {
    const token = await open(env, 'turso-token', ledger.token);
    if (token) {
      return json({ url: ledger.db_url, authToken: token, expiresAt: ledger.token_expires_at });
    }
  }
  const token = await createToken(env, ledger.db_name, TOKEN_TTL_DAYS);
  const expiresAt = now + TOKEN_TTL_DAYS * DAY_MS;
  await env.AUTH_DB.prepare(
    'UPDATE shared_ledgers SET token = ?2, token_expires_at = ?3 WHERE id = ?1',
  )
    .bind(ledger.id, await seal(env, 'turso-token', token), expiresAt)
    .run();
  return json({ url: ledger.db_url, authToken: token, expiresAt });
}

async function listMembers(env: Env, ledger: SharedLedgerRow, role: Role): Promise<Response> {
  const owner = await ownerOf(env, ledger);
  const members = await env.AUTH_DB.prepare(
    `SELECT u.id, u.name, u.email, m.joined_at FROM ledger_members m
     JOIN "user" u ON u.id = m.user_id WHERE m.ledger_id = ?1 ORDER BY m.joined_at`,
  )
    .bind(ledger.id)
    .all<{ id: string; name: string; email: string; joined_at: number }>();
  const isOwner = role === 'owner';
  // Addresses are for the owner, who invited these people; members see names.
  const person = (p: { name: string; email: string }) => ({
    name: displayName(p.name, p.email),
    email: isOwner ? p.email : null,
  });
  return json({
    owner: person(owner),
    members: members.results.map((m) => ({ id: m.id, joinedAt: m.joined_at, ...person(m) })),
    maxMembers: MAX_MEMBERS,
  });
}

/**
 * The ledger's invite link: the one still open if there is one, else a new
 * one that lasts a day. Anyone with it can join until it expires or the
 * ledger is full, so the owner shares one link with the whole household.
 */
async function inviteLink(env: Env, ledger: SharedLedgerRow, request: Request): Promise<Response> {
  if (!(await isLedgerActive(env, ledger))) return json({ error: 'ledger_paused' }, 403);
  // The owner's phone sends the ledger's current name, shown on the join screen.
  const body = await readJson<{ name: unknown; emoji: unknown }>(request);
  const name = cleanName(body?.name);
  if (name) {
    await env.AUTH_DB.prepare('UPDATE shared_ledgers SET name = ?2, emoji = ?3 WHERE id = ?1')
      .bind(ledger.id, name, cleanEmoji(body?.emoji))
      .run();
  }
  if ((await memberCount(env, ledger.id)) >= MAX_MEMBERS) return json({ error: 'full' }, 409);
  const base = env.BETTER_AUTH_URL.replace(/\/+$/, '');
  const now = Date.now();
  const current = await env.AUTH_DB.prepare(
    'SELECT code, expires_at FROM ledger_links WHERE ledger_id = ?1',
  )
    .bind(ledger.id)
    .first<{ code: string; expires_at: number }>();
  if (current && current.expires_at - now > INVITE_REUSE_MARGIN_MS) {
    const code = await open(env, 'invite-code', current.code);
    if (code) return json({ url: `${base}/join/${code}`, expiresAt: current.expires_at });
  }
  const code = randomToken(18);
  const expiresAt = now + INVITE_TTL_MS;
  // One link per ledger: a new one replaces one about to expire (or gone).
  // Only then: two of the owner's phones asking at once keep one link, the
  // first one written, instead of the second silently killing the first.
  await env.AUTH_DB.prepare(
    `INSERT INTO ledger_links (ledger_id, code_hash, code, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(ledger_id) DO UPDATE SET code_hash = excluded.code_hash, code = excluded.code,
       created_at = excluded.created_at, expires_at = excluded.expires_at
     WHERE ledger_links.expires_at - ?4 <= ?6`,
  )
    .bind(
      ledger.id,
      await hashCode(code),
      await seal(env, 'invite-code', code),
      now,
      expiresAt,
      INVITE_REUSE_MARGIN_MS,
    )
    .run();
  const stored = await env.AUTH_DB.prepare(
    'SELECT code, expires_at FROM ledger_links WHERE ledger_id = ?1',
  )
    .bind(ledger.id)
    .first<{ code: string; expires_at: number }>();
  const storedCode = stored ? await open(env, 'invite-code', stored.code) : null;
  if (!stored || !storedCode) return json({ error: 'server_error' }, 500);
  return json({ url: `${base}/join/${storedCode}`, expiresAt: stored.expires_at });
}

interface InviteRow {
  ledger_id: string;
  code_hash: string;
  expires_at: number;
}

async function findInvite(env: Env, code: string): Promise<InviteRow | null> {
  if (!INVITE_CODE.test(code)) return null;
  const invite = await env.AUTH_DB.prepare(
    'SELECT ledger_id, code_hash, expires_at FROM ledger_links WHERE code_hash = ?1',
  )
    .bind(await hashCode(code))
    .first<InviteRow>();
  return invite && invite.expires_at > Date.now() ? invite : null;
}

/** GET /v1/invites/<code>, before sign-in: what the link opens, for the join screen. */
export async function previewInvite(env: Env, code: string): Promise<Response> {
  const invite = await findInvite(env, code);
  const ledger = invite ? await getLedger(env, invite.ledger_id) : null;
  if (!ledger) return json({ error: 'invite_not_found' }, 404);
  const owner = await ownerOf(env, ledger);
  const count = await memberCount(env, ledger.id);
  return json({
    // The app's id, so a phone that already has this ledger (its own, or
    // another share) is told before joining rather than after taking a seat.
    ledgerId: ledger.ledger_id,
    name: ledger.name,
    emoji: ledger.emoji,
    ownerName: displayName(owner.name, owner.email),
    memberCount: count,
    full: count >= MAX_MEMBERS,
    active: await isLedgerActive(env, ledger),
  });
}

async function acceptInvite(env: Env, user: SessionUser, code: string): Promise<Response> {
  const invite = await findInvite(env, code);
  const ledger = invite ? await getLedger(env, invite.ledger_id) : null;
  if (!invite || !ledger) return json({ error: 'invite_not_found' }, 404);
  if (ledger.owner_user_id === user.id) return json({ error: 'own_ledger' }, 409);
  const already = await access(env, ledger.id, user.id);
  if (!already) {
    if (!(await isLedgerActive(env, ledger))) return json({ error: 'ledger_paused' }, 403);
    // The link stays open for the next person. The seat count, the link
    // (not rotated by a removal meanwhile) and the insert are one statement,
    // so two people joining at once cannot pass MAX_MEMBERS, and someone
    // removed while joining stays out.
    const now = Date.now();
    const joined = await env.AUTH_DB.prepare(
      `INSERT OR IGNORE INTO ledger_members (ledger_id, user_id, joined_at)
       SELECT ?1, ?2, ?3
       WHERE (SELECT COUNT(*) FROM ledger_members WHERE ledger_id = ?1) < ?4
         AND EXISTS (SELECT 1 FROM ledger_links
                     WHERE ledger_id = ?1 AND code_hash = ?5 AND expires_at > ?3)`,
    )
      .bind(ledger.id, user.id, now, MAX_MEMBERS, invite.code_hash)
      .run();
    if (!joined.meta.changes) {
      // The same user joining twice at once: already in.
      if (await access(env, ledger.id, user.id)) {
        return json({ ledger: await view(env, ledger, 'member') });
      }
      if (!(await findInvite(env, code))) return json({ error: 'invite_not_found' }, 404);
      return json({ error: 'full' }, 409);
    }
    // The owner's and other members' People pages and counts catch up now.
    await notifyUsers(env, await ledgerAudience(env, ledger), ledger.id, null, 'access');
  }
  return json({ ledger: await view(env, ledger, 'member') });
}

/**
 * Account deletion: the user's own shared ledgers go with their databases and
 * images, and their memberships end. Everyone left in a ledger is told, so
 * their apps catch up at once (a removed ledger goes, a count drops).
 */
export async function deleteLedgerAccess(env: Env, userId: string): Promise<void> {
  const owned = await env.AUTH_DB.prepare('SELECT * FROM shared_ledgers WHERE owner_user_id = ?1')
    .bind(userId)
    .all<SharedLedgerRow>();
  const joined = await env.AUTH_DB.prepare(
    `SELECT l.* FROM shared_ledgers l JOIN ledger_members m ON m.ledger_id = l.id
     WHERE m.user_id = ?1`,
  )
    .bind(userId)
    .all<SharedLedgerRow>();
  await env.AUTH_DB.prepare('DELETE FROM ledger_members WHERE user_id = ?1').bind(userId).run();
  await Promise.all([
    ...owned.results.map((row) => destroy(env, row)),
    ...joined.results.map(async (row) =>
      notifyUsers(env, await ledgerAudience(env, row), row.id, null, 'access'),
    ),
  ]);
}

/** Daily: expired invite links go. */
export function expiredInvitesStatement(env: Env): D1PreparedStatement {
  return env.AUTH_DB.prepare('DELETE FROM ledger_links WHERE expires_at < ?1').bind(Date.now());
}

// ---------------------------------------------------------------------------
// GET /join/<code>: the page an invite link opens

const APP_STORE_URL = 'https://apps.apple.com/app/id6760418898';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.nelsongan.money2time';

/**
 * Hands the link to the app, or points to the stores. It shows nothing about
 * the ledger, so the page needs no database read and has nothing to inject;
 * the app looks the invite up itself.
 */
export function invitePage(code: string): Response {
  if (!INVITE_CODE.test(code)) return new Response('Not found', { status: 404 });
  const deepLink = `money2time://join/${code}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Join a shared ledger · Money2Time</title>
<style>
  :root { color-scheme: light dark; --bg: #fff8ef; --card: #ffffff; --text: #2b2118; --muted: #7a6a5c; --accent: #f08a24; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1b1612; --card: #26201a; --text: #f6efe7; --muted: #b5a493; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 380px; background: var(--card); border-radius: 28px; padding: 32px 24px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 24px; color: var(--muted); }
  a.button { display: block; padding: 14px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; margin-bottom: 12px; }
  a.store { display: inline-block; margin: 4px 8px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>You're invited to a shared ledger</h1>
  <p>Open the link in Money2Time to join.</p>
  <a class="button" href="${deepLink}">Open in Money2Time</a>
  <div>Don't have the app?<br>
    <a class="store" href="${APP_STORE_URL}">App Store</a>
    <a class="store" href="${PLAY_STORE_URL}">Google Play</a>
  </div>
</main>
<script>setTimeout(function () { location.href = ${JSON.stringify(deepLink)}; }, 300);</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'X-Frame-Options': 'DENY',
    },
  });
}
