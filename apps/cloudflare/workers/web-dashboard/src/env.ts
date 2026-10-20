import type { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** Connections one address may open per minute. */
  CONNECT_LIMITER: RateLimit;
  /** Browser origins allowed to open a room (the web dashboard). */
  ALLOWED_ORIGINS: string;
}
