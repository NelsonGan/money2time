import { NextRequest, NextResponse } from 'next/server';
import { iosReady, stageLocale, stagingDir, uploadIOSLocale } from '../_lib';
import { localOnly } from '@/app/api/_guard';

/** Stage one locale's screenshots on disk, then hand them to `asc`. */
export async function POST(req: NextRequest) {
  const refused = localOnly(req);
  if (refused) return refused;
  const ready = await iosReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const { device, locale, screenshots } = await req.json() as {
    device: string;
    locale: string;
    screenshots: Array<{ filename: string; data: string }>;
  };

  try {
    const dir = stageLocale(stagingDir('ios', device), locale, screenshots);
    const log: string[] = [];
    const result = await uploadIOSLocale({
      device, locale, dir, log: (line: string) => { console.log(`[iOS] ${line}`); log.push(line); },
    });

    if (result.skipped) {
      return NextResponse.json({ skipped: true, reason: result.reason });
    }

    // Nothing reached the store: that is a failure, whatever the reason, and
    // reporting it as one is the only way the studio can say so.
    if (!result.uploaded.length && result.errors.length) {
      console.error(`[iOS] ${locale} failed: ${result.errors.join('; ')}`);
      return NextResponse.json({ error: result.errors.join('; ') }, { status: 502 });
    }

    console.log(`[iOS] ${locale} → ${result.uploaded.join(', ')} (v${result.version})`);
    return NextResponse.json({
      ok: true,
      locale,
      uploaded: result.uploaded,
      count: screenshots.length,
      version: result.version,
      ...(result.errors.length ? { errors: result.errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[iOS upload]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
