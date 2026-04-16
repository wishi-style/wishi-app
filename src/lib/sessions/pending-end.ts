export interface PendingEndInput {
  moodboardsSent: number;
  moodboardsAllowed: number;
  styleboardsSent: number;
  styleboardsAllowed: number;
  bonusBoardsGranted: number;
}

/**
 * Pure boolean: has the stylist delivered everything the plan promises?
 * Revisions don't count against the allowance — they consume a bonus slot
 * that was added on rate-with-REVISE.
 */
export function isReadyForPendingEnd(input: PendingEndInput): boolean {
  const {
    moodboardsSent,
    moodboardsAllowed,
    styleboardsSent,
    styleboardsAllowed,
    bonusBoardsGranted,
  } = input;
  const moodboardDone = moodboardsSent >= moodboardsAllowed;
  const totalLooksAllowed = styleboardsAllowed + bonusBoardsGranted;
  const styleboardsDone = styleboardsSent >= totalLooksAllowed;
  return moodboardDone && styleboardsDone;
}
