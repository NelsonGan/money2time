// Telling a dropped connection from a real failure in the Turso engine's
// errors, which carry no code: only the message of the JavaScript IO that
// failed (`@tursodatabase/sync-react-native` src/internal/ioProcessor.ts,
// patched so a lost response reads "HTTP response failed (network error)").

/** Whether a Turso engine error message means the phone is offline. */
export function isOfflineMessage(message: string): boolean {
  return /network|fetch|offline|timed out|abort/i.test(message);
}
