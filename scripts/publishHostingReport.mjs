#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE_REPOSITORY = "yn1323/yps-crispy-carnival";
export const HOSTING_REPOSITORY = "yn1323/hosting-pages";
export const REPORT_BRANCH = "yps-reports";

function git(repository, args, options = {}) {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    input: options.input,
    env: options.env ?? process.env,
  }).trim();
}

function assertSafeTarget(value, label) {
  if (!value || path.isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function assertPositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function assertSourceTree(source, requiredFiles) {
  const root = path.resolve(source);
  if (!lstatSync(root).isDirectory()) throw new Error(`Report source must be a directory: ${root}`);
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      if ([".git", ".report-meta.json"].includes(name)) throw new Error(`Reserved report source path: ${name}`);
      const absolute = path.join(directory, name);
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) throw new Error(`Report source contains a symlink: ${absolute}`);
      if (stats.isDirectory()) visit(absolute);
      else if (!stats.isFile()) throw new Error(`Unsupported report source entry: ${absolute}`);
    }
  };
  visit(root);
  for (const relative of requiredFiles) {
    const absolute = path.join(root, relative);
    if (!lstatSync(absolute).isFile()) throw new Error(`Report source is missing ${relative}`);
  }
  return root;
}

function copyDirectoryContents(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    cpSync(path.join(source, name), path.join(destination, name), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
}

function resolveInside(repository, relative) {
  const root = path.resolve(repository);
  const resolved = path.resolve(root, assertSafeTarget(relative, "target"));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Target escapes repository: ${relative}`);
  return resolved;
}

export function normalizePublishRequest(input) {
  const reportType = input.reportType;
  if (!["playwright", "vrt"].includes(reportType)) throw new Error(`Invalid report type: ${reportType}`);
  const sourceSha = String(input.sourceSha ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error(`Invalid source SHA: ${input.sourceSha}`);
  const pullRequest =
    input.pullRequest == null || input.pullRequest === ""
      ? null
      : assertPositiveInteger(input.pullRequest, "pull request");
  const sourceBranch = input.sourceBranch || null;
  if ((pullRequest === null) === (sourceBranch === null)) {
    throw new Error("Exactly one of pullRequest or sourceBranch is required");
  }
  if (sourceBranch !== null && !["develop", "main"].includes(sourceBranch)) {
    throw new Error(`Invalid source branch: ${sourceBranch}`);
  }

  const target = assertSafeTarget(input.target, "report target");
  const expectedTarget =
    reportType === "playwright"
      ? pullRequest === null
        ? null
        : `yps-crispy-carnival/${pullRequest}`
      : pullRequest === null
        ? `yps-crispy-carnival-vrt/branches/${sourceBranch}`
        : `yps-crispy-carnival-vrt/pr-${pullRequest}`;
  if (target !== expectedTarget) throw new Error(`Report target does not match its source: ${target}`);

  const baselineSource = input.baselineSource || null;
  const baselineTarget = input.baselineTarget || null;
  if ((baselineSource === null) !== (baselineTarget === null)) {
    throw new Error("baselineSource and baselineTarget must be provided together");
  }
  if (baselineTarget !== null) {
    assertSafeTarget(baselineTarget, "baseline target");
    if (reportType !== "vrt" || pullRequest !== null) throw new Error("Only branch VRT runs may update a baseline");
    if (baselineTarget !== `yps-crispy-carnival-vrt-baselines/${sourceBranch}`) {
      throw new Error(`Baseline target does not match its source: ${baselineTarget}`);
    }
  }

  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error(`Invalid updatedAt: ${updatedAt}`);
  const runId = assertPositiveInteger(input.runId, "run ID");
  const runAttempt = assertPositiveInteger(input.runAttempt, "run attempt");
  const markerName = `deploy-marker-${runId}-${runAttempt}.txt`;

  return {
    repository: path.resolve(input.repository),
    branch: input.branch ?? REPORT_BRANCH,
    source: assertSourceTree(input.source, reportType === "vrt" ? ["index.html", "out.json"] : ["index.html"]),
    target,
    reportType,
    pullRequest,
    sourceBranch,
    sourceSha,
    runId,
    runAttempt,
    updatedAt,
    markerName,
    baselineSource: baselineSource === null ? null : assertSourceTree(baselineSource, []),
    baselineTarget,
  };
}

function metadataFor(request) {
  return {
    schemaVersion: 1,
    sourceRepository: SOURCE_REPOSITORY,
    reportType: request.reportType,
    pullRequest: request.pullRequest,
    sourceBranch: request.sourceBranch,
    sourceSha: request.sourceSha,
    runId: request.runId,
    runAttempt: request.runAttempt,
    updatedAt: request.updatedAt,
  };
}

function readMetadata(repository, revision, target) {
  const metadataPath = `${target}/.report-meta.json`;
  const listed = spawnSync("git", ["-C", repository, "ls-tree", revision, "--", metadataPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (listed.status !== 0) throw new Error(`Could not inspect existing report metadata: ${listed.stderr.trim()}`);
  if (!listed.stdout.trim()) return null;
  const result = spawnSync("git", ["-C", repository, "show", `${revision}:${target}/.report-meta.json`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`Could not read existing report metadata: ${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Existing report metadata is invalid: ${error.message}`);
  }
}

export function comparePublishedRun(existing, incoming) {
  if (!existing) return "newer";
  if (
    existing.schemaVersion !== 1 ||
    !Number.isSafeInteger(existing.runId) ||
    !Number.isSafeInteger(existing.runAttempt) ||
    typeof existing.sourceSha !== "string"
  ) {
    throw new Error("Existing report metadata does not match schema version 1");
  }
  if (existing.runId > incoming.runId) return "stale";
  if (existing.runId === incoming.runId && existing.runAttempt > incoming.runAttempt) return "stale";
  if (existing.runId === incoming.runId && existing.runAttempt === incoming.runAttempt) {
    if (existing.sourceSha !== incoming.sourceSha) throw new Error("Run identity collision has different source SHAs");
    return "same";
  }
  return "newer";
}

function replaceIndexPath(repository, relative) {
  git(repository, ["rm", "-q", "-r", "-f", "--cached", "--ignore-unmatch", "--sparse", "--", relative]);
  rmSync(resolveInside(repository, relative), { recursive: true, force: true });
}

function stageIndexPath(repository, relative) {
  git(repository, ["add", "--sparse", "--", relative]);
}

function createSnapshotCommit(repository, request, observed) {
  const incoming = metadataFor(request);
  const comparison = comparePublishedRun(readMetadata(repository, observed, request.target), incoming);
  if (comparison === "stale") return { status: "stale", commit: observed, markerName: request.markerName };
  if (comparison === "same") return { status: "noop", commit: observed, markerName: request.markerName };

  replaceIndexPath(repository, request.target);
  const reportTarget = resolveInside(repository, request.target);
  copyDirectoryContents(request.source, reportTarget);
  writeFileSync(path.join(reportTarget, ".report-meta.json"), `${JSON.stringify(incoming, null, 2)}\n`);
  writeFileSync(path.join(reportTarget, request.markerName), `${request.runId}-${request.runAttempt}\n`);
  stageIndexPath(repository, request.target);

  if (request.baselineTarget !== null) {
    replaceIndexPath(repository, request.baselineTarget);
    copyDirectoryContents(request.baselineSource, resolveInside(repository, request.baselineTarget));
    stageIndexPath(repository, request.baselineTarget);
  }

  replaceIndexPath(repository, ".snapshot-meta.json");
  writeFileSync(
    path.join(request.repository, ".snapshot-meta.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceRepository: SOURCE_REPOSITORY,
        sourceSha: request.sourceSha,
        runId: request.runId,
        runAttempt: request.runAttempt,
        updatedAt: request.updatedAt,
      },
      null,
      2,
    )}\n`,
  );
  stageIndexPath(repository, ".snapshot-meta.json");

  const tree = git(repository, ["write-tree"]);
  const commit = git(repository, ["commit-tree", tree], {
    input: `Publish ${request.target} from run ${request.runId} attempt ${request.runAttempt}\n`,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "github-actions[bot]",
      GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
      GIT_COMMITTER_NAME: "github-actions[bot]",
      GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
    },
  });
  return { status: "prepared", commit, markerName: request.markerName };
}

