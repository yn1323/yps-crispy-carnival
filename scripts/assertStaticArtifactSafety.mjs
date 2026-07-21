import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MEBIBYTE = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_PIXELS = 20_000_000;
const PNG_CRITICAL_CHUNKS = new Set(["IDAT", "IEND", "IHDR", "PLTE"]);
const FORBIDDEN_PAGES_FILES = new Set(["_headers", "_redirects", "_routes.json", "_worker.js"]);
const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const profiles = {
  "preview-dist": {
    allowedExtensions: new Set([
      ".avif",
      ".css",
      ".gif",
      ".html",
      ".ico",
      ".jpeg",
      ".jpg",
      ".js",
      ".json",
      ".png",
      ".svg",
      ".ttf",
      ".txt",
      ".webp",
      ".woff",
      ".woff2",
      ".xml",
    ]),
    maxFiles: 10_000,
    maxFileBytes: 25 * MEBIBYTE,
    maxTotalBytes: 300 * MEBIBYTE,
    requiredPaths: ["index.html"],
    forbiddenBasenames: FORBIDDEN_PAGES_FILES,
    pngOnly: false,
  },
  "vrt-screenshots": {
    allowedExtensions: new Set([".png"]),
    maxFiles: 5_000,
    maxFileBytes: 25 * MEBIBYTE,
    maxTotalBytes: 500 * MEBIBYTE,
    requiredPaths: [],
    forbiddenBasenames: new Set(),
    pngOnly: true,
  },
  "vrt-report": {
    allowedExtensions: new Set([".css", ".html", ".js", ".json", ".png", ".svg", ".wasm"]),
    maxFiles: 15_000,
    maxFileBytes: 25 * MEBIBYTE,
    maxTotalBytes: 750 * MEBIBYTE,
    requiredPaths: ["index.html", "out.json"],
    forbiddenBasenames: FORBIDDEN_PAGES_FILES,
    pngOnly: false,
  },
};

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value || values.has(option)) {
      throw new Error("Usage: --profile <preview-dist|vrt-screenshots|vrt-report> --root <directory>");
    }
    values.set(option, value);
  }
  if (values.size !== 2 || !values.has("--profile") || !values.has("--root")) {
    throw new Error("Usage: --profile <preview-dist|vrt-screenshots|vrt-report> --root <directory>");
  }
  return { profileName: values.get("--profile"), rootArgument: values.get("--root") };
}

function assertSafeRelativePath(relativePath) {
  const hasControlCharacter = [...relativePath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath.includes("\\") ||
    hasControlCharacter
  ) {
    throw new Error(`Artifact contains an unsafe path: ${JSON.stringify(relativePath)}`);
  }
  for (const segment of relativePath.split(path.sep)) {
    if (!segment || segment === "." || segment === ".." || segment.startsWith(".")) {
      throw new Error(`Artifact contains an unsafe path segment: ${JSON.stringify(relativePath)}`);
    }
  }
}

