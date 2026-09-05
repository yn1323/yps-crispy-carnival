import type { ReportStore } from "./hostedReportStore.mjs";
export type GitHubApi = (resource: string, options?: { method?: string; body?: string }) => Promise<unknown>;
export type SourceRequest = {
  reportType: "vrt" | "playwright";
  pullRequest: number | null;
  sourceBranch: string | null;
  sourceSha: string;
  runId: number;
  runAttempt: number;
};
export function githubClient(token?: string, fetchImpl?: typeof fetch): GitHubApi;
export function requestFromEvent(
  event: unknown,
  env: Record<string, string>,
  reportType: "vrt" | "playwright",
): SourceRequest;
export function resultSummary(reportType: "vrt" | "playwright", result: unknown, testResult?: string): string;
export function verifyGitHubSource(
  request: SourceRequest,
  api: GitHubApi,
  options?: { bootstrap?: boolean },
): Promise<{ status: "current" | "stale" | "closed" }>;
export function checkPublicObject(
  url: string,
  options?: {
    expected?: string;
    missing?: boolean;
    fetchImpl?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
  },
): Promise<void>;
export function preflight(
  store: ReportStore,
  options?: { fetchImpl?: typeof fetch; sleep?: (milliseconds: number) => Promise<void> },
): Promise<{ status: "verified" }>;
export function commentOnReport(
  request: SourceRequest,
  reportUrl: string,
  api: GitHubApi,
  options?: { summary?: string },
): Promise<void>;
export function main(args?: string[]): Promise<object>;
