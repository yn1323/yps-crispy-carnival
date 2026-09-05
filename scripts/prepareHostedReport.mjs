import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inflateRawSync } from "node:zlib";
import { zipSync } from "fflate";

const runFile = promisify(execFile);
const PRIVACY_GATE = fileURLToPath(new URL("./assertNoSensitiveArtifacts.mjs", import.meta.url));
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const VIDEO_PATH = /\.(?:webm|mp4|mov|m4v|avi|mkv)$/i;
const DATA_PATH = /^data\/[0-9a-f]{40}\.[A-Za-z0-9]+$/;

export function assertReportPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    value.includes(":") ||
    [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Report contains an unsafe relative path.");
  if (
    value.split("/").some((part) => [".report-meta.json", ".snapshot-meta.json", ".git"].includes(part)) ||
    /^(?:state|baselines)\//.test(value)
  )
    throw new Error("Report contains reserved management metadata.");
  return value;
}

export async function collectReportFiles(root) {
  const rootPath = path.resolve(root);
  const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Report source must be a directory.");
  const files = new Map();
  let totalBytes = 0;
  let entryCount = 0;
  const visit = async (directory, prefix = "") => {
    for (const name of await readdir(directory)) {
      const relative = assertReportPath(`${prefix}${name}`);
      const absolute = path.join(directory, name);
      const info = await lstat(absolute);
      if (++entryCount > MAX_FILES) throw new Error("Report exceeds the bounded entry count.");
      if (info.isSymbolicLink()) throw new Error("Report does not accept symbolic links.");
      if (info.isDirectory()) await visit(absolute, `${relative}/`);
      else if (info.isFile() && info.nlink === 1) {
        totalBytes += info.size;
        if (info.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES)
          throw new Error("Report exceeds the bounded size.");
        files.set(relative, { absolute, size: info.size });
      } else throw new Error("Report only accepts regular files without hard links.");
    }
  };
  await visit(rootPath);
  if (!files.size) throw new Error("Report contains no files.");
  return files;
}

export async function assertReportPrivacy(root) {
  try {
    await runFile(process.execPath, [PRIVACY_GATE, "--root", path.basename(path.resolve(root))], {
      cwd: path.dirname(path.resolve(root)),
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    // The existing gate reports categories and paths, never the detected credential value.
    throw new Error(`Report privacy validation failed. ${error.stderr?.trim() ?? ""}`);
  }
}

export async function createReportDestination(source, destination) {
  const input = path.resolve(source);
  const output = path.resolve(destination);
  if (input === output || input.startsWith(`${output}${path.sep}`) || output.startsWith(`${input}${path.sep}`)) {
    throw new Error("Report destination must be separate from its source.");
  }
  await mkdir(path.dirname(output), { recursive: true });
  // Refusing an existing destination prevents accidental cleanup of another report or a symlink.
  await mkdir(output);
  return output;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Check central/local metadata and cap inflation before materializing untrusted ZIP entries.
export function readReportZipEntries(input) {
  const buffer = Buffer.from(input);
  if (buffer.length > MAX_ZIP_BYTES) throw new Error("Report ZIP exceeds the bounded size.");
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Report ZIP is invalid.");
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralStart = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) !== 0 ||
    buffer.readUInt16LE(end + 6) !== 0 ||
    buffer.readUInt16LE(end + 8) !== count ||
    count > MAX_FILES ||
    centralStart + centralSize !== end ||
    end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length
  )
    throw new Error("Report ZIP structure is unsupported.");
  const entries = new Map();
  const seen = new Set();
  let offset = centralStart;
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Report ZIP directory is invalid.");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    const mode = buffer.readUInt32LE(offset + 38) >>> 16;
    const local = buffer.readUInt32LE(offset + 42);
    if (next > end) throw new Error("Report ZIP entry is truncated.");
    const nameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    const directory = name.endsWith("/");
    assertReportPath(directory ? name.slice(0, -1) : name);
    if (seen.has(name)) throw new Error("Report ZIP contains a duplicate entry.");
    seen.add(name);
    total += size;
    if (size > MAX_FILE_BYTES || total > MAX_ZIP_BYTES)
      throw new Error("Report ZIP exceeds the bounded expanded size.");
    const kind = mode & 0o170000;
    if (flags & 1 || ![0, 8].includes(method) || (kind && kind !== (directory ? 0o040000 : 0o100000))) {
      throw new Error("Report ZIP contains an encrypted, linked, or unsupported entry.");
    }
    if (local + 30 > centralStart || buffer.readUInt32LE(local) !== 0x04034b50)
      throw new Error("Report ZIP local header is invalid.");
    const localNameLength = buffer.readUInt16LE(local + 26);
    const dataStart = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
    if (
      dataStart + compressedSize > centralStart ||
      buffer.readUInt16LE(local + 6) !== flags ||
      buffer.readUInt16LE(local + 8) !== method ||
      !buffer.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)
    )
      throw new Error("Report ZIP local metadata does not match.");
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const contents = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (contents.length !== size || crc32(contents) !== expectedCrc)
      throw new Error("Report ZIP contains corrupt data.");
    if (directory && size !== 0) throw new Error("Report ZIP directory contains data.");
    if (!directory) entries.set(name, contents);
    offset = next;
  }
  if (offset !== end) throw new Error("Report ZIP directory size does not match.");
  return entries;
}