function crc32(contents, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC32_TABLE[(crc ^ contents[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function assertValidPng(filePath, relativePath) {
  const contents = await readFile(filePath);
  if (contents.length < PNG_SIGNATURE.length || !contents.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Artifact PNG signature is invalid: ${relativePath}`);
  }

  let offset = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset < contents.length) {
    if (contents.length - offset < 12) throw new Error(`Artifact PNG chunk is truncated: ${relativePath}`);
    const dataLength = contents.readUInt32BE(offset);
    if (dataLength > contents.length - offset - 12) {
      throw new Error(`Artifact PNG chunk length is invalid: ${relativePath}`);
    }
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + dataLength;
    const chunkEnd = dataEnd + 4;
    const chunkType = contents.toString("ascii", typeStart, dataStart);
    if (!/^[A-Za-z]{4}$/.test(chunkType)) {
      throw new Error(`Artifact PNG chunk type is invalid: ${relativePath}`);
    }
    const expectedCrc = contents.readUInt32BE(dataEnd);
    if (crc32(contents, typeStart, dataEnd) !== expectedCrc) {
      throw new Error(`Artifact PNG chunk checksum is invalid: ${relativePath}`);
    }
    if (chunkType[0] === chunkType[0].toUpperCase() && !PNG_CRITICAL_CHUNKS.has(chunkType)) {
      throw new Error(`Artifact PNG contains an unknown critical chunk: ${relativePath}`);
    }

    if (chunkType === "IHDR") {
      if (sawHeader || offset !== PNG_SIGNATURE.length || dataLength !== 13) {
        throw new Error(`Artifact PNG header is invalid: ${relativePath}`);
      }
      const width = contents.readUInt32BE(dataStart);
      const height = contents.readUInt32BE(dataStart + 4);
      const compression = contents[dataStart + 10];
      const filter = contents[dataStart + 11];
      const interlace = contents[dataStart + 12];
      if (
        width === 0 ||
        height === 0 ||
        width * height > MAX_PNG_PIXELS ||
        compression !== 0 ||
        filter !== 0 ||
        ![0, 1].includes(interlace)
      ) {
        throw new Error(`Artifact PNG dimensions or encoding are outside the safety bounds: ${relativePath}`);
      }
      sawHeader = true;
    } else if (!sawHeader) {
      throw new Error(`Artifact PNG header must be the first chunk: ${relativePath}`);
    } else if (chunkType === "IDAT") {
      if (sawEnd) throw new Error(`Artifact PNG image data follows its end marker: ${relativePath}`);
      sawImageData = true;
    } else if (chunkType === "IEND") {
      if (!sawImageData || sawEnd || dataLength !== 0 || chunkEnd !== contents.length) {
        throw new Error(`Artifact PNG end marker is invalid: ${relativePath}`);
      }
      sawEnd = true;
    }
    offset = chunkEnd;
  }
  if (!sawHeader || !sawImageData || !sawEnd) {
    throw new Error(`Artifact PNG structure is incomplete: ${relativePath}`);
  }
}

async function validateArtifact(rootArgument, profile) {
  const rootPath = path.resolve(process.cwd(), rootArgument);
  const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Artifact root must be a regular directory, not a symbolic link.");
  }
  const pendingDirectories = [rootPath];
  const relativeFiles = [];
  let totalBytes = 0;

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;
    const entries = await readdir(directory);
    for (const entry of entries) {
      const filePath = path.join(directory, entry);
      const relativePath = path.relative(rootPath, filePath);
      assertSafeRelativePath(relativePath);
      const fileStat = await lstat(filePath);
      if (fileStat.isSymbolicLink()) {
        throw new Error(`Artifact does not accept symbolic links: ${relativePath}`);
      }
      if (fileStat.isDirectory()) {
        pendingDirectories.push(filePath);
        continue;
      }
      if (!fileStat.isFile()) {
        throw new Error(`Artifact only accepts regular files: ${relativePath}`);
      }

      const basename = path.basename(relativePath).toLowerCase();
      const extension = path.extname(basename);
      if (
        profile.pngOnly &&
        relativePath.split(path.sep).some((segment) => !/^[\p{L}\p{M}\p{N}._()（）-]+$/u.test(segment))
      ) {
        throw new Error(`VRT artifact path contains characters outside the safe report allowlist: ${relativePath}`);
      }
      if (profile.forbiddenBasenames.has(basename)) {
        throw new Error(`Artifact contains a forbidden Pages control file: ${relativePath}`);
      }
      if (!profile.allowedExtensions.has(extension)) {
        throw new Error(`Artifact contains a file type outside the allowlist: ${relativePath}`);
      }
      if (fileStat.size > profile.maxFileBytes) {
        throw new Error(`Artifact file exceeds the size limit: ${relativePath}`);
      }
      if (extension === ".png" || profile.pngOnly) await assertValidPng(filePath, relativePath);

      relativeFiles.push(relativePath);
      totalBytes += fileStat.size;
      if (relativeFiles.length > profile.maxFiles || totalBytes > profile.maxTotalBytes) {
        throw new Error("Artifact exceeds the bounded file count or total size.");
      }
    }
  }

  if (relativeFiles.length === 0) {
    throw new Error("Artifact contains no files.");
  }
  const relativeFileSet = new Set(relativeFiles);
  for (const requiredPath of profile.requiredPaths) {
    if (!relativeFileSet.has(requiredPath)) {
      throw new Error(`Artifact is missing required file: ${requiredPath}`);
    }
  }

  return { fileCount: relativeFiles.length, totalBytes };
}

try {
  const { profileName, rootArgument } = parseArguments(process.argv.slice(2));
  const profile = profiles[profileName];
  if (!profile) throw new Error(`Unknown artifact profile: ${profileName}`);
  const result = await validateArtifact(rootArgument, profile);
  console.log(`Static artifact safety gate passed: ${result.fileCount} regular files, ${result.totalBytes} bytes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Static artifact safety gate failed.");
  process.exit(1);
}
