import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { androidSessions, androidIconPath, uploadAndroidIcon } from '../../_lib';

/**
 * Put the app icon on one Play listing, inside the open edit.
 *
 * One request per locale rather than one for all of them: Play keeps the icon
 * per listing, there are thirty-odd of them, and a single request that took a
 * minute would have nothing to report while it ran.
 *
 * Nothing is staged. The screenshot routes stage because the browser hands
 * them base64 that has to reach disk before a CLI can see it; the icon is
 * already a file in the repo, and copying it per request would only race the
 * other requests reading the copy.
 */
export async function POST(req: NextRequest) {
  const { sessionId, playLocale } = await req.json() as {
    sessionId: string;
    playLocale: string;
  };

  const session = androidSessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'No such edit session. Start a new upload.' }, { status: 410 });
  }

  const file = androidIconPath();
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: `No app icon at ${file}` }, { status: 500 });
  }

  try {
    await uploadAndroidIcon({ playLocale, file, editId: session.editId });
    console.log(`[Android] icon → ${playLocale}`);
    return NextResponse.json({ ok: true, playLocale });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Android icon] ${playLocale}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
