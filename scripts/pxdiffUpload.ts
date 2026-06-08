import { spawn } from "node:child_process";
import { appendFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const actualDir = process.env.PXDIFF_ACTUAL_DIR ?? "vrt-actual";
const outputPath = process.env.PXDIFF_OUTPUT_JSON ?? "pxdiff-output.json";
const cliVersion = process.env.PXDIFF_CLI_VERSION ?? "0.0.16";
const apiKey = process.env.PXDIFF_API_KEY;
const suite = process.env.PXDIFF_SUITE ?? "storybook-poc";
const threshold = process.env.PXDIFF_THRESHOLD;
const autoApprove = process.env.PXDIFF_AUTO_APPROVE === "true";

if (!apiKey) {
  throw new Error("PXDIFF_API_KEY is required for pxdiff upload.");
}

const pngCount = await countPngFiles(path.resolve(process.cwd(), actualDir));
if (pngCount === 0) {
  throw new Error(`No PNG files found in ${actualDir}. Run pnpm vrt:capture before uploading.`);
}

const cliPackage = `@pxdiff/cli@${cliVersion}`;
const uploadArgs = ["dlx", cliPackage, "upload", actualDir, "--suite", suite];

// pxdiff 0.0.16 applies auto-approval when the capture is created. The following
// diff step still produces the review URL and changed/new counts for PR comments.
if (autoApprove) {
  uploadArgs.push("--auto-approve");
}

const uploadResult = await run("pnpm", uploadArgs, {
  PXDIFF_API_KEY: apiKey,
});
const captureId = parseCaptureId(`${uploadResult.stdout}\n${uploadResult.stderr}`);

const diffArgs = ["dlx", cliPackage, "diff", "--head-capture", captureId, "--output", "json", "--suite", suite];
if (threshold) {
  diffArgs.push("--threshold", threshold);
}

const diffResult = await run("pnpm", diffArgs, {
  PXDIFF_API_KEY: apiKey,
});

const summary = parsePxdiffSummary(diffResult.stdout);
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
await writeGitHubOutputs(summary);

async function countPngFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  let count = 0;
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countPngFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".png")) {
      const fileStat = await stat(entryPath);
      if (fileStat.size > 0) count += 1;
    }
  }

  return count;
}

function run(command: string, args: string[], extraEnv: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      if (hasPxdiffSummary(stdout)) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stderr.includes("@pxdiff/core")
        ? "\npxdiff CLI currently depends on @pxdiff/core, which was not available from npm during setup. Pin PXDIFF_CLI_VERSION or install a fixed pxdiff CLI when upstream republishes it."
        : "";
      reject(new Error(`pxdiff command failed with exit code ${code}.${details}`));
    });
  });
}

function hasPxdiffSummary(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => {
      if (!line.startsWith("{") || !line.endsWith("}")) return false;
      try {
        const payload = JSON.parse(line) as Record<string, unknown>;
        return "status" in payload || "reviewUrl" in payload || "diffUrl" in payload || "diff_url" in payload;
      } catch {
        return false;
      }
    });
}

function parseCaptureId(output: string) {
  const match = output.match(/Capture ID:\s*([^\s]+)/);
  if (!match?.[1]) {
    throw new Error("pxdiff upload did not return a Capture ID.");
  }
  return match[1];
}

function parsePxdiffSummary(stdout: string) {
  const parsedObjects = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });

  const payload = parsedObjects.at(-1) ?? {};
  const summary = isRecord(payload.summary) ? payload.summary : {};
  const changed = toNumber(payload.changed ?? payload.changedSnapshots ?? summary.changed);
  const fresh = toNumber(payload.new ?? payload.newSnapshots ?? summary.new);
  const removed = toNumber(payload.removed ?? payload.removedSnapshots ?? summary.removed);
  const hasChanges = changed > 0 || fresh > 0 || removed > 0;
  const status = String(payload.status ?? (hasChanges ? "failed" : "passed"));

  return {
    status: status === "completed" ? (hasChanges ? "failed" : "passed") : status,
    changed,
    new: fresh,
    removed,
    diff_url: toOutputString(payload.diff_url ?? payload.diffUrl ?? payload.reviewUrl ?? payload.url),
    capture_id: toOutputString(payload.capture_id ?? payload.captureId),
    diff_id: toOutputString(payload.diff_id ?? payload.diffId ?? payload.diffID),
    png_count: pngCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}

function toOutputString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function writeGitHubOutputs(summary: ReturnType<typeof parsePxdiffSummary>) {
  if (!process.env.GITHUB_OUTPUT) return;

  const lines = Object.entries(summary).map(([key, value]) => `${key}=${value}`);
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
