import { NextResponse } from 'next/server';
import { iosReady, androidReady } from '../upload/_lib';

/** What the sidebar's status dot reads. */
export async function GET() {
  const [ios, android] = await Promise.all([iosReady(), androidReady()]);
  return NextResponse.json({
    ok: true,
    ios: ios.ok,
    android: android.ok,
    detail: {
      ios: ios.ok ? ios.detail : ios.why,
      android: android.ok ? android.detail : android.why,
    },
  });
}
