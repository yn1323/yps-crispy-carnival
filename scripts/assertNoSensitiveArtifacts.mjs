import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const MEBIBYTE = 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 50 * MEBIBYTE;
const MAX_TOTAL_BYTES = 1024 * MEBIBYTE;
const MAX_ARCHIVE_ENTRIES = 20_000;
const MAX_ARCHIVE_DEPTH = 2;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * MEBIBYTE;
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  "clerk.com",
  "email.com",
  "example.com",
  "example.net",
  "example.org",
  "example.test",
  "test.com",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
  ".network",
  ".stacks",
  ".trace",
  ".xml",
  ".yaml",
  ".yml",
]);
const TEXT_FILENAMES = new Set(["_headers", "_redirects"]);
const BINARY_SIGNATURES = new Map([
  [".avif", (contents) => contents.length >= 12 && contents.toString("ascii", 4, 8) === "ftyp"],
  [".gif", (contents) => ["GIF87a", "GIF89a"].includes(contents.toString("ascii", 0, 6))],
  [".ico", (contents) => contents.length >= 4 && contents.readUInt32BE(0) === 0x00000100],
  [".jpeg", (contents) => contents.length >= 3 && contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  [".jpg", (contents) => contents.length >= 3 && contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  [".mp4", (contents) => contents.length >= 12 && contents.toString("ascii", 4, 8) === "ftyp"],
  [
    ".png",
    (contents) => contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  ],
  [
    ".ttf",
    (contents) => contents.length >= 4 && [0x00010000, 0x4f54544f, 0x74727565].includes(contents.readUInt32BE(0)),
  ],
  [
    ".wasm",
    (contents) => contents.length >= 4 && contents.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d])),
  ],
  [".webm", (contents) => contents.length >= 4 && contents.readUInt32BE(0) === 0x1a45dfa3],
  [
    ".webp",
    (contents) =>
      contents.length >= 12 &&
      contents.toString("ascii", 0, 4) === "RIFF" &&
      contents.toString("ascii", 8, 12) === "WEBP",
  ],
  [".woff", (contents) => contents.length >= 4 && contents.toString("ascii", 0, 4) === "wOFF"],
  [".woff2", (contents) => contents.length >= 4 && contents.toString("ascii", 0, 4) === "wOF2"],
]);
const FORBIDDEN_FILE_PATTERNS = [
  { label: "environment file", pattern: /(^|\/)\.env(?:\.[^/]*)?$/i },
  { label: "source map", pattern: /\.map$/i },
  { label: "private key or certificate bundle", pattern: /\.(?:key|p12|pfx|pem)$/i },
  {
    label: "authenticated browser storage state",
    pattern: /(^|\/)(?:\.auth|\.clerk)(\/|$)|(^|\/)(?:storage[-_.]?state|auth[-_.]?state)\.[^/]+$/i,
  },
  { label: "access log", pattern: /(^|\/)(?:access|nginx[-_.]?access)[-_.]?(?:log|jsonl)(?:\.[^/]*)?$/i },
];
const UUID_TOKEN_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SENSITIVE_CONTENT_PATTERNS = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  },
  {
    label: "secret environment identifier",
    pattern:
      /\b(?:ANTHROPIC_API_KEY|CLERK_SECRET_KEY|CLOUDFLARE_API_TOKEN|CONVEX_DEPLOY_KEY|CONVEX_MANAGEMENT_TOKEN|HOSTING_PAGES_TOKEN|LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|ORGANIZATION_INVITATION_SIGNING_SECRET|REG_SUIT_CLIENT_ID|REPORT_PUBLISHER_HOSTING_PAGES_TOKEN|RESEND_API_KEY|SLACK_WEBHOOK_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\b/,
  },
  { label: "Stripe or Clerk secret key", pattern: /\b(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  {
    label: "Slack webhook",
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/,
  },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "Resend API key", pattern: /\bre_[A-Za-z0-9]{24,}\b/ },
  {
    label: "JWT or session token",
    pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  },
  { label: "Clerk session identifier", pattern: /\b(?:dvb|sess)_[A-Za-z0-9_-]{8,}\b/ },
  {
    label: "bearer capability URL",
    pattern: new RegExp(
      `/(?:legal/staff/consent|manager-invite|shifts/(?:submit|view)|staff/register)\\?[^\\s"'<>]{0,512}\\btoken=${UUID_TOKEN_PATTERN}`,
      "i",
    ),
  },
  {
    label: "bearer capability field",
    pattern: new RegExp(
      `[\\\\]?["'](?:capability|sessionToken|token)[\\\\]?["']\\s*[:=]\\s*[\\\\]?["']${UUID_TOKEN_PATTERN}[\\\\]?["']`,
      "i",
    ),
  },
  { label: "inline source map", pattern: /sourceMappingURL\s*=/ },
];
const EMAIL_LOCAL_SUFFIX_PATTERN = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const EMAIL_DOMAIN_PREFIX_PATTERN = /^([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/;
const PLAYWRIGHT_STORAGE_PATTERN = /"cookies"\s*:\s*\[[\s\S]*?"origins"\s*:\s*\[/;

function parseArguments(argv) {
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error("Usage: --root <file-or-directory> [--root <file-or-directory> ...]");
  }
  const roots = [];
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] !== "--root" || !argv[index + 1]) {
      throw new Error("Usage: --root <file-or-directory> [--root <file-or-directory> ...]");
    }
    roots.push(argv[index + 1]);
  }
  return roots;
}

function assertSafeDisplayPath(relativePath) {
  const hasControlCharacter = [...relativePath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!relativePath || relativePath.includes("\\") || hasControlCharacter) {
    throw new Error(`Artifact path is unsafe: ${JSON.stringify(relativePath)}`);
  }
}

function findSensitiveContent(contents, includeEmail) {
  for (const candidate of SENSITIVE_CONTENT_PATTERNS) {
    if (candidate.pattern.test(contents)) return candidate.label;
  }
  if (PLAYWRIGHT_STORAGE_PATTERN.test(contents)) return "authenticated browser storage state";

  if (includeEmail) {
    let searchFrom = 0;
    while (searchFrom < contents.length) {
      const atIndex = contents.indexOf("@", searchFrom);
      if (atIndex === -1) break;
      const localPart = contents.slice(Math.max(0, atIndex - 64), atIndex).match(EMAIL_LOCAL_SUFFIX_PATTERN)?.[0];
      const domain = contents
        .slice(atIndex + 1, Math.min(contents.length, atIndex + 255))
        .match(EMAIL_DOMAIN_PREFIX_PATTERN)?.[1]
        ?.toLowerCase();
      if (
        localPart &&
        domain &&
        !PLACEHOLDER_EMAIL_DOMAINS.has(domain) &&
        ![...PLACEHOLDER_EMAIL_DOMAINS].some((placeholder) => domain.endsWith(`.${placeholder}`))
      ) {
        return "non-placeholder email address";
      }
      searchFrom = atIndex + 1;
    }
  }
  return undefined;
}

function findRecognizedBinary(contents) {
  return [...BINARY_SIGNATURES.values()].some((matchesSignature) => matchesSignature(contents));
}

function decodeUtf8(contents) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    return undefined;
  }
}

