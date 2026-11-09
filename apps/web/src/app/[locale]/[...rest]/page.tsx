import { notFound } from "next/navigation";

/**
 * Any path under a locale that no page claims, so it gets the site's own
 * `not-found.tsx` in the visitor's language rather than the framework's bare
 * 404. Still a 404.
 */
export default function CatchAll() {
  notFound();
}