export async function publishReportSnapshot(input, options = {}) {
  const request = normalizePublishRequest(input);
  if (request.branch !== REPORT_BRANCH) throw new Error(`Publishing branch must be ${REPORT_BRANCH}`);
  const maxAttempts = options.maxAttempts ?? 5;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    git(request.repository, [
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      `+refs/heads/${request.branch}:refs/remotes/origin/${request.branch}`,
    ]);
    const remoteRef = `refs/remotes/origin/${request.branch}`;
    const observed = git(request.repository, ["rev-parse", remoteRef]);
    git(request.repository, ["reset", "--hard", remoteRef]);

    if (options.verifyBeforePush && !(await options.verifyBeforePush())) {
      return { status: "stale", commit: observed, markerName: request.markerName, reason: "source-head-changed" };
    }
    const prepared = createSnapshotCommit(request.repository, request, observed);
    if (prepared.status !== "prepared") return prepared;
    if (options.beforePush) await options.beforePush({ attempt, observed, commit: prepared.commit });

    const push = spawnSync(
      "git",
      [
        "-C",
        request.repository,
        "push",
        "--quiet",
        `--force-with-lease=refs/heads/${request.branch}:${observed}`,
        "origin",
        `${prepared.commit}:refs/heads/${request.branch}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (push.error) throw push.error;
    if (push.status === 0) return { ...prepared, status: "published" };
    if (attempt === maxAttempts) {
      throw new Error(`Could not publish report snapshot after ${maxAttempts} attempts: ${push.stderr.trim()}`);
    }
    await sleep(attempt * 2_000);
  }
  throw new Error("Report publisher exhausted its retry loop");
}

export async function verifyCurrentSource({ token, sourceSha, pullRequest, sourceBranch, fetchImpl = fetch }) {
  if (!token) throw new Error("GITHUB_TOKEN is required to verify the source head");
  const endpoint =
    pullRequest === null
      ? `https://api.github.com/repos/${SOURCE_REPOSITORY}/git/ref/heads/${encodeURIComponent(sourceBranch)}`
      : `https://api.github.com/repos/${SOURCE_REPOSITORY}/pulls/${pullRequest}`;
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Source head lookup failed: HTTP ${response.status}`);
  const value = await response.json();
  const currentSha = pullRequest === null ? value.object?.sha : value.head?.sha;
  const current =
    currentSha === sourceSha &&
    (pullRequest === null || (value.state === "open" && value.head?.repo?.full_name === SOURCE_REPOSITORY));
  return { current, currentSha: currentSha ?? null };
}

export async function dispatchPagesDeployment({ token, reportCommit, target, markerName, fetchImpl = fetch }) {
  if (!token) throw new Error("HOSTING_PAGES_TOKEN is required to dispatch Pages");
  const response = await fetchImpl(`https://api.github.com/repos/${HOSTING_REPOSITORY}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "yps-report-published",
      client_payload: { reportCommit, target, markerName },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 204) throw new Error(`Pages dispatch failed: HTTP ${response.status}`);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument: ${key ?? ""}`);
    values[key.slice(2)] = value;
    index += 1;
  }
  for (const key of ["repository", "source", "target", "report-type", "source-sha", "run-id", "run-attempt"]) {
    if (!values[key]) throw new Error(`Missing --${key}`);
  }
  return values;
}

function appendActionsOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const request = normalizePublishRequest({
    repository: args.repository,
    source: args.source,
    target: args.target,
    reportType: args["report-type"],
    pullRequest: args["pull-request"],
    sourceBranch: args["source-branch"],
    sourceSha: args["source-sha"],
    runId: args["run-id"],
    runAttempt: args["run-attempt"],
    baselineSource: args["baseline-source"],
    baselineTarget: args["baseline-target"],
  });
  const verify = async () =>
    (
      await verifyCurrentSource({
        token: process.env.GITHUB_TOKEN,
        sourceSha: request.sourceSha,
        pullRequest: request.pullRequest,
        sourceBranch: request.sourceBranch,
      })
    ).current;
  if (!(await verify())) {
    const result = { status: "stale", commit: "", markerName: request.markerName, reason: "source-head-changed" };
    appendActionsOutputs({ status: result.status, report_commit: result.commit, marker_name: result.markerName });
    console.log(JSON.stringify(result));
    return;
  }

  const result = await publishReportSnapshot(request, { verifyBeforePush: verify });
  if (result.status !== "stale") {
    await dispatchPagesDeployment({
      token: process.env.HOSTING_PAGES_TOKEN,
      reportCommit: result.commit,
      target: request.target,
      markerName: result.markerName,
    });
  }
  appendActionsOutputs({ status: result.status, report_commit: result.commit, marker_name: result.markerName });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