function assertSafeArchivePath(entryPath) {
  assertSafeDisplayPath(entryPath);
  if (
    entryPath.startsWith("/") ||
    entryPath.split("/").some((segment) => segment === "..") ||
    path.posix.normalize(entryPath) !== entryPath
  ) {
    throw new Error(`Artifact ZIP entry path is unsafe: ${JSON.stringify(entryPath)}`);
  }
}

function findZipEndOfCentralDirectory(contents) {
  const minimumOffset = Math.max(0, contents.length - 22 - 0xffff);
  for (let offset = contents.length - 22; offset >= minimumOffset; offset -= 1) {
    if (contents.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Artifact privacy gate found an invalid ZIP archive.");
}

function scanRegularContents(contents, normalizedPath, allowInferredText = false) {
  const extension = path.extname(normalizedPath).toLowerCase();
  const isNamedText = TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(path.basename(normalizedPath));
  const binarySignature = BINARY_SIGNATURES.get(extension);

  if (binarySignature && !binarySignature(contents)) {
    throw new Error(`Artifact privacy gate found invalid binary file data: ${JSON.stringify(normalizedPath)}`);
  }

  const decodedText = isNamedText ? decodeUtf8(contents) : undefined;
  if (isNamedText && decodedText === undefined) {
    throw new Error(`Artifact privacy gate found invalid UTF-8 text: ${JSON.stringify(normalizedPath)}`);
  }

  const inferredText = allowInferredText && !isNamedText && !binarySignature ? decodeUtf8(contents) : undefined;
  const recognizedBinary = Boolean(binarySignature) || findRecognizedBinary(contents);
  if (!isNamedText && inferredText === undefined && !recognizedBinary) {
    throw new Error(`Artifact privacy gate found an unsupported file type: ${JSON.stringify(normalizedPath)}`);
  }

  const searchableContents = decodedText ?? inferredText ?? contents.toString("latin1");
  const sensitiveContent = findSensitiveContent(
    searchableContents,
    decodedText !== undefined || inferredText !== undefined,
  );
  if (sensitiveContent) {
    throw new Error(`Artifact privacy gate found ${sensitiveContent}: ${JSON.stringify(normalizedPath)}`);
  }
}

function scanZipContents(contents, archivePath, state, depth = 0) {
  if (depth > MAX_ARCHIVE_DEPTH) {
    throw new Error(`Artifact privacy gate exceeds the bounded ZIP depth: ${JSON.stringify(archivePath)}`);
  }
  const eocdOffset = findZipEndOfCentralDirectory(contents);
  const diskNumber = contents.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = contents.readUInt16LE(eocdOffset + 6);
  const diskEntries = contents.readUInt16LE(eocdOffset + 8);
  const totalEntries = contents.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = contents.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = contents.readUInt32LE(eocdOffset + 16);
  const commentLength = contents.readUInt16LE(eocdOffset + 20);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    eocdOffset + 22 + commentLength !== contents.length ||
    centralDirectoryOffset + centralDirectorySize > eocdOffset
  ) {
    throw new Error(`Artifact privacy gate found an unsupported ZIP structure: ${JSON.stringify(archivePath)}`);
  }

  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > contents.length || contents.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Artifact privacy gate found an invalid ZIP directory: ${JSON.stringify(archivePath)}`);
    }
    const flags = contents.readUInt16LE(offset + 8);
    const compressionMethod = contents.readUInt16LE(offset + 10);
    const compressedSize = contents.readUInt32LE(offset + 20);
    const uncompressedSize = contents.readUInt32LE(offset + 24);
    const fileNameLength = contents.readUInt16LE(offset + 28);
    const extraLength = contents.readUInt16LE(offset + 30);
    const entryCommentLength = contents.readUInt16LE(offset + 32);
    const localHeaderOffset = contents.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + fileNameLength + extraLength + entryCommentLength;
    if (nextOffset > contents.length) {
      throw new Error(`Artifact privacy gate found an invalid ZIP entry: ${JSON.stringify(archivePath)}`);
    }
    const entryNameBytes = contents.subarray(offset + 46, offset + 46 + fileNameLength);
    const entryName = decodeUtf8(entryNameBytes);
    if (!entryName) throw new Error(`Artifact privacy gate found a non-UTF-8 ZIP path: ${JSON.stringify(archivePath)}`);
    assertSafeArchivePath(entryName);

    state.entryCount += 1;
    state.uncompressedBytes += uncompressedSize;
    if (
      state.entryCount > MAX_ARCHIVE_ENTRIES ||
      uncompressedSize > MAX_FILE_BYTES ||
      state.uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES
    ) {
      throw new Error("Artifact privacy gate exceeds the bounded ZIP size or entry count.");
    }
    if ((flags & 0x1) !== 0 || ![0, 8].includes(compressionMethod)) {
      throw new Error(
        `Artifact privacy gate found an encrypted or unsupported ZIP entry: ${JSON.stringify(entryName)}`,
      );
    }

    if (!entryName.endsWith("/")) {
      if (localHeaderOffset + 30 > contents.length || contents.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Artifact privacy gate found an invalid ZIP local header: ${JSON.stringify(entryName)}`);
      }
      const localNameLength = contents.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = contents.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataOffset + compressedSize;
      if (dataEnd > contents.length) {
        throw new Error(`Artifact privacy gate found truncated ZIP data: ${JSON.stringify(entryName)}`);
      }
      const compressed = contents.subarray(dataOffset, dataEnd);
      let entryContents;
      try {
        entryContents =
          compressionMethod === 0
            ? Buffer.from(compressed)
            : inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) });
      } catch {
        throw new Error(`Artifact privacy gate could not inspect a ZIP entry: ${JSON.stringify(entryName)}`);
      }
      if (entryContents.length !== uncompressedSize) {
        throw new Error(`Artifact privacy gate found a ZIP size mismatch: ${JSON.stringify(entryName)}`);
      }

      const nestedPath = `${archivePath}!/${entryName}`;
      if (path.extname(entryName).toLowerCase() === ".zip") {
        scanZipContents(entryContents, nestedPath, state, depth + 1);
      } else {
        scanRegularContents(entryContents, nestedPath, true);
      }
    }
    offset = nextOffset;
  }
  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new Error(`Artifact privacy gate found an invalid ZIP directory size: ${JSON.stringify(archivePath)}`);
  }
}

