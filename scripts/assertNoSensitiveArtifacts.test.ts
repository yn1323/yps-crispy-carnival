import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GATE_PATH = path.join(SCRIPT_DIRECTORY, "assertNoSensitiveArtifacts.mjs");
// Build the synthetic key at runtime so secret scanners do not flag the fixture itself.
const STRIPE_KEY_FIXTURE = ["sk", "live", "1234567890abcdefghijklmnop"].join("_");
let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "artifact-privacy-"));
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

function runGate(...roots: string[]) {
  return spawnSync(process.execPath, [GATE_PATH, ...roots.flatMap((root) => ["--root", root])], {
    cwd: testDirectory,
    encoding: "utf8",
  });
}

describe("artifact privacy gate", () => {
  it("accepts static files containing placeholder and vendor support addresses", () => {
    mkdirSync(path.join(testDirectory, "dist"));
    writeFileSync(path.join(testDirectory, "dist/index.html"), "Contact example@example.com or support@clerk.com");

    const result = runGate("dist");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 files");
  });

  it("accepts and scans Cloudflare Pages text configuration", () => {
    writeFileSync(path.join(testDirectory, "_headers"), '/cache-reset\n  Clear-Site-Data: "cache"');
    writeFileSync(path.join(testDirectory, "_redirects"), "/features/ /features 200");

    const result = runGate("_headers", "_redirects");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("2 files");
  });

  it.each([
    ["Stripe key", STRIPE_KEY_FIXTURE],
    ["private key", "-----BEGIN PRIVATE KEY-----"],
    ["secret identifier", "STRIPE_WEBHOOK_SECRET"],
    ["publisher secret identifier", "REPORT_PUBLISHER_HOSTING_PAGES_TOKEN"],
    ["session token", "eyJabcdefghijklmnop.qrstuvwxyzABCDEFGHIJ.klmnopqrstuvwxyzABCDEF"],
  ])("rejects %s without echoing the detected value", (_label, sensitiveValue) => {
    writeFileSync(path.join(testDirectory, "report.json"), JSON.stringify({ value: sensitiveValue }));

    const result = runGate("report.json");

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(sensitiveValue);
  });

  it("rejects a non-placeholder customer email", () => {
    writeFileSync(path.join(testDirectory, "report.html"), "customer-123@gmail.com");

    const result = runGate("report.html");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-placeholder email address");
    expect(result.stderr).not.toContain("customer-123@gmail.com");
  });

  it("does not interpret email-like bytes in a recognized binary as customer text", () => {
    writeFileSync(
      path.join(testDirectory, "image.png"),
      Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("customer-123@gmail.com")]),
    );

    expect(runGate("image.png").status).toBe(0);
  });

  it("still finds a high-confidence secret prefix in a recognized binary", () => {
    const sensitiveValue = STRIPE_KEY_FIXTURE;
    writeFileSync(
      path.join(testDirectory, "image.png"),
      Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(sensitiveValue)]),
    );

    const result = runGate("image.png");

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(sensitiveValue);
  });

  it("rejects unsupported opaque artifacts instead of silently skipping them", () => {
    writeFileSync(path.join(testDirectory, "trace.zip"), "opaque");

    const result = runGate("trace.zip");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported file type");
  });

  it("rejects other extensionless files", () => {
    writeFileSync(path.join(testDirectory, "opaque"), "text-like but unsupported");

    expect(runGate("opaque").status).toBe(1);
  });

  it("rejects a binary extension whose magic bytes do not match", () => {
    writeFileSync(path.join(testDirectory, "image.png"), "not a PNG");

    const result = runGate("image.png");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid binary file data");
  });

  it.each(["app.js.map", ".env.production", "storage-state.json", "access.log", "signing.pem"])(
    "rejects forbidden artifact file %s",
    (filename) => {
      writeFileSync(path.join(testDirectory, filename), "not-sensitive-by-content");

      expect(runGate(filename).status).toBe(1);
    },
  );

  it("detects Playwright storage state by shape even under an ordinary filename", () => {
    writeFileSync(path.join(testDirectory, "state.json"), '{"cookies":[],"origins":[]}');

    const result = runGate("state.json");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated browser storage state");
  });

  it("rejects symbolic links", () => {
    mkdirSync(path.join(testDirectory, "dist"));
    writeFileSync(path.join(testDirectory, "outside.txt"), "safe");
    symlinkSync(path.join(testDirectory, "outside.txt"), path.join(testDirectory, "dist/link.txt"));

    const result = runGate("dist");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not accept symbolic links");
  });
});
