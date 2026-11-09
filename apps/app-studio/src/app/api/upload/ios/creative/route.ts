import { NextRequest, NextResponse } from 'next/server';
import { readCreativeRequest } from '@/data/creativeRequest';
import { iosReady } from '../../_lib';
import { resumeIOSCreative, uploadIOSCreative, validateCreativeResume, validateCreativeUpload } from '@/data/storeCreativeUpload.mjs';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Upload from the Studio on this server.' }, { status: 403 });
  }
  let input;
  let resuming = false;
  try {
    input = await readCreativeRequest(request);
    resuming = !!input && Object.hasOwn(input, 'resumeToken');
    if (resuming) validateCreativeResume(input);
    else validateCreativeUpload(input);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid creative upload.' }, { status: 400 });
  }
  const ready = await iosReady();
  if (!ready.ok) return NextResponse.json({ error: ready.why ?? 'App Store uploads are not configured.' }, { status: 503 });
  try {
    const result = resuming ? await resumeIOSCreative(input) : await uploadIOSCreative(input);
    // Locale failures are a completed batch result; preserve its successes and
    // recovery reference for the caller instead of discarding them in an error.
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    const resumeToken = error && typeof error === 'object' && 'resumeToken' in error ? error.resumeToken : undefined;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'App Store upload failed.', resumeToken }, { status: 502 });
  }
}
