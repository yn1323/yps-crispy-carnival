export type ReportType = "playwright" | "vrt";

export interface PublishRequest {
  repository: string;
  source: string;
  target: string;
  reportType: ReportType;
  pullRequest?: number | string | null;
  sourceBranch?: "develop" | "main" | null;
  sourceSha: string;
  runId: number | string;
  runAttempt: number | string;
  updatedAt?: string;
  branch?: string;
  baselineSource?: string | null;
  baselineTarget?: string | null;
}

export interface NormalizedPublishRequest
  extends Omit<PublishRequest, "pullRequest" | "runId" | "runAttempt" | "updatedAt"> {
  pullRequest: number | null;
  sourceBranch: "develop" | "main" | null;
  runId: number;
  runAttempt: number;
  updatedAt: string;
  branch: string;
  baselineSource: string | null;
  baselineTarget: string | null;
  markerName: string;
}

export interface PublishResult {
  status: "published" | "noop" | "stale";
  commit: string;
  markerName: string;
  reason?: string;
}

export interface PublishOptions {
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  verifyBeforePush?: () => boolean | Promise<boolean>;
  beforePush?: (value: { attempt: number; observed: string; commit: string }) => void | Promise<void>;
}

export const SOURCE_REPOSITORY: string;
export const HOSTING_REPOSITORY: string;
export const REPORT_BRANCH: string;

export function normalizePublishRequest(input: PublishRequest | NormalizedPublishRequest): NormalizedPublishRequest;
export function comparePublishedRun(
  existing: Record<string, unknown> | null,
  incoming: NormalizedPublishRequest,
): "newer" | "same" | "stale";
export function publishReportSnapshot(
  input: PublishRequest | NormalizedPublishRequest,
  options?: PublishOptions,
): Promise<PublishResult>;
export function verifyCurrentSource(input: {
  token: string;
  sourceSha: string;
  pullRequest: number | null;
  sourceBranch: "develop" | "main" | null;
  fetchImpl?: typeof fetch;
}): Promise<{ current: boolean; currentSha: string | null }>;
export function dispatchPagesDeployment(input: {
  token: string;
  reportCommit: string;
  target: string;
  markerName: string;
  fetchImpl?: typeof fetch;
}): Promise<void>;