async function collectFiles(rootArgument) {
  const workingDirectory = path.resolve(process.cwd());
  const rootPath = path.resolve(workingDirectory, rootArgument);
  if (rootPath !== workingDirectory && !rootPath.startsWith(`${workingDirectory}${path.sep}`)) {
    throw new Error(`Artifact root must stay inside the working directory: ${JSON.stringify(rootArgument)}`);
  }

  const rootStat = await lstat(rootPath);
  if (rootStat.isSymbolicLink()) {
    throw new Error(`Artifact root does not accept symbolic links: ${JSON.stringify(rootArgument)}`);
  }
  if (rootStat.isFile()) return [{ filePath: rootPath, relativePath: path.basename(rootPath), size: rootStat.size }];
  if (!rootStat.isDirectory()) {
    throw new Error(`Artifact root must be a regular file or directory: ${JSON.stringify(rootArgument)}`);
  }

  const pendingDirectories = [rootPath];
  const files = [];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;
    for (const entry of await readdir(directory)) {
      const filePath = path.join(directory, entry);
      const relativePath = path.relative(rootPath, filePath);
      assertSafeDisplayPath(relativePath);
      const fileStat = await lstat(filePath);
      if (fileStat.isSymbolicLink()) {
        throw new Error(`Artifact does not accept symbolic links: ${JSON.stringify(relativePath)}`);
      }
      if (fileStat.isDirectory()) {
        pendingDirectories.push(filePath);
      } else if (fileStat.isFile()) {
        files.push({ filePath, relativePath, size: fileStat.size });
      } else {
        throw new Error(`Artifact only accepts regular files: ${JSON.stringify(relativePath)}`);
      }
    }
  }
  return files;
}