function selectVrtPaths(result, available) {
  const selected = new Set([...available].filter((name) => !/^(?:actual|expected|diff)\//.test(name)));
  const include = (directory, name, required) => {
    const key = `${directory}/${name}`;
    if (available.has(key)) selected.add(key);
    else if (required) throw new Error("VRT result references a missing image.");
  };
  for (const [items, required] of [
    [result.failedItems ?? result.changedItems ?? [], ["actual", "expected", "diff"]],
    [result.newItems ?? [], ["actual"]],
    [result.deletedItems ?? [], ["expected"]],
  ]) {
    if (!Array.isArray(items)) throw new Error("VRT result image list must be an array.");
    for (const name of items) {
      assertReportPath(name);
      if (name.includes("/") || !name.endsWith(".png")) throw new Error("VRT result contains an unsafe image name.");
      for (const directory of ["actual", "expected", "diff"]) include(directory, name, required.includes(directory));
    }
  }
  return selected;
}

function preparePlaywright(index) {
  const html = index.toString("utf8");
  const expression = /data:application\/zip;base64,([A-Za-z0-9+/]+={0,2})/g;
  const matches = [...html.matchAll(expression)];
  if (matches.length !== 1) throw new Error("Playwright report must contain one embedded report ZIP.");
  const encoded = matches[0][1];
  const archive = Buffer.from(encoded, "base64");
  if (archive.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, ""))
    throw new Error("Playwright report ZIP encoding is invalid.");
  const files = Object.create(null);
  const references = new Set();
  const videos = new Set();
  const isVideo = (attachment) =>
    attachment &&
    typeof attachment === "object" &&
    (String(attachment.contentType ?? "")
      .toLowerCase()
      .startsWith("video/") ||
      VIDEO_PATH.test(String(attachment.path ?? "")) ||
      attachment.name === "video");
  const removeVideos = (value, attachmentIndexes) => {
    if (Array.isArray(value)) return value.map((child) => removeVideos(child, attachmentIndexes));
    if (!value || typeof value !== "object") return value;
    let indexes = attachmentIndexes;
    if (Object.hasOwn(value, "attachments")) {
      const attachments = value.attachments;
      if (!Array.isArray(attachments)) throw new Error("Playwright attachments must be an array.");
      if (attachments.some((attachment) => typeof attachment !== "number")) {
        indexes = new Map();
        const retained = [];
        for (const [index, attachment] of attachments.entries()) {
          if (!attachment || typeof attachment !== "object") throw new Error("Playwright attachment is invalid.");
          if (isVideo(attachment)) {
            if (typeof attachment.path === "string") videos.add(attachment.path);
            indexes.set(index, null);
          } else {
            if (
              attachment.path !== undefined &&
              (typeof attachment.path !== "string" || !DATA_PATH.test(attachment.path))
            ) {
              throw new Error("Playwright attachment contains an unsafe data reference.");
            }
            indexes.set(index, retained.length);
            retained.push(attachment);
          }
        }
        value.attachments = retained;
      } else {
        // Playwright steps reference the result's attachment array by index.
        value.attachments = attachments.flatMap((index) => {
          if (!Number.isSafeInteger(index) || index < 0 || !indexes?.has(index))
            throw new Error("Playwright attachment index is invalid.");
          return indexes.get(index) === null ? [] : [indexes.get(index)];
        });
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "attachments") value[key] = removeVideos(child, indexes);
    }
    return value;
  };
  const collectReferences = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("data/")) {
        if (!DATA_PATH.test(value)) throw new Error("Playwright report contains an unsafe data reference.");
        references.add(value);
      }
    } else if (Array.isArray(value)) value.forEach(collectReferences);
    else if (value && typeof value === "object") Object.values(value).forEach(collectReferences);
  };
  const entries = readReportZipEntries(archive);
  if (!entries.has("report.json")) throw new Error("Playwright report.json is missing.");
  for (const [name, contents] of entries) {
    if (!name.endsWith(".json")) throw new Error("Playwright embedded report contains unsupported data.");
    const report = removeVideos(JSON.parse(contents.toString("utf8")));
    collectReferences(report);
    files[name] = Buffer.from(JSON.stringify(report));
  }
  for (const reference of references) {
    if (videos.has(reference) || VIDEO_PATH.test(reference))
      throw new Error("Playwright report retains an unexpected video reference.");
  }
  const rewritten = Buffer.from(zipSync(files)).toString("base64");
  return { html: html.replace(encoded, rewritten), references, videos };
}

