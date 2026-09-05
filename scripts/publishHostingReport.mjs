import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeReportTarget,
  positiveInteger,
  publicReportUrl,
  R2ConfigurationError,
  ReportStoreConflictError,
  readReportManifest,
  reportTargetPaths,
  SOURCE_REPOSITORY,
  safeObjectKey,
  validateReportManifest,
} from "./hostedReportStore.mjs";
import { deleteClosedReport, recordRetiredBaseline } from "./maintainR2Reports.mjs";

export { SOURCE_REPOSITORY } from "./hostedReportStore.mjs";

export function normalizePublishRequest(input) {
  const target = normalizeReportTarget(input);
  const sourceSha = String(input.sourceSha ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error("Invalid source SHA");
  if (input.sourceRepository !== undefined && input.sourceRepository !== SOURCE_REPOSITORY)
    throw new Error("Invalid source repository");
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Invalid publication time");
  if (typeof input.source !== "string" || !input.source) throw new Error("Report source is required");
  const baselineArchive = input.baselineArchive ?? null;
  if ((target.sourceBranch !== null) !== (baselineArchive !== null))
    throw new Error("Only branch VRT publication requires a baseline archive");
  if (baselineArchive !== null) {
    if (
      typeof baselineArchive.path !== "string" ||
      !baselineArchive.path ||
      !/^[0-9a-f]{64}$/.test(baselineArchive.checksum ?? "")
    ) {
      throw new Error("Invalid baseline archive");
    }
    positiveInteger(baselineArchive.bytes, "baseline bytes");
    positiveInteger(baselineArchive.imageCount, "baseline image count");
  }
  return {
    ...target,
    source: path.resolve(input.source),
    sourceSha,
    runId: positiveInteger(input.runId, "run ID"),
    runAttempt: positiveInteger(input.runAttempt, "run attempt"),
    updatedAt,
    baselineArchive,
  };
}

export function comparePublishedRun(existing, incoming) {
  if (!existing) return "newer";
  validateReportManifest(existing, incoming);
  if (existing.runId === incoming.runId && existing.sourceSha !== incoming.sourceSha)
    throw new Error("Run identity collision has different source SHAs");
  if (
    existing.runId > incoming.runId ||
    (existing.runId === incoming.runId && existing.runAttempt > incoming.runAttempt)
  )
    return "stale";
  return existing.runId === incoming.runId && existing.runAttempt === incoming.runAttempt ? "same" : "newer";
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

async function reportFiles(source, reportType) {
  const root = await lstat(source);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Report source must be a regular directory");
  const files = [];
  let bytes = 0;
  async function visit(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", ".report-meta.json", ".snapshot-meta.json", "state", "baselines"].includes(entry.name))
        throw new Error("Reserved report source path");
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      safeObjectKey(name);
      const absolute = path.join(directory, entry.name);
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) throw new Error("Report source contains a symlink");
      if (stats.isDirectory()) await visit(absolute, name);
      else if (stats.isFile()) {
        bytes += stats.size;
        if (stats.size > 50 * 1024 * 1024 || bytes > 1024 * 1024 * 1024 || files.length >= 20_000)
          throw new Error("Report source exceeds publication limits");
        files.push({ path: absolute, name, bytes: stats.size });
      } else throw new Error("Unsupported report source entry");
    }
  }
  await visit(source);
  const required = reportType === "vrt" ? ["index.html", "out.json"] : ["index.html"];
  if (required.some((name) => !files.some((file) => file.name === name)))
    throw new Error("Report source is incomplete");
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

async function uploadImmutable(store, key, contents, contentType) {
  const checksum = createHash("sha256").update(contents).digest("hex");
  try {
    await store.put(key, contents, { contentType, ifNoneMatch: "*", metadata: { sha256: checksum } });
  } catch (error) {
    if (!(error instanceof ReportStoreConflictError)) throw error;
  }
  const uploaded = await store.head(key);
  if (uploaded?.bytes !== contents.length || uploaded.metadata?.sha256 !== checksum)
    throw new Error("Uploaded report object does not match its source");
}

export async function publishHostedReport(input, { store, verifySource, afterCommit, now = () => new Date() }) {
  const request = normalizePublishRequest(input);
  if (typeof verifySource !== "function") throw new Error("Publication requires current GitHub source verification");
  const paths = reportTargetPaths(request);
  const reportPrefix = `${paths.reportRoot}${request.runId}-${request.runAttempt}/`;
  const reportUrl = publicReportUrl(store.publicBaseUrl, `${reportPrefix}index.html`);
  const warnings = [];
  const result = (status, manifest = null, extra = {}) => ({
    status,
    reportUrl: manifest ? publicReportUrl(store.publicBaseUrl, `${manifest.reportPrefix}index.html`) : reportUrl,
    manifest,
    uploadedFiles: 0,
    uploadedBytes: 0,
    deletedFiles: 0,
    warnings,
    ...extra,
  });
  const verify = async () => {
    const state = await verifySource(request);
    if (!["current", "stale", "closed"].includes(state?.status)) throw new Error("Invalid verified publication state");
    if (request.pullRequest === null && state.status === "closed") throw new Error("A branch cannot be a closed PR");
    return state.status;
  };
  const close = async () => {
    const cleaned = await deleteClosedReport(request, {
      store,
      verifySource: async () => ({ status: (await verify()) === "closed" ? "closed" : "open" }),
    });
    return result(cleaned.status === "closed" ? "closed" : "stale", null, { deletedFiles: cleaned.deletedFiles });
  };
  const initialState = await verify();
  if (initialState === "closed") return close();
  if (initialState === "stale") return result("stale");
  const observed = await readReportManifest(store, request);
  const comparison = comparePublishedRun(observed?.manifest, request);
  if (comparison !== "newer") return result(comparison === "same" ? "noop" : "stale", observed.manifest);
  const files = await reportFiles(request.source, request.reportType);
  const manifest = {
    schemaVersion: 1,
    sourceRepository: SOURCE_REPOSITORY,
    reportType: request.reportType,
    pullRequest: request.pullRequest,
    sourceBranch: request.sourceBranch,
    sourceSha: request.sourceSha,
    runId: request.runId,
    runAttempt: request.runAttempt,
    updatedAt: request.updatedAt,
    reportPrefix,
    fileCount: files.length,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  };
  let baselineContents;
  if (request.baselineArchive) {
    const baseline = request.baselineArchive;
    const stats = await lstat(baseline.path);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size !== baseline.bytes || stats.size > 200 * 1024 * 1024)
      throw new Error("Invalid baseline archive size or file");
    baselineContents = await readFile(baseline.path);
    if (createHash("sha256").update(baselineContents).digest("hex") !== baseline.checksum)
      throw new Error("Baseline archive checksum does not match");
    manifest.baseline = {
      key: `${paths.baselineRoot}${request.runId}-${request.runAttempt}.zip`,
      checksum: baseline.checksum,
      imageCount: baseline.imageCount,
      bytes: baseline.bytes,
    };
  }
  validateReportManifest(manifest, request);
  let committed = false;
  try {
    for (let index = 0; index < files.length; index += 4) {
      const transfers = await Promise.allSettled(
        files.slice(index, index + 4).map(async (file) => {
          const contents = await readFile(file.path);
          if (contents.length !== file.bytes) throw new Error("Report source changed during publication");
          await uploadImmutable(
            store,
            `${reportPrefix}${file.name}`,
            contents,
            CONTENT_TYPES[path.extname(file.name).toLowerCase()] ?? "application/octet-stream",
          );
        }),
      );
      // Drain every in-flight upload before cleanup, so late writes cannot restore an abandoned generation.
      const failed = transfers.find((transfer) => transfer.status === "rejected");
      if (failed) throw failed.reason;
    }
    if (baselineContents) await uploadImmutable(store, manifest.baseline.key, baselineContents, "application/zip");
    const finalState = await verify();
    if (finalState === "closed") return await close();
    if (finalState === "stale") return result("stale", observed?.manifest);
    try {
      await store.put(paths.manifestKey, Buffer.from(`${JSON.stringify(manifest)}\n`), {
        contentType: "application/json",
        ...(observed ? { ifMatch: observed.etag } : { ifNoneMatch: "*" }),
      });
    } catch (error) {
      if (error instanceof R2ConfigurationError) throw error;
      const actual = await readReportManifest(store, request);
      if (actual && comparePublishedRun(actual.manifest, request) === "same") {
        committed = true;
      } else {
        throw error;
      }
    }
    committed = true;
  } finally {
    if (!committed) {
      // A failed conditional write or an uncertain response may have a successful competing publisher.
      const actual = await readReportManifest(store, request);
      if (actual?.manifest.reportPrefix !== reportPrefix) {
        const abandoned = (await store.list(reportPrefix)).map(({ key }) => key);
        if (manifest.baseline && actual?.manifest.baseline?.key !== manifest.baseline.key)
          abandoned.push(manifest.baseline.key);
        await store.delete(abandoned);
      }
    }
  }
  const warning = (error, label) => {
    if (error instanceof R2ConfigurationError) throw error;
    warnings.push(label);
  };
  if (observed?.manifest.baseline && observed.manifest.baseline.key !== manifest.baseline?.key) {
    try {
      await recordRetiredBaseline(store, request, observed.manifest.baseline.key, now());
    } catch (error) {
      warning(error, "Previous baseline retirement will be retried by maintenance");
    }
  }
  if (afterCommit) {
    try {
      await afterCommit(manifest, reportUrl);
    } catch (error) {
      warning(error, "Report is published; its notification or HTTP verification failed");
    }
  }
  let deletedFiles = 0;
  if (observed && observed.manifest.reportPrefix !== reportPrefix) {
    try {
      const actual = await readReportManifest(store, request);
      if (actual?.manifest.reportPrefix !== observed.manifest.reportPrefix) {
        deletedFiles = await store.delete((await store.list(observed.manifest.reportPrefix)).map(({ key }) => key));
      }
    } catch (error) {
      warning(error, "Previous report cleanup will be retried by maintenance");
    }
  }
  return result("published", manifest, {
    uploadedFiles: files.length + (baselineContents ? 1 : 0),
    uploadedBytes: manifest.bytes + (baselineContents?.length ?? 0),
    deletedFiles,
  });
}
