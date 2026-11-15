/**
 * The header every write to the album site's API carries (`/api/*`,
 * `server.ts`): a form or script on another site cannot send it, so the
 * server refuses any write without it. Its own module, so the page's bundle
 * does not pull in the server's code.
 */
export const CSRF_HEADER = "x-m2t-album";