export async function prepareHostedReport({ reportType, source, destination }) {
  if (!["vrt", "playwright"].includes(reportType)) throw new Error("Unknown report type.");
  const files = await collectReportFiles(source);
  if (!files.has("index.html")) throw new Error("Report index.html is missing.");
  await assertReportPrivacy(source);
  let selected;
  let index;
  if (reportType === "vrt") {
    if (!files.has("out.json")) throw new Error("VRT out.json is missing.");
    const result = JSON.parse(await readFile(files.get("out.json").absolute, "utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("VRT result is invalid.");
    selected = selectVrtPaths(result, new Set(files.keys()));
  } else {
    const prepared = preparePlaywright(await readFile(files.get("index.html").absolute));
    index = prepared.html;
    selected = new Set(
      [...files.keys()].filter(
        (name) => !name.startsWith("data/") && !VIDEO_PATH.test(name) && !prepared.videos.has(name),
      ),
    );
    for (const reference of prepared.references) {
      if (!files.has(reference)) throw new Error("Playwright report references a missing attachment.");
      selected.add(reference);
    }
  }
  const output = await createReportDestination(source, destination);
  try {
    let bytes = 0;
    for (const name of [...selected].sort()) {
      const target = path.join(output, name);
      await mkdir(path.dirname(target), { recursive: true });
      if (name === "index.html" && index !== undefined) {
        await writeFile(target, index);
        bytes += Buffer.byteLength(index);
      } else {
        await copyFile(files.get(name).absolute, target);
        bytes += files.get(name).size;
      }
    }
    await assertReportPrivacy(output);
    return { fileCount: selected.size, bytes };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = Object.fromEntries(args.flatMap((value, index) => (index % 2 ? [] : [[value, args[index + 1]]])));
  if (args.length !== 6 || !options["--type"] || !options["--source"] || !options["--destination"]) {
    console.error("Usage: --type vrt|playwright --source <directory> --destination <new-directory>");
    process.exitCode = 1;
  } else {
    prepareHostedReport({
      reportType: options["--type"],
      source: options["--source"],
      destination: options["--destination"],
    })
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
