import { NextRequest, NextResponse } from 'next/server';
import {
  androidReady, androidEditCreate, androidEditDelete, androidListingLocales,
  androidSessions, ANDROID_IMAGE_TYPES,
} from '../../_lib';

/**
 * Opens a Play edit and hands back a session id. Every locale in the run goes
 * into that one edit, and /commit closes it.
 *
 * An icon run also gets the listings to write to, read from this same edit.
 * Play keeps one edit per app and creating a second invalidates the first, so
 * a separate "which locales?" call would quietly kill the edit it was opened
 * alongside.
 */
export async function POST(req: NextRequest) {
  const ready = await androidReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const { device } = await req.json() as { device: string };
  if (!ANDROID_IMAGE_TYPES[device]?.length) {
    return NextResponse.json({ error: `Unknown device: ${device}` }, { status: 400 });
  }

  try {
    const editId = await androidEditCreate();
    const sessionId = `android-${editId}`;
    androidSessions.set(sessionId, { editId, device });
    console.log(`[Android] edit ${editId} opened (${device})`);

    try {
      const locales = device === 'icon' ? await androidListingLocales(editId) : undefined;
      return NextResponse.json({ sessionId, editId, ...(locales ? { locales } : {}) });
    } catch (err) {
      // The client is never told this session exists, so the edit it opened
      // would sit there unreferenced. Discard it rather than leave it to be
      // superseded by whatever opens an edit next.
      androidSessions.delete(sessionId);
      await androidEditDelete(editId);
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Android start]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
