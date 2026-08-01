import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MEBIBYTE = 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 50 * MEBIBYTE;
const MAX_TOTAL_BYTES = 1024 * MEBIBYTE;
const PLACEHOLDER_EMAIL_DOMAINS = new Set(["clerk.com", "email.com", "example.com", "example.net", "example.org"]);
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
  { label: "inline source map", pattern: /sourceMappingURL\s*=/ },
];
const EMAIL_PATTERN = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
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
    EMAIL_PATTERN.lastIndex = 0;
    for (const match of contents.matchAll(EMAIL_PATTERN)) {
      const domain = match[1]?.toLowerCase();
      if (
        domain &&
        !PLACEHOLDER_EMAIL_DOMAINS.has(domain) &&
        ![...PLACEHOLDER_EMAIL_DOMAINS].some((placeholder) => domain.endsWith(`.${placeholder}`))
      ) {
        return "non-placeholder email address";
      }
    }
  }
  return undefined;
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

    const extension = path.extname(normalizedPath).toLowerCase();
    const isText = TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(path.basename(normalizedPath));
    const binarySignature = BINARY_SIGNATURES.get(extension);
    if (!isText && !binarySignature) {
      throw new Error(`Artifact privacy gate found an unsupported file type: ${JSON.stringify(normalizedPath)}`);
    }

    const contents = await readFile(file.filePath);
    if (binarySignature && !binarySignature(contents)) {
      throw new Error(`Artifact privacy gate found invalid binary file data: ${JSON.stringify(normalizedPath)}`);
    }
    let searchableContents;
    try {
      searchableContents = isText
        ? new TextDecoder("utf-8", { fatal: true }).decode(contents)
        : contents.toString("latin1");
    } catch {
      throw new Error(`Artifact privacy gate found invalid UTF-8 text: ${JSON.stringify(normalizedPath)}`);
    }
    const sensitiveContent = findSensitiveContent(searchableContents, isText);
    if (sensitiveContent) {
      throw new Error(`Artifact privacy gate found ${sensitiveContent}: ${JSON.stringify(normalizedPath)}`);
    }
  }
  return { fileCount: files.length, totalBytes };
}

try {
  const roots = parseArguments(process.argv.slice(2));
  const result = await scanArtifacts(roots);
  console.log(`Artifact privacy gate passed: ${result.fileCount} files, ${result.totalBytes} bytes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Artifact privacy gate failed.");
  process.exit(1);
}
