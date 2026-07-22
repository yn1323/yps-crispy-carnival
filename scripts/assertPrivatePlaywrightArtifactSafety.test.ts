import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GATE_SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "assertPrivatePlaywrightArtifactSafety.mjs");
const CREDENTIALS = {
  E2E_CLERK_USERS: "artifact-user-1@shiftori.invalid,artifact-user-2@shiftori.invalid",
  E2E_CLERK_PASSWORD: "artifact-password-sentinel",
  CLERK_SECRET_KEY: "artifact-clerk-secret-sentinel",
  CONVEX_DEPLOY_KEY: "artifact-convex-key-sentinel",
} as const;

let testDirectory: string;

function crc32(contents: Buffer) {
  let crc = 0xffffffff;
  for (const value of contents) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: Array<{ name: string; contents: string; mode?: number; compressed?: boolean }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const contents = Buffer.from(entry.contents);
    const compressionMethod = entry.compressed ? 8 : 0;
    const compressedContents = entry.compressed ? deflateRawSync(contents) : contents;
    const checksum = crc32(contents);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedContents.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressedContents);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedContents.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressedContents.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "private-playwright-artifact-safety-"));
  mkdirSync(path.join(testDirectory, "playwright-report"));
  mkdirSync(path.join(testDirectory, "test-results"));
  writeFileSync(path.join(testDirectory, "test-results.json"), '{"suites":[]}');
  writeFileSync(path.join(testDirectory, "playwright-report", "index.html"), "<html>safe</html>");
  writeFileSync(
    path.join(testDirectory, "test-results", "trace.zip"),
    createZip([{ name: "trace.trace", contents: "safe trace", compressed: true }]),
  );
});

afterEach(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

function runGate({ args = [], env = CREDENTIALS }: { args?: string[]; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, [GATE_SCRIPT_PATH, ...args], {
    cwd: testDirectory,
    encoding: "utf8",
    env,
  });
}

describe("private Playwright artifact safety gate", () => {
  it("accepts bounded diagnostics including a deflated Playwright trace ZIP", () => {
    const result = runGate();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("3 files checked");
  });

  it.each(Object.entries(CREDENTIALS).filter(([name]) => name !== "E2E_CLERK_USERS"))(
    "rejects configured secret %s without echoing its value",
    (name, value) => {
      writeFileSync(path.join(testDirectory, "test-results.json"), value);

      const result = runGate();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(name);
      expect(result.stderr).not.toContain(value);
    },
  );

  it("finds a configured secret inside a compressed trace", () => {
    const password = CREDENTIALS.E2E_CLERK_PASSWORD;
    writeFileSync(
      path.join(testDirectory, "test-results", "trace.zip"),
      createZip([{ name: "trace.trace", contents: `secret=${password}`, compressed: true }]),
    );

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_CLERK_PASSWORD");
    expect(result.stderr).not.toContain(password);
  });

  it("redacts known E2E identifiers from text while retaining private traces", () => {
    const [firstUser] = CREDENTIALS.E2E_CLERK_USERS.split(",");
    const errorContextPath = path.join(testDirectory, "playwright-report", "error-context.md");
    writeFileSync(errorContextPath, `signed in as ${firstUser}`);
    writeFileSync(
      path.join(testDirectory, "test-results", "trace.zip"),
      createZip([{ name: "trace.trace", contents: `signed in as ${firstUser}`, compressed: true }]),
    );

    const result = runGate({ args: ["--redact-known-identifiers"] });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 text files redacted");
    expect(readFileSync(errorContextPath, "utf8")).toBe("signed in as e2e-user-1@example.com");
  });

  it("does not partially redact when another file contains a rejected secret", () => {
    const [firstUser] = CREDENTIALS.E2E_CLERK_USERS.split(",");
    const errorContextPath = path.join(testDirectory, "playwright-report", "error-context.md");
    const original = `signed in as ${firstUser}`;
    writeFileSync(errorContextPath, original);
    writeFileSync(path.join(testDirectory, "test-results.json"), CREDENTIALS.CLERK_SECRET_KEY);

    expect(runGate({ args: ["--redact-known-identifiers"] }).status).toBe(1);
    expect(readFileSync(errorContextPath, "utf8")).toBe(original);
  });

  it.each([".env.production", "storage-state.json", "signing.pem"])(
    "rejects forbidden private artifact file %s",
    (filename) => {
      writeFileSync(path.join(testDirectory, "playwright-report", filename), "safe content");

      const result = runGate();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("forbidden");
    },
  );

  it("rejects storage state content under an ordinary filename", () => {
    writeFileSync(path.join(testDirectory, "playwright-report", "state.json"), '{"origins":[],"cookies":[]}');

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("storage state");
  });

  it("rejects a forbidden storage-state entry inside a trace ZIP", () => {
    writeFileSync(
      path.join(testDirectory, "test-results", "trace.zip"),
      createZip([{ name: ".auth/storage-state.json", contents: '{"cookies":[]}' }]),
    );

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated browser storage state");
  });

  it("rejects storage state content under an ordinary trace ZIP entry name", () => {
    writeFileSync(
      path.join(testDirectory, "test-results", "trace.zip"),
      createZip([{ name: "resources/state.json", contents: '{"cookies":[],"origins":[]}', compressed: true }]),
    );

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("storage state");
  });

  it("accepts storage state metadata nested in a Playwright context-options trace event", () => {
    const traceEvent = JSON.stringify({
      type: "context-options",
      options: {
        storageState: {
          cookies: [{ name: "session", value: "generated-session-value" }],
          origins: [],
        },
      },
    });
    writeFileSync(
      path.join(testDirectory, "test-results", "trace.zip"),
      createZip([{ name: "trace.trace", contents: `${traceEvent}\n`, compressed: true }]),
    );

    const result = runGate();

    expect(result.status).toBe(0);
  });

  it("rejects a high-confidence secret not supplied through the environment", () => {
    const secret = ["sk", "live", "1234567890abcdefghijklmnop"].join("_");
    writeFileSync(path.join(testDirectory, "playwright-report", "details.md"), secret);

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("secret key");
    expect(result.stderr).not.toContain(secret);
  });

  it("rejects symbolic links", () => {
    symlinkSync(
      path.join(testDirectory, "test-results.json"),
      path.join(testDirectory, "playwright-report", "report-link.json"),
    );

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not accept symbolic links");
  });

  it("rejects an invalid ZIP instead of treating it as opaque", () => {
    writeFileSync(path.join(testDirectory, "test-results", "trace.zip"), "not a zip");

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ZIP end record is invalid");
  });

  it("rejects unsupported artifact types", () => {
    writeFileSync(path.join(testDirectory, "playwright-report", "run.sh"), "echo unsafe");

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported file type");
  });

  it("rejects a file over the private artifact size bound before reading it", () => {
    const oversized = path.join(testDirectory, "playwright-report", "oversized.txt");
    writeFileSync(oversized, "");
    truncateSync(oversized, 100 * 1024 * 1024 + 1);

    const result = runGate();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("size limit");
  });

  it("fails closed when required credentials are unavailable", () => {
    const { CONVEX_DEPLOY_KEY: _, ...incompleteCredentials } = CREDENTIALS;

    const result = runGate({ env: incompleteCredentials });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CONVEX_DEPLOY_KEY");
  });
});
