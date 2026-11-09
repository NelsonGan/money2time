import { NextRequest, NextResponse } from 'next/server';
import { iosReady, uploadIOSDescription } from '../../_lib';
import { runWithConcurrency } from '@/utils/concurrency';

interface DescriptionPayload {
  name?: string;
  subtitle?: string;
  privacyPolicyUrl?: string;
  privacyChoicesUrl?: string;
  privacyPolicyText?: string;
  description?: string;
  whatsNew?: string;
  keywords?: string;
  supportUrl?: string;
  marketingUrl?: string;
}

/**
 * `asc` is a separate process per call, so this is bounded rather than let
 * loose across 23 locales at once.
 */
const CONCURRENCY = 4;

export async function POST(req: NextRequest) {
  const ready = await iosReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why }, { status: 503 });

  const { localizations } = await req.json() as {
    localizations: Record<string, DescriptionPayload>;
  };

  try {
    const entries = Object.entries(localizations);
    const results = await runWithConcurrency(entries, CONCURRENCY, async ([locale, copy]) => {
      const res = await uploadIOSDescription({
        locale, copy, log: (line: string) => console.log(`[iOS desc] ${line}`),
      });
      if (!res.skipped) console.log(`[iOS desc] ${locale} → ${res.updated.join(', ')}`);
      return { locale, res };
    });

    const updated: Record<string, string[]> = {};
    const errors: string[] = [];
    // The same note comes back from every locale, so it is said once.
    const notes = new Set<string>();
    let version: string | undefined;

    for (const { locale, res } of results) {
      if (res.skipped) continue;
      version = res.version;
      if (res.updated.length) updated[locale] = res.updated;
      for (const e of res.errors) errors.push(`${locale} ${e}`);
      for (const n of res.notes ?? []) notes.add(n);
    }

    return NextResponse.json({
      ok: true,
      version,
      updated,
      ...(notes.size ? { notes: [...notes] } : {}),
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[iOS descriptions]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
