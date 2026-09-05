import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const SOURCE_REPOSITORY = "yn1323/yps-crispy-carnival";
export const RETENTION_MS = 24 * 60 * 60 * 1_000;

export class R2ConfigurationError extends Error {
  constructor(message) {
    super(`R2_CONFIGURATION_ERROR: ${message}`);
    this.name = "R2ConfigurationError";
  }
}

export class ReportStoreConflictError extends Error {
  constructor() {
    super("Report object changed during a conditional write");
    this.name = "ReportStoreConflictError";
  }
}

export function positiveInteger(value, label) {
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`Invalid ${label}`);
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) throw new Error(`Invalid ${label}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${label}`);
  return number;
}

export function normalizeReportTarget(input) {
  if (!["vrt", "playwright"].includes(input.reportType)) throw new Error("Invalid report type");
  const pullRequest =
    input.pullRequest == null || input.pullRequest === "" ? null : positiveInteger(input.pullRequest, "pull request");
  const sourceBranch = input.sourceBranch || null;
  if ((pullRequest === null) === (sourceBranch === null)) {
    throw new Error("Exactly one of pullRequest or sourceBranch is required");
  }
  if (sourceBranch !== null && (input.reportType !== "vrt" || !["develop", "main"].includes(sourceBranch))) {
    throw new Error("Only develop/main VRT reports have branch targets");
  }
  return { reportType: input.reportType, pullRequest, sourceBranch };
}

export function reportTargetPaths(input) {
  const target = normalizeReportTarget(input);
  const relative =
    target.pullRequest === null
      ? `vrt/branches/${target.sourceBranch}`
      : `${target.reportType}/pr-${target.pullRequest}`;
  return {
    reportRoot: `${relative}/`,
    manifestKey: `state/${relative}.json`,
    baselineRoot: target.sourceBranch === null ? null : `baselines/${target.sourceBranch}/`,
    retiredRoot: target.sourceBranch === null ? null : `state/${relative}/retired/`,
  };
}

