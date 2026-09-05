export type ReportType = "vrt" | "playwright";
export type ReportBranch = "develop" | "main";
export interface ReportTarget {
  reportType: ReportType;
  pullRequest: number | null;
  sourceBranch: ReportBranch | null;
}
export interface ReportTargetInput {
  reportType: ReportType;
  pullRequest?: number | string | null;
  sourceBranch?: ReportBranch | null;
}
export interface BaselineMetadata {
  key: string;
  checksum: string;
  imageCount: number;
  bytes: number;
}
export interface ReportManifest extends ReportTarget {
  schemaVersion: 1;
  sourceRepository: string;
  sourceSha: string;
  runId: number;
  runAttempt: number;
  updatedAt: string;
  reportPrefix: string;
  fileCount: number;
  bytes: number;
  baseline?: BaselineMetadata;
}
export interface StoreObject {
  key: string;
  bytes: number;
  lastModified: Date;
}
export interface StorePutOptions {
  contentType?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  metadata?: Record<string, string>;
}
export interface ReportStore {
  publicBaseUrl: string;
  get(key: string): Promise<{ body: Uint8Array; etag: string; lastModified?: Date } | null>;
  head(
    key: string,
  ): Promise<{ bytes: number; etag: string; metadata: Record<string, string>; lastModified?: Date } | null>;
  put(key: string, body: Uint8Array, options?: StorePutOptions): Promise<{ etag: string }>;
  list(prefix: string): Promise<StoreObject[]>;
  delete(keys: string[]): Promise<number>;
}
export const SOURCE_REPOSITORY: string;
export const RETENTION_MS: number;
export class R2ConfigurationError extends Error {
  constructor(message: string);
}
export class ReportStoreConflictError extends Error {
  constructor();
}
export function positiveInteger(value: unknown, label: string): number;
export function normalizeReportTarget(input: ReportTargetInput): ReportTarget;
export function reportTargetPaths(input: ReportTargetInput): {
  reportRoot: string;
  manifestKey: string;
  baselineRoot: string | null;
  retiredRoot: string | null;
};
export function validateReportManifest(value: unknown, target?: ReportTargetInput): ReportManifest;
export function safeObjectKey(key: string, options?: { prefix?: boolean }): string;
export function publicReportUrl(baseUrl: string, key: string): string;
export function validatePublicBaseUrl(value: string): string;
export function readR2Configuration(env?: Record<string, string | undefined>): {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};
export function createR2ReportStore(
  env?: Record<string, string | undefined>,
  options?: {
    client?: Pick<import("@aws-sdk/client-s3").S3Client, "send">;
  },
): ReportStore;
export function readReportManifest(
  store: ReportStore,
  target: ReportTargetInput,
): Promise<{ manifest: ReportManifest; etag: string } | null>;
