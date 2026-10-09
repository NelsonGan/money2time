interface PeriodPagerCommit {
  renderedIndex: number;
  committedIndex: number;
  targetIndex: number;
}

export function getPeriodPagerCommitSteps({
  renderedIndex,
  committedIndex,
  targetIndex,
}: PeriodPagerCommit): number | null {
  // The date used to shift periods belongs to renderedIndex. The imperative
  // committedIndex can advance several times before that date renders again.
  return targetIndex === committedIndex ? null : targetIndex - renderedIndex;
}
