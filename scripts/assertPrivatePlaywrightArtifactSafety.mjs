import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const MEBIBYTE = 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 100 * MEBIBYTE;
const MAX_TOTAL_BYTES = 1024 * MEBIBYTE;
const MAX_ZIP_ENTRIES = 20_000;
const MAX_ZIP_ENTRY_BYTES = 100 * MEBIBYTE;
const MAX_ZIP_TOTAL_BYTES = 512 * MEBIBYTE;
const REQUIRED_CREDENTIAL_ENV_NAMES = [
  "E2E_CLERK_USERS",
  "E2E_CLERK_PASSWORD",
  "CLERK_SECRET_KEY",
  "CONVEX_DEPLOY_KEY",
];
const SECRET_ENV_NAME_PATTERN = /(?:PASSWORD|SECRET(?:_KEY)?|TOKEN|PRIVATE_KEY|DEPLOY_KEY|API_KEY)$/i;
const TEXT_EXTENSIONS = new Set([".html", ".json", ".md", ".txt"]);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ".jpeg", ".jpg", ".png", ".webm", ".webp", ".zip"]);
const FORBIDDEN_FILE_PATTERNS = [
  { label: "environment file", pattern: /(^|\/)\.env(?:\.[^/]*)?$/i },
  { label: "source map", pattern: /\.map$/i },
  { label: "private key or certificate bundle", pattern: /\.(?:key|p12|pfx|pem)$/i },
  {
    label: "authenticated browser storage state",
    pattern: /(^|\/)(?:\.auth|\.clerk)(\/|$)|(^|\/)(?:storage[-_.]?state|auth[-_.]?state)\.[^/]+$/i,
  },
];
const BINARY_SIGNATURES = new Map([
  [".jpeg", (contents) => contents.length >= 3 && contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  [".jpg", (contents) => contents.length >= 3 && contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  [
    ".png",
    (contents) => contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  ],
  [".webm", (contents) => contents.length >= 4 && contents.readUInt32BE(0) === 0x1a45dfa3],
  [
    ".webp",
    (contents) =>
      contents.length >= 12 &&
      contents.toString("ascii", 0, 4) === "RIFF" &&
      contents.toString("ascii", 8, 12) === "WEBP",
  ],
]);
const PLAYWRIGHT_STORAGE_PATTERN = /"cookies"\s*:\s*\[[\s\S]*?"origins"\s*:\s*\[/;
const HIGH_CONFIDENCE_SECRET_PATTERNS = [
  { label: "private key", pattern: /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/ },
  { label: "Stripe or Clerk secret key", pattern: /\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "Resend API key", pattern: /\bre_[A-Za-z0-9]{24,}\b/ },
];
const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function usage() {
  return [
    "Usage: node scripts/assertPrivatePlaywrightArtifactSafety.mjs",
    "[--redact-known-identifiers] [artifact-path ...]",
  ].join(" ");
}

function parseArguments(argv) {
  let redactKnownIdentifiers = false;
  const artifactPaths = [];
  for (const argument of argv) {
    if (argument === "--redact-known-identifiers") {
      if (redactKnownIdentifiers) throw new Error(usage());
      redactKnownIdentifiers = true;
    } else if (argument.startsWith("--")) {
      throw new Error(usage());
    } else {
      artifactPaths.push(argument);
    }
  }
  return {
    redactKnownIdentifiers,
    artifactPaths:
      artifactPaths.length > 0 ? artifactPaths : ["test-results.json", "playwright-report", "test-results"],
  };
}

function addCredential(credentialsByValue, name, value) {
  if (!value) return;
  const names = credentialsByValue.get(value) ?? new Set();
  names.add(name);
  credentialsByValue.set(value, names);
}

function assertSafeRelativePath(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const hasControlCharacter = [...normalizedPath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!normalizedPath || normalizedPath.includes("\\") || hasControlCharacter) {
    throw new Error(`Private Playwright artifact contains an unsafe path: ${JSON.stringify(normalizedPath)}`);
  }
  return normalizedPath;
}

function assertAllowedArtifactPath(normalizedPath) {
  const forbiddenFile = FORBIDDEN_FILE_PATTERNS.find(({ pattern }) => pattern.test(normalizedPath));
  if (forbiddenFile) {
    throw new Error(
      `Private Playwright artifact safety gate found a forbidden ${forbiddenFile.label}: ${JSON.stringify(normalizedPath)}`,
    );
  }
  const extension = path.extname(normalizedPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(
      `Private Playwright artifact safety gate found an unsupported file type: ${JSON.stringify(normalizedPath)}`,
    );
  }
  return extension;
}

function collectFiles(targetPath, workingDirectory, filesByPath) {
  const resolvedPath = path.resolve(workingDirectory, targetPath);
  if (resolvedPath !== workingDirectory && !resolvedPath.startsWith(`${workingDirectory}${path.sep}`)) {
    throw new Error(
      `Private Playwright artifact root must stay inside the working directory: ${JSON.stringify(targetPath)}`,
    );
  }
  const stat = lstatSync(resolvedPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Private Playwright artifact safety gate does not accept symbolic links: ${targetPath}`);
  }
  if (stat.isFile()) {
    const relativePath = assertSafeRelativePath(path.relative(workingDirectory, resolvedPath));
    filesByPath.set(resolvedPath, { filePath: resolvedPath, relativePath, size: stat.size });
    return;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Private Playwright artifact safety gate only accepts regular files: ${targetPath}`);
  }
  for (const entry of readdirSync(resolvedPath)) {
    collectFiles(path.join(resolvedPath, entry), workingDirectory, filesByPath);
  }
}

function crc32(contents) {
  let crc = 0xffffffff;
  for (const value of contents) crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(contents) {
  const minimumOffset = Math.max(0, contents.length - 65_557);
  for (let offset = contents.length - 22; offset >= minimumOffset; offset -= 1) {
    if (contents.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = contents.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === contents.length) return offset;
  }
  throw new Error("Private Playwright artifact ZIP end record is invalid.");
}

function assertSafeZipEntryName(name) {
  const normalized = name.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    name.includes("\\") ||
    hasControlCharacter ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Private Playwright artifact ZIP contains an unsafe entry path.");
  }
  const forbiddenFile = FORBIDDEN_FILE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  if (forbiddenFile) throw new Error(`Private Playwright artifact ZIP contains a forbidden ${forbiddenFile.label}.`);
}

function findSecrets(contents, credentialsByValue) {
  const findings = new Set();
  for (const [credential, names] of credentialsByValue) {
    const serializedCredential = JSON.stringify(credential).slice(1, -1);
    if (contents.includes(Buffer.from(credential)) || contents.includes(Buffer.from(serializedCredential))) {
      for (const name of names) findings.add(name);
    }
  }
  const searchableContents = contents.toString("latin1");
  for (const candidate of HIGH_CONFIDENCE_SECRET_PATTERNS) {
    if (candidate.pattern.test(searchableContents)) findings.add(candidate.label);
  }
  return findings;
}

function inspectZip(contents, credentialsByValue) {
  const eocdOffset = findEndOfCentralDirectory(contents);
  const diskNumber = contents.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = contents.readUInt16LE(eocdOffset + 6);
  const diskEntryCount = contents.readUInt16LE(eocdOffset + 8);
  const entryCount = contents.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = contents.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = contents.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount > MAX_ZIP_ENTRIES ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    centralDirectoryOffset + centralDirectorySize !== eocdOffset
  ) {
    throw new Error("Private Playwright artifact ZIP structure is outside the safety bounds.");
  }

  const findings = new Set();
  let totalUncompressedBytes = 0;
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || contents.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Private Playwright artifact ZIP central directory is invalid.");
    }
    const flags = contents.readUInt16LE(offset + 8);
    const compressionMethod = contents.readUInt16LE(offset + 10);
    const expectedCrc = contents.readUInt32LE(offset + 16);
    const compressedSize = contents.readUInt32LE(offset + 20);
    const uncompressedSize = contents.readUInt32LE(offset + 24);
    const nameLength = contents.readUInt16LE(offset + 28);
    const extraLength = contents.readUInt16LE(offset + 30);
    const commentLength = contents.readUInt16LE(offset + 32);
    const externalAttributes = contents.readUInt32LE(offset + 38);
    const localHeaderOffset = contents.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > eocdOffset || [compressedSize, uncompressedSize, localHeaderOffset].includes(0xffffffff)) {
      throw new Error("Private Playwright artifact ZIP entry is invalid or requires ZIP64.");
    }
    const entryNameBuffer = contents.subarray(offset + 46, offset + 46 + nameLength);
    let entryName;
    try {
      entryName = new TextDecoder(flags & 0x0800 ? "utf-8" : "windows-1252", { fatal: true }).decode(entryNameBuffer);
    } catch {
      throw new Error("Private Playwright artifact ZIP entry name is invalid.");
    }
    assertSafeZipEntryName(entryName);
    const unixFileType = (externalAttributes >>> 16) & 0o170000;
    if (unixFileType === 0o120000) throw new Error("Private Playwright artifact ZIP does not accept symbolic links.");
    if (flags & 0x0001) throw new Error("Private Playwright artifact ZIP does not accept encrypted entries.");
    if (![0, 8].includes(compressionMethod)) {
      throw new Error("Private Playwright artifact ZIP contains an unsupported compression method.");
    }
    totalUncompressedBytes += uncompressedSize;
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES || totalUncompressedBytes > MAX_ZIP_TOTAL_BYTES) {
      throw new Error("Private Playwright artifact ZIP exceeds the uncompressed size limit.");
    }
    if (localHeaderOffset + 30 > centralDirectoryOffset || contents.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error("Private Playwright artifact ZIP local header is invalid.");
    }
    const localFlags = contents.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod = contents.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = contents.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = contents.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (
      dataOffset + compressedSize > centralDirectoryOffset ||
      localFlags !== flags ||
      localCompressionMethod !== compressionMethod ||
      !contents.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength).equals(entryNameBuffer)
    ) {
      throw new Error("Private Playwright artifact ZIP entry data is invalid.");
    }
    const compressedContents = contents.subarray(dataOffset, dataOffset + compressedSize);
    let uncompressedContents;
    try {
      uncompressedContents =
        compressionMethod === 0
          ? compressedContents
          : inflateRawSync(compressedContents, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
    } catch {
      throw new Error("Private Playwright artifact ZIP entry could not be decompressed safely.");
    }
    if (uncompressedContents.length !== uncompressedSize || crc32(uncompressedContents) !== expectedCrc) {
      throw new Error("Private Playwright artifact ZIP entry checksum or size is invalid.");
    }
    if (PLAYWRIGHT_STORAGE_PATTERN.test(uncompressedContents.toString("latin1"))) {
      throw new Error("Private Playwright artifact ZIP contains browser storage state.");
    }
    for (const finding of findSecrets(uncompressedContents, credentialsByValue)) findings.add(finding);
    offset = entryEnd;
  }
  if (offset !== eocdOffset) throw new Error("Private Playwright artifact ZIP central directory length is invalid.");
  return findings;
}

