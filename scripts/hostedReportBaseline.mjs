import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import {
  assertReportPrivacy,
  collectReportFiles,
  createReportDestination,
  readReportZipEntries,
} from "./prepareHostedReport.mjs";

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_IMAGES = 20_000;
const IMAGE_PATH = /\.(?:png|jpe?g|webp)$/i;
const sha256 = (contents) => createHash("sha256").update(contents).digest("hex");

function assertBaselineMetadata({ checksum, imageCount, bytes }) {
  if (
    typeof checksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(checksum) ||
    !Number.isSafeInteger(imageCount) ||
    imageCount < 1 ||
    imageCount > MAX_IMAGES
  ) {
    throw new Error("Baseline checksum or image count is invalid.");
  }
  if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_ARCHIVE_BYTES)) {
    throw new Error("Baseline archive byte count is invalid.");
  }
}

export async function createBaselineArchive({ source, archivePath }) {
  const files = await collectReportFiles(source);
  if ([...files.keys()].some((name) => !IMAGE_PATH.test(name)))
    throw new Error("Baseline source must contain images only.");
  const totalBytes = [...files.values()].reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_ARCHIVE_BYTES) throw new Error("Baseline exceeds the bounded expanded size.");
  const sourcePath = path.resolve(source);
  const output = path.resolve(archivePath);
  if (output === sourcePath || output.startsWith(`${sourcePath}${path.sep}`))
    throw new Error("Baseline archive must be outside its source.");
  await assertReportPrivacy(source);
  const entries = Object.create(null);
  for (const [name, file] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    // A fixed timestamp makes the same set of captures produce the same checksum.
    entries[name] = [await readFile(file.absolute), { mtime: new Date("2000-01-01T00:00:00Z") }];
  }
  const archive = Buffer.from(zipSync(entries, { level: 6 }));
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error("Baseline archive exceeds the bounded size.");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, archive, { flag: "wx" });
  return { checksum: sha256(archive), imageCount: files.size, bytes: archive.length };
}

export async function extractBaselineArchive({ archivePath, destination, checksum, imageCount }) {
  assertBaselineMetadata({ checksum, imageCount });
  const info = await lstat(archivePath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_ARCHIVE_BYTES) {
    throw new Error("Baseline archive must be a bounded regular file.");
  }
  const archive = await readFile(archivePath);
  if (sha256(archive) !== checksum) throw new Error("Baseline archive checksum does not match.");
  const files = readReportZipEntries(archive);
  if (files.size !== imageCount || [...files.keys()].some((name) => !IMAGE_PATH.test(name))) {
    throw new Error("Baseline archive image count or file type does not match.");
  }
  const output = await createReportDestination(archivePath, destination);
  try {
    for (const [name, contents] of files) {
      const target = path.join(output, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, { flag: "wx" });
    }
    await assertReportPrivacy(output);
    return { imageCount: files.size };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

function publicBase(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("REPORT_PUBLIC_BASE_URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("REPORT_PUBLIC_BASE_URL must be an HTTPS origin without credentials or a path.");
  }
  return url;
}

async function readResponse(response, limit) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > limit)
    throw new Error("Public baseline response exceeds the bounded size.");
  if (!response.body) throw new Error("Public baseline response body is missing.");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Public baseline response exceeds the bounded size.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

async function downloadPublicFile(url, limit, fetchImpl) {
  const maximumAttempts = 3;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    let waitMs = 1000 * 2 ** attempt;
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (response.ok) return await readResponse(response, limit);
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        throw new Error(`Public baseline request failed (HTTP ${response.status}).`);
      }
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(requested)) waitMs = Math.max(0, Math.min(5000, requested));
      }
      await response.body?.cancel();
    } catch (error) {
      if (!["TimeoutError", "AbortError"].includes(error.name)) throw error;
    }
    if (attempt === maximumAttempts - 1) throw new Error("Public baseline is unavailable after bounded retries.");
    await delay(waitMs);
  }
  throw new Error("Public baseline is unavailable.");
}

export async function downloadBaseline({ baseUrl, branch, destination, fetchImpl = fetch }) {
  if (!["develop", "main"].includes(branch)) throw new Error("Baseline branch must be develop or main.");
  const base = publicBase(baseUrl);
  const metadata = await downloadPublicFile(new URL(`state/vrt/branches/${branch}.json`, base), 64 * 1024, fetchImpl);
  let manifest;
  try {
    manifest = JSON.parse(metadata.toString("utf8"));
  } catch {
    throw new Error("Public baseline manifest is invalid JSON.");
  }
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.reportType !== "vrt" ||
    manifest.pullRequest !== null ||
    manifest.sourceRepository !== "yn1323/yps-crispy-carnival" ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceSha ?? "") ||
    !Number.isSafeInteger(manifest.runId) ||
    manifest.runId < 1 ||
    !Number.isSafeInteger(manifest.runAttempt) ||
    manifest.runAttempt < 1 ||
    manifest.sourceBranch !== branch ||
    !manifest.baseline ||
    manifest.reportPrefix !== `vrt/branches/${branch}/${manifest.runId}-${manifest.runAttempt}/` ||
    manifest.baseline.key !== `baselines/${branch}/${manifest.runId}-${manifest.runAttempt}.zip`
  )
    throw new Error("Public baseline manifest does not match its branch.");
  const baseline = manifest.baseline;
  assertBaselineMetadata(baseline);
  if (baseline.bytes === undefined) throw new Error("Public baseline manifest is missing the archive size.");
  const archive = await downloadPublicFile(new URL(baseline.key, base), baseline.bytes, fetchImpl);
  if (archive.length !== baseline.bytes) throw new Error("Public baseline archive size does not match.");
  const temporary = await mkdtemp(path.join(tmpdir(), "hosted-baseline-"));
  try {
    const archivePath = path.join(temporary, "baseline.zip");
    await writeFile(archivePath, archive);
    return await extractBaselineArchive({
      archivePath,
      destination,
      checksum: baseline.checksum,
      imageCount: baseline.imageCount,
    });
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (args.length % 2) throw new Error("Baseline options require values.");
  const options = Object.fromEntries(args.flatMap((value, index) => (index % 2 ? [] : [[value, args[index + 1]]])));
  if (command === "create" && args.length === 4 && options["--source"] && options["--archive"]) {
    return createBaselineArchive({ source: options["--source"], archivePath: options["--archive"] });
  }
  if (
    command === "download" &&
    args.length === 6 &&
    options["--base-url"] &&
    options["--branch"] &&
    options["--destination"]
  ) {
    return downloadBaseline({
      baseUrl: options["--base-url"],
      branch: options["--branch"],
      destination: options["--destination"],
    });
  }
  throw new Error(
    "Usage: create --source <directory> --archive <file.zip> | download --base-url <https-origin> --branch develop|main --destination <new-directory>",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
