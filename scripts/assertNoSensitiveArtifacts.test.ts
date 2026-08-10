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
const CAPABILITY_TOKEN_FIXTURE = ["123e4567", "e89b", "12d3", "a456", "426614174000"].join("-");
const CLERK_SESSION_ID_FIXTURE = ["sess", "3HMzXdDIrBEahLYAhJlnHtXsPPj"].join("_");
let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), "artifact-privacy-"));
});

afterEach(() => {
  rmSync(testDirectory, { force: true, recursive: true });
});

function runGate(...roots: string[]) {
  return runGateWithEnvironment({}, ...roots);
}

function runGateWithEnvironment(environment: NodeJS.ProcessEnv, ...roots: string[]) {
  return spawnSync(process.execPath, [GATE_PATH, ...roots.flatMap((root) => ["--root", root])], {
    cwd: testDirectory,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

function createStoredZip(entries: Array<{ name: string; contents: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const contents = Buffer.from(entry.contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(contents.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + contents.length;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, eocd]);
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

  it("大きなminified HTMLをboundedに検査する", () => {
    writeFileSync(path.join(testDirectory, "report.html"), `<script>${"A".repeat(1_000_000)}</script>`);

    expect(runGate("report.html").status).toBe(0);
  });

  it.each([
    ["Stripe key", STRIPE_KEY_FIXTURE],
    ["private key", "-----BEGIN PRIVATE KEY-----"],
    ["secret identifier", "STRIPE_WEBHOOK_SECRET"],
    ["publisher secret identifier", "REPORT_PUBLISHER_HOSTING_PAGES_TOKEN"],
    ["session token", "eyJabcdefghijklmnop.qrstuvwxyzABCDEFGHIJ.klmnopqrstuvwxyzABCDEF"],
    ["Clerk session identifier", CLERK_SESSION_ID_FIXTURE],
    ["capability URL", `/shifts/submit?token=${CAPABILITY_TOKEN_FIXTURE}`],
    ["capability field", JSON.stringify({ token: CAPABILITY_TOKEN_FIXTURE })],
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

  it("placeholder domainでも設定済みE2E identityとcredentialを拒否する", () => {
    const configuredEmail = "reserved-e2e-user@example.com";
    const configuredPassword = "configured-e2e-password-sentinel";
    writeFileSync(path.join(testDirectory, "error-context.md"), `${configuredEmail}\n${configuredPassword}`);

    const result = runGateWithEnvironment(
      {
        E2E_CLERK_USERS: configuredEmail,
        E2E_CLERK_PASSWORD: configuredPassword,
      },
      "error-context.md",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("configured E2E identity or credential");
    expect(result.stderr).not.toContain(configuredEmail);
    expect(result.stderr).not.toContain(configuredPassword);
  });

  it("ANSI装飾で分断された設定済みE2E identityとcredentialも拒否する", () => {
    const configuredEmail = "ansi-e2e-user@example.com";
    const configuredPassword = "ansi-e2e-password-sentinel";
    const insertAnsi = (value: string) => `${value.slice(0, 10)}\u001b[7m${value.slice(10)}\u001b[27m`;
    writeFileSync(
      path.join(testDirectory, "error-context.md"),
      `${insertAnsi(configuredEmail)}\n${insertAnsi(configuredPassword)}`,
    );

    const result = runGateWithEnvironment(
      {
        E2E_CLERK_USERS: configuredEmail,
        E2E_CLERK_PASSWORD: configuredPassword,
      },
      "error-context.md",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("configured E2E identity or credential");
    expect(result.stderr).not.toContain(configuredEmail);
    expect(result.stderr).not.toContain(configuredPassword);
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

  it("Playwright trace ZIPの内部テキストを検査する", () => {
    writeFileSync(path.join(testDirectory, "trace.zip"), createStoredZip([{ name: "trace.trace", contents: "safe" }]));

    expect(runGate("trace.zip").status).toBe(0);
  });

  it("ZIP内部の機密値を値そのものを出さず拒否する", () => {
    writeFileSync(
      path.join(testDirectory, "trace.zip"),
      createStoredZip([{ name: "trace.trace", contents: STRIPE_KEY_FIXTURE }]),
    );

    const result = runGate("trace.zip");

    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(STRIPE_KEY_FIXTURE);
  });

  it("Playwright HTMLに埋め込まれたreport ZIPも検査する", () => {
    const embeddedReport = createStoredZip([{ name: "report.json", contents: CLERK_SESSION_ID_FIXTURE }]);
    writeFileSync(
      path.join(testDirectory, "index.html"),
      `<script>window.report = "data:application/zip;base64,${embeddedReport.toString("base64")}"</script>`,
    );

    const result = runGate("index.html");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Clerk session identifier");
    expect(result.stderr).not.toContain(CLERK_SESSION_ID_FIXTURE);
  });

  it("ZIP内部のbearer capability URLを拒否する", () => {
    const capabilityUrl = `/shifts/view?token=${CAPABILITY_TOKEN_FIXTURE}`;
    writeFileSync(
      path.join(testDirectory, "trace.zip"),
      createStoredZip([{ name: "trace.network", contents: capabilityUrl }]),
    );

    const result = runGate("trace.zip");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bearer capability URL");
    expect(result.stderr).not.toContain(CAPABILITY_TOKEN_FIXTURE);
  });

  it("ZIP path traversalを拒否する", () => {
    writeFileSync(
      path.join(testDirectory, "trace.zip"),
      createStoredZip([{ name: "../trace.trace", contents: "safe" }]),
    );

    expect(runGate("trace.zip").status).toBe(1);
  });

  it("壊れたZIPを検査不能のまま成功扱いしない", () => {
    writeFileSync(path.join(testDirectory, "trace.zip"), "opaque");

    const result = runGate("trace.zip");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid ZIP archive");
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
