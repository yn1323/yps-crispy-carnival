import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GATE_PATH = path.join(SCRIPT_DIRECTORY, "assertStaticArtifactSafety.mjs");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let testDirectory: string;

function crc32(contents: Buffer) {
  let crc = 0xffffffff;
  for (const value of contents) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPng(width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanline = Buffer.alloc(1 + 3 * Math.min(width, 1));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanline)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "static-artifact-safety-"));
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

function runGate(
  profile: "playwright-public-report" | "playwright-result" | "preview-dist" | "vrt-report" | "vrt-screenshots",
) {
  return spawnSync(process.execPath, [GATE_PATH, "--profile", profile, "--root", testDirectory], {
    encoding: "utf8",
  });
}

describe("static artifact safety gate", () => {
  it("accepts a bounded static preview artifact", () => {
    mkdirSync(path.join(testDirectory, "assets"));
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(testDirectory, "assets/app.js"), "console.log('preview')");

    const result = runGate("preview-dist");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 regular files");
  });

  it("rejects Pages control files from an untrusted preview", () => {
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(testDirectory, "_worker.js"), "export default { fetch() {} }");

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forbidden Pages control file");
  });

  it("rejects file types outside the selected profile", () => {
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(testDirectory, "run.sh"), "echo unsafe");

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside the allowlist");
  });

  it("rejects symbolic links", () => {
    const target = path.join(testDirectory, "index.html");
    writeFileSync(target, "<!doctype html>");
    symlinkSync(target, path.join(testDirectory, "linked.html"));

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not accept symbolic links");
  });

  it("accepts structurally valid PNG screenshot data", () => {
    writeFileSync(path.join(testDirectory, "story.png"), createPng());

    expect(runGate("vrt-screenshots").status).toBe(0);
  });

  it("rejects files renamed to PNG without a PNG signature", () => {
    writeFileSync(path.join(testDirectory, "story.png"), "not a png");

    const result = runGate("vrt-screenshots");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PNG signature is invalid");
  });

  it("rejects screenshot names that could inject markup into a generated report", () => {
    writeFileSync(path.join(testDirectory, "story<script>.png"), createPng());

    const result = runGate("vrt-screenshots");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("safe report allowlist");
  });

  it("requires the profile entry point", () => {
    writeFileSync(path.join(testDirectory, "assets.js"), "console.log('missing index')");

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required file: index.html");
  });

  it("rejects hidden path segments", () => {
    mkdirSync(path.join(testDirectory, ".hidden"));
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(testDirectory, ".hidden/app.js"), "console.log('hidden')");

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsafe path segment");
  });

  it("rejects a file over the profile size bound", () => {
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    const oversized = path.join(testDirectory, "oversized.js");
    writeFileSync(oversized, "");
    truncateSync(oversized, 25 * 1024 * 1024 + 1);

    const result = runGate("preview-dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exceeds the size limit");
  });

  it("rejects a valid PNG whose dimensions exceed the pixel bound", () => {
    writeFileSync(path.join(testDirectory, "huge.png"), createPng(10_000, 10_000));

    const result = runGate("vrt-screenshots");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside the safety bounds");
  });

  it("accepts one Playwright JSON result file", () => {
    writeFileSync(path.join(testDirectory, "test-results-deployed.json"), JSON.stringify({ suites: [] }));

    const result = runGate("playwright-result");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 regular files");
  });

  it("rejects extra files in the Playwright result artifact", () => {
    writeFileSync(path.join(testDirectory, "test-results-deployed.json"), JSON.stringify({ suites: [] }));
    writeFileSync(path.join(testDirectory, "trace.json"), "{}");

    const result = runGate("playwright-result");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path outside the selected profile");
  });

  it("rejects a malformed Playwright result artifact", () => {
    writeFileSync(path.join(testDirectory, "test-results-deployed.json"), JSON.stringify({ errors: [] }));

    const result = runGate("playwright-result");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not contain a suites array");
  });

  it("accepts a script-free public Playwright report", () => {
    writeFileSync(path.join(testDirectory, "index.html"), '<!doctype html><a href="https://example.com">Report</a>');
    writeFileSync(path.join(testDirectory, "report.json"), JSON.stringify({ schemaVersion: 1 }));

    const result = runGate("playwright-public-report");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 regular files");
  });

  it.each([
    ["<script>alert(1)</script>"],
    ['<img src="x" onerror="alert(1)">'],
    ['<a href="javascript:alert(1)">unsafe</a>'],
  ])("rejects active content from a public Playwright report", (activeHtml) => {
    writeFileSync(path.join(testDirectory, "index.html"), `<!doctype html>${activeHtml}`);
    writeFileSync(path.join(testDirectory, "report.json"), JSON.stringify({ schemaVersion: 1 }));

    const result = runGate("playwright-public-report");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("active HTML or JavaScript");
  });

  it("rejects files outside the fixed public Playwright report schema", () => {
    writeFileSync(path.join(testDirectory, "index.html"), "<!doctype html>");
    writeFileSync(path.join(testDirectory, "report.json"), JSON.stringify({ schemaVersion: 1 }));
    writeFileSync(path.join(testDirectory, "app.js"), "console.log('unsafe')");

    const result = runGate("playwright-public-report");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("path outside the selected profile");
  });
});
