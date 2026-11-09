import { NextRequest, NextResponse } from 'next/server';
import { renderSearchVideo } from '@/data/creativeVideo.mjs';
import { readCreativeRequest } from '@/data/creativeRequest';
import { localOnly } from '@/app/api/_guard';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(request: NextRequest) {
  const refused = localOnly(request);
  if (refused) return refused;
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({error:'Render from the Studio on this server.'},{status:403});
  let input;
  try { input = await readCreativeRequest(request); }
  catch (error) { return NextResponse.json({error:error instanceof Error?error.message:'Invalid payment artwork.'},{status:400}); }
  try {
    const video = await renderSearchVideo(input);
    return new NextResponse(new Uint8Array(video),{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store','Content-Disposition':'attachment; filename="money2time-app-store-search.mp4"'}});
  } catch (error) { return NextResponse.json({error:error instanceof Error?error.message:'Could not render the Search video.'},{status:500}); }
}
