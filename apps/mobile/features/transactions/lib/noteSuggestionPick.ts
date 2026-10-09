/**
 * Reconciling a note-suggestion pick with the text change that can follow it.
 *
 * Picking a suggestion sets the note and blurs the input. On a composing
 * keyboard (Pinyin, Japanese, Korean) the field can still hold marked text at
 * that moment, and the blur commits it — which fires one more `onChangeText`
 * carrying the half-typed text, a beat *after* the pick. Applied naively that
 * change walks the pick back to what the user was typing, so the tap reads as
 * "nothing happened" until they pick again with nothing in composition.
 *
 * The pick is therefore latched, and the first change that disagrees with it is
 * treated as that commit and dropped.
 */
export type NoteChangeResolution =
  /** Ordinary typing: take the text and look suggestions up for it. */
  | { kind: 'apply'; note: string }
  /** The IME's commit of text the pick replaced: keep the pick, look nothing up. */
  | { kind: 'keepPick'; note: string };

export function resolveNoteChange(
  nextNote: string,
  pickedNote: string | null,
): NoteChangeResolution {
  if (pickedNote !== null && nextNote !== pickedNote) {
    return { kind: 'keepPick', note: pickedNote };
  }
  return { kind: 'apply', note: nextNote };
}
