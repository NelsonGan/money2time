import { NextRequest, NextResponse } from 'next/server';
import { androidReady, stagingDir, uploadAndroidDescriptions } from '../../_lib';

interface DescriptionPayload {
  name?: string;
  /** Play's short description, which is the App Store subtitle. */
  subtitle?: string;
  description?: string;
}

/**
 * Writes every locale's listing as the Fastlane-shaped files `gplay metadata
 * push` reads, then pushes them in one edit.
 *
 * Release notes are deliberately not written: on Play they belong to a release
 * inside a track, not to the listing, so setting them means naming a track and
 * a version code this tool has no business guessing.
 */
export async function POST(req: NextRequest) {
  const ready = await androidReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const { localizations } = await req.json() as {
    localizations: Record<string, DescriptionPayload>;
  };

  try {
    const result = await uploadAndroidDescriptions({
      root: stagingDir('android', 'metadata'),
      localizations,
      log: (line: string) => console.log(`[Android desc] ${line}`),
    });

    return NextResponse.json({
      ok: true,
      updated: result.byLocale,
      count: result.updated.length,
      ...(result.errors.length ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Android descriptions]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
