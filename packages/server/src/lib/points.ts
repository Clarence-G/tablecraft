/**
 * Point values for each ledger reason. All values are non-negative (ledger is
 * append-only and "only-goes-up" per spec §1.2). Adjust here; no need to
 * migrate rows — historical rows keep their at-that-time value.
 */
export const POINTS = {
  win: 10,
  draw: 3,
  loss: 0,
  daily_checkin: 5,
} as const;

export type PointsReason = keyof typeof POINTS;

export function pointsFor(reason: PointsReason): number {
  return POINTS[reason];
}