export function validateReportManifest(value, target) {
  const normalized = normalizeReportTarget(target ?? value);
  const fields = [
    "schemaVersion",
    "sourceRepository",
    "reportType",
    "pullRequest",
    "sourceBranch",
    "sourceSha",
    "runId",
    "runAttempt",
    "updatedAt",
    "reportPrefix",
    "fileCount",
    "bytes",
    "baseline",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  ) {
    throw new Error("Invalid report manifest");
  }
  if (
    value.schemaVersion !== 1 ||
    value.sourceRepository !== SOURCE_REPOSITORY ||
    value.reportType !== normalized.reportType ||
    value.pullRequest !== normalized.pullRequest ||
    value.sourceBranch !== normalized.sourceBranch ||
    !/^[0-9a-f]{40}$/.test(value.sourceSha ?? "") ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw new Error("Report manifest does not match its source");
  const runId = positiveInteger(value.runId, "manifest run ID");
  const runAttempt = positiveInteger(value.runAttempt, "manifest run attempt");
  if (runId !== value.runId || runAttempt !== value.runAttempt)
    throw new Error("Manifest run identity must be numeric");
  if (
    positiveInteger(value.fileCount, "manifest file count") !== value.fileCount ||
    positiveInteger(value.bytes, "manifest bytes") !== value.bytes
  )
    throw new Error("Manifest counts must be numeric");
  const paths = reportTargetPaths(normalized);
  if (value.reportPrefix !== `${paths.reportRoot}${runId}-${runAttempt}/`)
    throw new Error("Invalid manifest report prefix");
  if (normalized.sourceBranch !== null) {
    const baseline = value.baseline;
    if (
      !baseline ||
      baseline.key !== `${paths.baselineRoot}${runId}-${runAttempt}.zip` ||
      !/^[0-9a-f]{64}$/.test(baseline.checksum ?? "") ||
      Object.keys(baseline).some((key) => !["key", "checksum", "imageCount", "bytes"].includes(key))
    ) {
      throw new Error("Branch manifest requires its own complete baseline");
    }
    if (
      positiveInteger(baseline.imageCount, "baseline image count") !== baseline.imageCount ||
      positiveInteger(baseline.bytes, "baseline bytes") !== baseline.bytes
    )
      throw new Error("Baseline counts must be numeric");
  } else if (value.baseline !== undefined) throw new Error("PR manifests cannot update baselines");
  return value;
}

export function safeObjectKey(key, { prefix = false } = {}) {
  if (typeof key !== "string" || !key || key.startsWith("/") || key.includes("\\") || /\p{Cc}/u.test(key)) {
    throw new Error("Invalid report object path");
  }
  const segments = (prefix && key.endsWith("/") ? key.slice(0, -1) : key).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    throw new Error("Invalid report object path");
  return key;
}

export function publicReportUrl(baseUrl, key) {
  safeObjectKey(key);
  return `${validatePublicBaseUrl(baseUrl)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function validatePublicBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new R2ConfigurationError("REPORT_PUBLIC_BASE_URL must be an HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !parsed.hostname.includes(".") ||
    parsed.hostname.endsWith(".r2.cloudflarestorage.com") ||
    /^[\d.]+$/.test(parsed.hostname)
  ) {
    throw new R2ConfigurationError("REPORT_PUBLIC_BASE_URL must be an HTTPS origin");
  }
  return parsed.origin;
}

export function readR2Configuration(env = process.env) {
  for (const name of [
    "REPORT_R2_ENDPOINT",
    "REPORT_R2_PUBLIC_BUCKET",
    "REPORT_PUBLIC_BASE_URL",
    "REPORT_R2_ACCESS_KEY_ID",
    "REPORT_R2_SECRET_ACCESS_KEY",
  ]) {
    if (typeof env[name] !== "string" || !env[name].trim()) throw new R2ConfigurationError(`${name} is required`);
  }
  if (!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/.test(env.REPORT_R2_ENDPOINT)) {
    throw new R2ConfigurationError("REPORT_R2_ENDPOINT must be the account S3 API endpoint without a bucket path");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.REPORT_R2_PUBLIC_BUCKET)) {
    throw new R2ConfigurationError("REPORT_R2_PUBLIC_BUCKET must be a bucket name");
  }
  return {
    endpoint: env.REPORT_R2_ENDPOINT.replace(/\/$/, ""),
    bucket: env.REPORT_R2_PUBLIC_BUCKET,
    publicBaseUrl: validatePublicBaseUrl(env.REPORT_PUBLIC_BASE_URL),
    accessKeyId: env.REPORT_R2_ACCESS_KEY_ID,
    secretAccessKey: env.REPORT_R2_SECRET_ACCESS_KEY,
  };
}

export function createR2ReportStore(env = process.env, { client } = {}) {
  const configuration = readR2Configuration(env);
  const s3 =
    client ??
    new S3Client({
      endpoint: configuration.endpoint,
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 30_000 },
    });
  const send = async (command, { missing = false } = {}) => {
    try {
      return await s3.send(command);
    } catch (error) {
      const status = error.$metadata?.httpStatusCode;
      if (status === 412 || error.name === "PreconditionFailed") throw new ReportStoreConflictError();
      if (
        [
          "NoSuchBucket",
          "InvalidAccessKeyId",
          "SignatureDoesNotMatch",
          "AccessDenied",
          "InvalidToken",
          "ExpiredToken",
        ].includes(error.name) ||
        status === 401 ||
        status === 403
      )
        throw new R2ConfigurationError("Check the R2 endpoint, bucket, access keys, and bucket read/write permission");
      if (missing && (status === 404 || ["NoSuchKey", "NotFound"].includes(error.name))) return null;
      throw new Error(
        `R2 ${command.constructor.name.replace("Command", "")} failed${Number.isInteger(status) ? ` (HTTP ${status})` : ""}`,
      );
    }
  };
  return {
    publicBaseUrl: configuration.publicBaseUrl,
    async get(key) {
      const result = await send(new GetObjectCommand({ Bucket: configuration.bucket, Key: safeObjectKey(key) }), {
        missing: true,
      });
      if (!result) return null;
      if (
        !result.ETag ||
        !result.Body ||
        !Number.isSafeInteger(result.ContentLength) ||
        result.ContentLength < 0 ||
        result.ContentLength > 128 * 1024
      )
        throw new Error("Invalid or oversized report metadata response");
      const body = await result.Body.transformToByteArray();
      if (body.length > 128 * 1024) throw new Error("Oversized report metadata response");
      return { body, etag: result.ETag, lastModified: result.LastModified };
    },
    async head(key) {
      const result = await send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: safeObjectKey(key) }), {
        missing: true,
      });
      return result
        ? {
            bytes: result.ContentLength,
            etag: result.ETag,
            metadata: result.Metadata ?? {},
            lastModified: result.LastModified,
          }
        : null;
    },
    async put(key, body, options = {}) {
      const contents = Buffer.from(body);
      const result = await send(
        new PutObjectCommand({
          Bucket: configuration.bucket,
          Key: safeObjectKey(key),
          Body: contents,
          ContentType: options.contentType ?? "application/octet-stream",
          CacheControl: "no-store",
          ContentMD5: createHash("md5").update(contents).digest("base64"),
          Metadata: options.metadata,
          IfMatch: options.ifMatch,
          IfNoneMatch: options.ifNoneMatch,
        }),
      );
      if (!result.ETag) throw new Error("R2 did not return an object ETag");
      return { etag: result.ETag };
    },
    async list(prefix) {
      safeObjectKey(prefix, { prefix: true });
      const objects = [];
      const seenTokens = new Set();
      let continuationToken;
      do {
        const result = await send(
          new ListObjectsV2Command({
            Bucket: configuration.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of result.Contents ?? []) {
          if (
            !object.Key?.startsWith(prefix) ||
            !Number.isFinite(object.LastModified?.getTime()) ||
            !Number.isSafeInteger(object.Size)
          ) {
            throw new Error("R2 returned an invalid object listing");
          }
          objects.push({ key: safeObjectKey(object.Key), bytes: object.Size, lastModified: object.LastModified });
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
        if (result.IsTruncated && (!continuationToken || seenTokens.has(continuationToken)))
          throw new Error("R2 listing pagination did not advance");
        if (continuationToken) seenTokens.add(continuationToken);
      } while (continuationToken);
      return objects;
    },
    async delete(keys) {
      const unique = [...new Set(keys.map((key) => safeObjectKey(key)))];
      let deleted = 0;
      for (let index = 0; index < unique.length; index += 1_000) {
        const chunk = unique.slice(index, index + 1_000);
        const result = await send(
          new DeleteObjectsCommand({
            Bucket: configuration.bucket,
            Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (result.Errors?.length) {
          if (
            result.Errors.some((error) =>
              ["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"].includes(error.Code),
            )
          ) {
            throw new R2ConfigurationError("The R2 key cannot delete objects in the configured bucket");
          }
          throw new Error(`R2 deletion partially failed for ${result.Errors.length} objects`);
        }
        deleted += chunk.length;
      }
      return deleted;
    },
  };
}

export async function readReportManifest(store, target) {
  const object = await store.get(reportTargetPaths(target).manifestKey);
  if (!object) return null;
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(object.body).toString("utf8"));
  } catch {
    throw new Error("Invalid report manifest JSON");
  }
  if (!object.etag) throw new Error("Report manifest has no ETag");
  return { manifest: validateReportManifest(manifest, target), etag: object.etag };
}
