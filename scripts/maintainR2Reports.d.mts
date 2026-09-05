import type { ReportStore, ReportTarget, ReportTargetInput } from "./hostedReportStore.mjs";
export type VerifyCleanupSource = (target: ReportTarget) => Promise<{ status: "open" | "closed" }>;
export interface MaintainResult {
  status: "pruned" | "open" | "closed";
  deletedFiles: number;
}
export function discoverReportTargets(store: ReportStore): Promise<ReportTarget[]>;
export function deleteClosedReport(
  input: ReportTargetInput,
  options: { store: ReportStore; verifySource: VerifyCleanupSource },
): Promise<MaintainResult>;
export function maintainR2Reports(
  input: ReportTargetInput,
  options: { store: ReportStore; verifySource?: VerifyCleanupSource; now?: Date },
): Promise<MaintainResult>;
export function recordRetiredBaseline(
  store: ReportStore,
  target: ReportTargetInput,
  baselineKey: string,
  now?: Date,
): Promise<{ schemaVersion: 1; baselineKey: string; retiredAt: string }>;