async function scanArtifacts(rootArguments) {
  const files = [];
  for (const rootArgument of rootArguments) files.push(...(await collectFiles(rootArgument)));
  if (files.length === 0) throw new Error("Artifact privacy gate found no files to inspect.");
  if (files.length > MAX_FILES) throw new Error("Artifact privacy gate exceeds the bounded file count.");

  let totalBytes = 0;
  const archiveState = { entryCount: 0, uncompressedBytes: 0 };
  for (const file of files) {
    totalBytes += file.size;
    if (file.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Artifact privacy gate exceeds the bounded file or total size.");
    }
    const normalizedPath = file.relativePath.split(path.sep).join("/");
    const forbiddenFile = FORBIDDEN_FILE_PATTERNS.find(({ pattern }) => pattern.test(normalizedPath));
    if (forbiddenFile) {
      throw new Error(
        `Artifact privacy gate found a forbidden ${forbiddenFile.label}: ${JSON.stringify(normalizedPath)}`,
      );
    }

    const contents = await readFile(file.filePath);
    if (path.extname(normalizedPath).toLowerCase() === ".zip") {
      scanZipContents(contents, normalizedPath, archiveState);
    } else {
      scanRegularContents(contents, normalizedPath);
    }
  }
  return { archiveEntryCount: archiveState.entryCount, fileCount: files.length, totalBytes };
}

try {
  const roots = parseArguments(process.argv.slice(2));
  const result = await scanArtifacts(roots);
  console.log(
    `Artifact privacy gate passed: ${result.fileCount} files, ${result.archiveEntryCount} archive entries, ${result.totalBytes} bytes.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Artifact privacy gate failed.");
  process.exit(1);
}