function redactKnownIdentifiers(source, knownIdentifiers) {
  let redacted = source;
  knownIdentifiers.forEach((identifier, index) => {
    const replacement = `e2e-user-${index + 1}@example.com`;
    redacted = redacted.replaceAll(identifier, replacement);
    redacted = redacted.replaceAll(JSON.stringify(identifier).slice(1, -1), replacement);
  });
  return redacted;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const missingCredentialNames = REQUIRED_CREDENTIAL_ENV_NAMES.filter((name) => !process.env[name]);
  if (missingCredentialNames.length > 0) {
    throw new Error(
      `Private Playwright artifact safety gate is missing credentials: ${missingCredentialNames.join(", ")}`,
    );
  }
  const missingArtifactPaths = options.artifactPaths.filter((artifactPath) => !existsSync(artifactPath));
  if (missingArtifactPaths.length > 0) {
    throw new Error(`Private Playwright artifact safety gate is missing paths: ${missingArtifactPaths.join(", ")}`);
  }

  const credentialsByValue = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== "E2E_CLERK_USERS" && SECRET_ENV_NAME_PATTERN.test(name)) {
      addCredential(credentialsByValue, name, value);
    }
  }
  for (const name of REQUIRED_CREDENTIAL_ENV_NAMES.filter((name) => name !== "E2E_CLERK_USERS")) {
    addCredential(credentialsByValue, name, process.env[name]);
  }
  const knownIdentifiers = process.env.E2E_CLERK_USERS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (knownIdentifiers.length === 0) throw new Error("Private Playwright artifact gate requires E2E user identifiers.");

  const workingDirectory = path.resolve(process.cwd());
  const filesByPath = new Map();
  for (const artifactPath of options.artifactPaths) collectFiles(artifactPath, workingDirectory, filesByPath);
  const artifactFiles = [...filesByPath.values()];
  if (artifactFiles.length === 0) throw new Error("Private Playwright artifact gate found no files to inspect.");
  if (artifactFiles.length > MAX_FILES)
    throw new Error("Private Playwright artifact gate exceeds the file count limit.");

  const findings = [];
  const redactions = [];
  let totalBytes = 0;
  for (const artifactFile of artifactFiles) {
    totalBytes += artifactFile.size;
    if (artifactFile.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Private Playwright artifact gate exceeds the file or total size limit.");
    }
    const extension = assertAllowedArtifactPath(artifactFile.relativePath);
    const contents = readFileSync(artifactFile.filePath);
    const signature = BINARY_SIGNATURES.get(extension);
    if (signature && !signature(contents)) {
      throw new Error(`Private Playwright artifact gate found invalid ${extension.slice(1)} data.`);
    }
    const fileFindings = findSecrets(contents, credentialsByValue);
    if (extension === ".zip") {
      for (const finding of inspectZip(contents, credentialsByValue)) fileFindings.add(finding);
    }
    if (fileFindings.size > 0) findings.push({ relativePath: artifactFile.relativePath, names: [...fileFindings] });

    if (TEXT_EXTENSIONS.has(extension)) {
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(contents);
      } catch {
        throw new Error(`Private Playwright artifact contains invalid UTF-8 text: ${artifactFile.relativePath}`);
      }
      if (PLAYWRIGHT_STORAGE_PATTERN.test(source)) {
        throw new Error(`Private Playwright artifact gate found browser storage state: ${artifactFile.relativePath}`);
      }
      if (options.redactKnownIdentifiers) {
        const redacted = redactKnownIdentifiers(source, knownIdentifiers);
        if (redacted !== source) {
          redactions.push({
            filePath: artifactFile.filePath,
            source: redacted,
            originalBytes: contents.length,
            redactedBytes: Buffer.byteLength(redacted),
          });
        }
      }
    }
  }

  if (findings.length > 0) {
    const lines = ["Private Playwright artifact safety gate found credential values:"];
    for (const { relativePath, names } of findings) lines.push(`- ${relativePath}: ${names.join(", ")}`);
    throw new Error(lines.join("\n"));
  }

  const redactedTotalBytes = redactions.reduce(
    (sum, redaction) => sum - redaction.originalBytes + redaction.redactedBytes,
    totalBytes,
  );
  if (
    redactedTotalBytes > MAX_TOTAL_BYTES ||
    redactions.some((redaction) => redaction.redactedBytes > MAX_FILE_BYTES)
  ) {
    throw new Error("Private Playwright artifact gate exceeds the size limit after redaction.");
  }
  for (const redaction of redactions) {
    writeFileSync(redaction.filePath, redaction.source, { encoding: "utf8", mode: 0o600 });
  }

  const redactionSummary = options.redactKnownIdentifiers ? `; ${redactions.length} text files redacted` : "";
  console.log(
    `Private Playwright artifact safety gate passed: ${artifactFiles.length} files checked against ${credentialsByValue.size} secret values${redactionSummary}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Private Playwright artifact safety gate failed.");
  process.exit(1);
}
