import type { EventMetricTotalDto, ServiceSnapshotDto } from "@/api/analyticsTypes";

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (!numerator || !denominator) return null;
  return numerator / denominator;
}

export function latestLineLinkedRate(snapshot: ServiceSnapshotDto | null) {
  if (!snapshot) return null;
  return ratio(snapshot.lineLinkedStaffCount, snapshot.shiftTargetStaffCount);
}

export function latestLineFollowingRate(snapshot: ServiceSnapshotDto | null) {
  if (!snapshot) return null;
  return ratio(snapshot.lineFollowingStaffCount, snapshot.lineLinkedStaffCount);
}

export function eventTotal(totals: EventMetricTotalDto[], metric: string) {
  return totals.find((total) => total.metric === metric)?.count ?? 0;
}

export function eventValueSum(totals: EventMetricTotalDto[], metric: string) {
  return totals.find((total) => total.metric === metric)?.valueSum ?? null;
}
