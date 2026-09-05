import type { ReportManifest, ReportStore, ReportTarget, ReportTargetInput } from "./hostedReportStore.mjs";

export type { ReportType } from "./hostedReportStore.mjs";
export { SOURCE_REPOSITORY } from "./hostedReportStore.mjs";
export interface PublishRequest extends ReportTargetInput {
  source: string;
  sourceSha: string;
  sourceRepository?: string;
  runId: number | string;
  runAttempt: number | string;
  updatedAt?: string;
  baselineArchive?: { path: string; checksum: string; imageCount: number; bytes: number } | null;
}
export interface NormalizedPublishRequest extends ReportTarget {
  source: string;
  sourceSha: string;
  runId: number;
  runAttempt: number;
  updatedAt: string;
  baselineArchive: { path: string; checksum: string; imageCount: number; bytes: number } | null;
}
export interface PublishResult {
  status: "published" | "noop" | "stale" | "closed";
  reportUrl: string;
  manifest: ReportManifest | null;
  uploadedFiles: number;
  uploadedBytes: number;
  deletedFiles: number;
  warnings: string[];
}
export function normalizePublishRequest(input: PublishRequest): NormalizedPublishRequest;
export function comparePublishedRun(
  existing: ReportManifest | null | undefined,
  incoming: NormalizedPublishRequest,
): "newer" | "same" | "stale";
export function publishHostedReport(
  input: PublishRequest,
  options: {
    store: ReportStore;
    verifySource: (request: NormalizedPublishRequest) => Promise<{ status: "current" | "stale" | "closed" }>;
    afterCommit?: (manifest: ReportManifest, reportUrl: string) => Promise<void>;
    now?: () => Date;
  },
): Promise<PublishResult>;
