import { NextRequest, NextResponse } from 'next/server';
import { androidReady, androidTracks, uploadAndroidReleaseNotes } from '../../_lib';

/**
 * Which tracks the release note could go on.
 *
 * Only tracks that already have a release: a release note belongs to a
 * release, so an empty track has nowhere to put one.
 */
export async function GET() {
  const ready = await androidReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  try {
    return NextResponse.json({ tracks: await androidTracks() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Set the release note on every release in one track, in every locale. */
export async function POST(req: NextRequest) {
  const ready = await androidReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const { localizations, track } = await req.json() as {
    localizations: Record<string, { whatsNew?: string }>;
    track: string;
  };

  if (!track) return NextResponse.json({ error: 'No track given' }, { status: 400 });

  try {
    const result = await uploadAndroidReleaseNotes({
      track,
      localizations,
      log: (line: string) => console.log(`[Android notes] ${line}`),
    });

    return NextResponse.json({
      ok: !result.errors.length,
      track,
      updated: result.byLocale,
      count: result.updated.length,
      ...(result.errors.length ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Android notes]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
