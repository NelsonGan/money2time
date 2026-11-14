import { env } from "cloudflare:workers";

import { handleAlbumApi, type Upstream } from "@/lib/album/server";
import { isAlbumHost } from "@/lib/platform";

/**
 * The shared-album website's API, on album.money2time.com only
 * (`src/lib/album/server.ts`). It reaches the cloud-sync Worker over the
 * `CLOUD_SYNC` service binding; in development, `NEXT_PUBLIC_CLOUD_SYNC_URL`
 * points it at a local `wrangler dev` instead.
 */
const CLOUD_SYNC_ORIGIN = "https://workers-cloud-sync.money2time.com";

const upstream: Upstream = (path, init) => {
  const devOrigin = process.env.NEXT_PUBLIC_CLOUD_SYNC_URL;
  if (devOrigin) return fetch(`${devOrigin}${path}`, init);
  const binding = (env as { CLOUD_SYNC?: Fetcher }).CLOUD_SYNC;
  const request = new Request(`${CLOUD_SYNC_ORIGIN}${path}`, init);
  return binding ? binding.fetch(request) : fetch(request);
};

async function handle(request: Request): Promise<Response> {
  const host = (request.headers.get("host") ?? new URL(request.url).host).split(":")[0];
  if (!isAlbumHost(host)) return new Response("Not found", { status: 404 });
  try {
    return await handleAlbumApi(request, upstream);
  } catch (error) {
    console.error("[album-api]", new URL(request.url).pathname, error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "network" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
