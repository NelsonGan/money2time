import { NextRequest, NextResponse } from 'next/server';
import { androidSessions, androidEditCommit, androidEditDelete } from '../../_lib';

/**
 * Commits the edit, which is what makes everything uploaded during the session
 * show up in Play Console as a draft. A failed commit discards the edit rather
 * than leaving it open.
 */
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };

  const session = androidSessions.get(sessionId);
  if (!session) return NextResponse.json({ error: 'No such edit session.' }, { status: 410 });

  try {
    await androidEditCommit(session.editId);
    androidSessions.delete(sessionId);
    console.log(`[Android] edit ${session.editId} committed`);
    return NextResponse.json({ ok: true, editId: session.editId });
  } catch (err) {
    await androidEditDelete(session.editId);
    androidSessions.delete(sessionId);
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Android commit]', msg);
    return NextResponse.json({ error: `${msg} (edit discarded)` }, { status: 500 });
  }
}
