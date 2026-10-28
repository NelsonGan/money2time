// Small HTTP helpers shared by the routes.

/** Request bodies the API accepts are a few fields; anything larger is refused unread. */
const MAX_JSON_BYTES = 8 * 1024;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** The parsed JSON body, or null when it is missing, too large or not JSON. */
export async function readJson<T>(request: Request): Promise<Partial<T> | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_JSON_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_JSON_BYTES) return null;
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Partial<T>) : null;
  } catch {
    return null;
  }
}
