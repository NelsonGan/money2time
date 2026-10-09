import { useEffect, useMemo, useRef } from 'react';

interface UsePersistedJsonSnapshotOptions<TSnapshot, TParsed> {
  isLoading: boolean;
  storedJson: string | null;
  snapshot: TSnapshot;
  parseStoredJson: (rawValue: string | null) => TParsed | null;
  applyParsedSnapshot: (value: TParsed) => void;
  writeStoredJson: (value: string | null) => void;
}

/**
 * Reusable persisted JSON state bridge.
 * Hydrates once from storage, then writes any in-memory snapshot changes back.
 */
export function usePersistedJsonSnapshot<TSnapshot, TParsed>({
  isLoading,
  storedJson,
  snapshot,
  parseStoredJson,
  applyParsedSnapshot,
  writeStoredJson,
}: UsePersistedJsonSnapshotOptions<TSnapshot, TParsed>) {
  const hasHydratedRef = useRef(false);
  const persistedJsonRef = useRef<string | null>(null);
  // Set while the hydrated values are still on their way into state.
  const hydrationPendingRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    persistedJsonRef.current = storedJson;

    const parsed = parseStoredJson(storedJson);
    if (parsed) {
      applyParsedSnapshot(parsed);
      hydrationPendingRef.current = true;
    }
  }, [applyParsedSnapshot, isLoading, parseStoredJson, storedJson]);

  const serializedSnapshot = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  useEffect(() => {
    if (isLoading || !hasHydratedRef.current) return;
    if (hydrationPendingRef.current) {
      // This runs in the same pass as the hydration above, so `snapshot` is
      // still the defaults the screen mounted with. Writing it would save the
      // defaults over the stored preferences (and re-render every app consumer)
      // only for the next render to write the hydrated values back again.
      hydrationPendingRef.current = false;
      return;
    }
    if (persistedJsonRef.current === serializedSnapshot) return;
    persistedJsonRef.current = serializedSnapshot;
    writeStoredJson(serializedSnapshot);
  }, [isLoading, serializedSnapshot, writeStoredJson]);
}
