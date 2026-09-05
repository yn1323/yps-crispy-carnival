import { randomUUID } from "node:crypto";
import { appendFile, cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBaselineArchive } from "./hostedReportBaseline.mjs";
import {
  createR2ReportStore,
  positiveInteger,
  publicReportUrl,
  R2ConfigurationError,
  readReportManifest,
  SOURCE_REPOSITORY,
} from "./hostedReportStore.mjs";
import { discoverReportTargets, maintainR2Reports } from "./maintainR2Reports.mjs";
import { assertReportPrivacy, prepareHostedReport } from "./prepareHostedReport.mjs";
import { normalizePublishRequest, publishHostedReport } from "./publishHostingReport.mjs";

const WORKFLOWS = { vrt: ".github/workflows/vrt.yml", playwright: ".github/workflows/playwright.yml" };
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function githubClient(token = process.env.GITHUB_TOKEN, fetchImpl = fetch) {
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return async (resource, options = {}) => {
    if (!resource.startsWith(`/repos/${SOURCE_REPOSITORY}/`))
      throw new Error("GitHub request escaped the source repository");
    const response = await fetchImpl(`https://api.github.com${resource}`, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub source verification failed (HTTP ${response.status})`);
    return response.status === 204 ? null : response.json();
  };
}

export function requestFromEvent(event, env, reportType) {
  if (env.GITHUB_REPOSITORY !== SOURCE_REPOSITORY || event.repository?.full_name !== SOURCE_REPOSITORY)
    throw new Error("Unexpected source repository");
  const identity = {
    reportType,
    source: ".",
    runId: positiveInteger(env.GITHUB_RUN_ID, "run ID"),
    runAttempt: positiveInteger(env.GITHUB_RUN_ATTEMPT, "run attempt"),
  };
  if (env.GITHUB_EVENT_NAME === "pull_request") {
    const pr = event.pull_request;
    if (
      pr?.head?.repo?.full_name !== SOURCE_REPOSITORY ||
      pr.base?.repo?.full_name !== SOURCE_REPOSITORY ||
      !["develop", "main"].includes(pr.base.ref)
    )
      throw new Error("Only same-repository PR reports are supported");
    return {
      ...identity,
      pullRequest: positiveInteger(event.number, "PR number"),
      sourceBranch: null,
      sourceSha: pr.head.sha,
    };
  }
  if (
    env.GITHUB_EVENT_NAME === "push" &&
    reportType === "vrt" &&
    /^refs\/heads\/(develop|main)$/.test(env.GITHUB_REF)
  ) {
    return {
      ...identity,
      pullRequest: null,
      sourceBranch: env.GITHUB_REF.slice("refs/heads/".length),
      sourceSha: env.GITHUB_SHA,
    };
  }
  throw new Error("Unsupported report source event");
}

export async function verifyGitHubSource(request, api, { bootstrap = false } = {}) {
  const run = await api(`/repos/${SOURCE_REPOSITORY}/actions/runs/${request.runId}`);
  if (
    run.repository?.full_name !== SOURCE_REPOSITORY ||
    run.head_repository?.full_name !== SOURCE_REPOSITORY ||
    run.head_sha !== request.sourceSha ||
    run.run_attempt !== request.runAttempt ||
    run.path?.split("@")[0] !== WORKFLOWS[request.reportType]
  )
    throw new Error("Report does not belong to its verified workflow run");
  if (!bootstrap && run.conclusion === "cancelled") return { status: "stale" };
  if (request.pullRequest !== null) {
    if (bootstrap || run.event !== "pull_request") throw new Error("Invalid PR report source event");
    const pr = await api(`/repos/${SOURCE_REPOSITORY}/pulls/${request.pullRequest}`);
    if (
      pr.head?.repo?.full_name !== SOURCE_REPOSITORY ||
      pr.base?.repo?.full_name !== SOURCE_REPOSITORY ||
      !["develop", "main"].includes(pr.base.ref) ||
      run.head_branch !== pr.head.ref
    )
      throw new Error("PR report source does not match the repository and branch");
    if (run.pull_requests?.length && !run.pull_requests.some((item) => item.number === request.pullRequest))
      throw new Error("Run belongs to another PR");
    if (pr.state === "closed") return { status: "closed" };
    return { status: pr.head.sha === request.sourceSha ? "current" : "stale" };
  }
  if (
    request.reportType !== "vrt" ||
    !["develop", "main"].includes(request.sourceBranch) ||
    run.event !== "push" ||
    run.head_branch !== request.sourceBranch
  )
    throw new Error("Only verified branch pushes can update baselines");
  const branch = await api(`/repos/${SOURCE_REPOSITORY}/branches/${request.sourceBranch}`);
  if (bootstrap) {
    const comparison = await api(`/repos/${SOURCE_REPOSITORY}/compare/${request.sourceSha}...${branch.commit.sha}`);
    if (!["ahead", "identical"].includes(comparison.status))
      throw new Error("Legacy baseline is not an ancestor of the current branch");
    const jobs = [];
    for (let page = 1; ; page += 1) {
      const result = await api(
        `/repos/${SOURCE_REPOSITORY}/actions/runs/${request.runId}/attempts/${request.runAttempt}/jobs?per_page=100&page=${page}`,
      );
      jobs.push(...result.jobs);
      if (result.jobs.length < 100) break;
    }
    const captures = jobs.filter((job) => /^capture(?:\s|$)/i.test(job.name));
    if (captures.length !== 4 || captures.some((job) => job.conclusion !== "success"))
      throw new Error("Legacy baseline requires all four successful capture shards");
    return { status: "current" };
  }
  return { status: branch.commit.sha === request.sourceSha ? "current" : "stale" };
}

export async function checkPublicObject(url, { expected, missing = false, fetchImpl = fetch, sleep = pause } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(20_000), cache: "no-store" });
    } catch {
      if (attempt === 3) throw new Error("Public report request timed out or failed");
    }
    if (response) {
      if (missing && response.status === 404) return;
      if (!missing && response.ok) {
        if (expected !== undefined && (await response.text()) !== expected)
          throw new R2ConfigurationError("REPORT_PUBLIC_BASE_URL points to a different bucket or stale content");
        if (expected === undefined) await response.body?.cancel();
        return;
      }
      await response.body?.cancel();
      if ([401, 403, 404].includes(response.status) && !missing)
        throw new R2ConfigurationError("REPORT_PUBLIC_BASE_URL cannot publicly read an uploaded object");
      if (attempt === 3) throw new Error(`Public report verification failed (HTTP ${response.status})`);
      if (!(response.status === 429 || response.status >= 500 || missing))
        throw new Error(`Public report request failed (HTTP ${response.status})`);
    }
    await sleep(1_000 * (attempt + 1));
  }
}

export async function preflight(store, options = {}) {
  const key = `_checks/r2-${randomUUID()}.txt`;
  const value = `R2 report connection check ${randomUUID()}\n`;
  const url = publicReportUrl(store.publicBaseUrl, key);
  try {
    await store.put(key, Buffer.from(value), { contentType: "text/plain; charset=utf-8", ifNoneMatch: "*" });
    const object = await store.get(key);
    if (
      Buffer.from(object?.body ?? []).toString() !== value ||
      !(await store.list(key)).some((item) => item.key === key)
    )
      throw new R2ConfigurationError("The R2 key cannot read or list its uploaded object");
    await store.put(key, Buffer.from(value), { contentType: "text/plain; charset=utf-8", ifMatch: object.etag });
    await checkPublicObject(url, { ...options, expected: value });
    const anonymous = await (options.fetchImpl ?? fetch)(url, {
      method: "PUT",
      body: "anonymous write probe",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    await anonymous.body?.cancel();
    if (![401, 403, 405].includes(anonymous.status))
      throw new R2ConfigurationError("The public report URL did not reject anonymous writes");
  } finally {
    await store.delete([key]);
  }
  if (await store.head(key)) throw new R2ConfigurationError("The R2 key cannot delete its uploaded object");
  await checkPublicObject(url, { ...options, missing: true });
  return { status: "verified" };
}

async function readSmallJson(filename) {
  const stats = await lstat(filename);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 5 * 1024 * 1024)
    throw new Error("Invalid report metadata file");
  return JSON.parse(await readFile(filename, "utf8"));
}

export function resultSummary(reportType, result, testResult) {
  if (reportType === "vrt") {
    const fields = ["failedItems", "newItems", "deletedItems", "passedItems"];
    if (fields.some((field) => !Array.isArray(result[field]))) throw new Error("Invalid VRT result counts");
    const [changed, added, deleted, passed] = fields.map((field) => result[field].length);
    return `変更 ${changed} / 追加 ${added} / 削除 ${deleted} / 変更なし ${passed}。${changed + added + deleted > 0 ? "差分を確認し、必要な場合はVRT承認を行ってください。" : "視覚的な差分はありません。"}`;
  }
  const fields = ["expected", "unexpected", "flaky", "skipped"];
  if (
    fields.some((field) => !Number.isSafeInteger(result.stats?.[field]) || result.stats[field] < 0) ||
    !["success", "failure"].includes(testResult)
  )
    throw new Error("Invalid Playwright result counts");
  const [passed, failed, flaky, skipped] = fields.map((field) => result.stats[field]);
  return `${testResult === "success" ? "テスト成功" : "テスト失敗"}：成功 ${passed} / 失敗 ${failed} / 不安定 ${flaky} / スキップ ${skipped}。`;
}

async function prepareRequest(request, source, output, baselineSource, summary) {
  await mkdir(output, { recursive: false });
  await prepareHostedReport({ reportType: request.reportType, source, destination: path.join(output, "report") });
  if (baselineSource) {
    const archivePath = path.join(output, "baseline.zip");
    request.baselineArchive = {
      path: "baseline.zip",
      ...(await createBaselineArchive({ source: baselineSource, archivePath })),
    };
  }
  request.source = "report";
  normalizePublishRequest(request);
  const metadata = path.join(output, "metadata");
  await mkdir(metadata);
  await writeFile(path.join(metadata, "request.json"), `${JSON.stringify(request)}\n`);
  if (summary) await writeFile(path.join(metadata, "summary.json"), `${JSON.stringify({ summary })}\n`);
  await assertReportPrivacy(metadata);
}

async function loadPrepared(output) {
  const request = await readSmallJson(path.join(output, "metadata/request.json"));
  if (request.source !== "report" || (request.baselineArchive && request.baselineArchive.path !== "baseline.zip"))
    throw new Error("Invalid prepared report paths");
  return normalizePublishRequest({
    ...request,
    source: path.join(output, "report"),
    baselineArchive: request.baselineArchive
      ? { ...request.baselineArchive, path: path.join(output, "baseline.zip") }
      : undefined,
  });
}

export async function commentOnReport(request, reportUrl, api, { summary } = {}) {
  if (request.pullRequest === null) return;
  const marker = `<!-- r2-report:${request.reportType} -->`;
  const title = request.reportType === "vrt" ? "VRT Report" : "Playwright Report";
  const body = `${marker}\n### ${title}\n\n[公開レポートを開く](${reportUrl})\n\n${summary ? `${summary}\n\n` : ""}完全版は[GitHub ActionsのArtifacts](https://github.com/${SOURCE_REPOSITORY}/actions/runs/${request.runId})からダウンロードできます。公開レポートはPR終了時に削除されます。\n\nCommit: \`${request.sourceSha}\` / Attempt: ${request.runAttempt}`;
  let existing;
  for (let page = 1; ; page += 1) {
    const comments = await api(
      `/repos/${SOURCE_REPOSITORY}/issues/${request.pullRequest}/comments?per_page=100&page=${page}`,
    );
    existing ??= comments.find(
      (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.startsWith(marker),
    );
    if (comments.length < 100) break;
  }
  await api(
    existing
      ? `/repos/${SOURCE_REPOSITORY}/issues/comments/${existing.id}`
      : `/repos/${SOURCE_REPOSITORY}/issues/${request.pullRequest}/comments`,
    { method: existing ? "PATCH" : "POST", body: JSON.stringify({ body }) },
  );
}

async function publishPrepared(output, api, { bootstrap = false } = {}) {
  const request = await loadPrepared(output);
  const summary = bootstrap ? undefined : (await readSmallJson(path.join(output, "metadata/summary.json"))).summary;
  if (!bootstrap && (typeof summary !== "string" || summary.length > 500 || /[\r\n<>]/.test(summary)))
    throw new Error("Invalid public report summary");
  const store = createR2ReportStore();
  if (bootstrap && (await readReportManifest(store, request))) return { status: "noop" };
  const result = await publishHostedReport(request, {
    store,
    verifySource: (source) => verifyGitHubSource(source, api, { bootstrap }),
    afterCommit: async (_manifest, url) => {
      await checkPublicObject(url);
      if (!bootstrap && (await verifyGitHubSource(request, api)).status === "current")
        await commentOnReport(request, url, api, { summary });
    },
  });
  return {
    status: result.status,
    report_url: result.reportUrl,
    uploadedFiles: result.uploadedFiles,
    uploadedBytes: result.uploadedBytes,
    deletedFiles: result.deletedFiles,
    warnings: result.warnings,
  };
}

function argumentsFor(args) {
  const command = args[0];
  const flags = {};
  for (let index = 1; index < args.length; index += 2) {
    if (!/^--[a-z-]+$/.test(args[index]) || !args[index + 1] || flags[args[index].slice(2)])
      throw new Error("Invalid report command arguments");
    flags[args[index].slice(2)] = args[index + 1];
  }
  return { command, flags };
}

export async function main(args = process.argv.slice(2)) {
  const { command, flags } = argumentsFor(args);
  if (command === "preflight") return preflight(createR2ReportStore());
  const api = githubClient();
  if (command === "prepare") {
    const event = await readSmallJson(process.env.GITHUB_EVENT_PATH);
    const request = requestFromEvent(event, process.env, flags.type);
    if ((await verifyGitHubSource(request, api)).status !== "current") return { status: "stale" };
    // Copy aggregate counts only; test names and error content stay in the report.
    const summary = resultSummary(
      flags.type,
      await readSmallJson(flags.type === "vrt" ? path.join(flags.source, "out.json") : flags.summary),
      process.env.TEST_RESULT,
    );
    await prepareRequest(
      request,
      path.resolve(flags.source),
      path.resolve(flags.output),
      flags["baseline-source"] && path.resolve(flags["baseline-source"]),
      summary,
    );
    return { status: "prepared" };
  }
  if (command === "publish") return publishPrepared(path.resolve(flags.prepared), api);
  if (command === "cleanup") {
    const store = createR2ReportStore();
    const targets = flags.pr
      ? ["vrt", "playwright"].map((reportType) => ({
          reportType,
          pullRequest: positiveInteger(flags.pr, "PR number"),
          sourceBranch: null,
        }))
      : await discoverReportTargets(store);
    const results = [];
    for (const target of targets) {
      results.push(
        await maintainR2Reports(target, {
          store,
          verifySource: async ({ pullRequest }) => {
            const pr = await api(`/repos/${SOURCE_REPOSITORY}/pulls/${pullRequest}`);
            if (!["open", "closed"].includes(pr.state) || pr.base?.repo?.full_name !== SOURCE_REPOSITORY)
              throw new Error("Invalid PR cleanup source");
            return { status: pr.state };
          },
        }),
      );
    }
    return {
      status: "cleaned",
      targets: results.length,
      deletedFiles: results.reduce((total, item) => total + item.deletedFiles, 0),
    };
  }
  if (command === "prepare-bootstrap") {
    if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch")
      throw new Error("Bootstrap requires explicit workflow dispatch");
    const root = path.resolve(flags["legacy-root"]);
    const output = path.resolve(flags.output);
    await mkdir(output);
    for (const sourceBranch of ["develop", "main"]) {
      const source = path.join(root, `yps-crispy-carnival-vrt/branches/${sourceBranch}`);
      const metadata = await readSmallJson(path.join(source, ".report-meta.json"));
      if (
        metadata.sourceRepository !== SOURCE_REPOSITORY ||
        metadata.sourceBranch !== sourceBranch ||
        metadata.reportType !== "vrt" ||
        metadata.pullRequest !== null
      )
        throw new Error("Invalid legacy baseline provenance");
      const request = {
        source: ".",
        reportType: "vrt",
        pullRequest: null,
        sourceBranch,
        sourceSha: metadata.sourceSha,
        runId: positiveInteger(metadata.runId, "legacy run ID"),
        runAttempt: positiveInteger(metadata.runAttempt, "legacy run attempt"),
        updatedAt: metadata.updatedAt,
      };
      await verifyGitHubSource(request, api, { bootstrap: true });
      const reportInput = path.join(output, `legacy-${sourceBranch}`);
      await cp(source, reportInput, {
        recursive: true,
        filter: (filename) => ![".report-meta.json", ".snapshot-meta.json"].includes(path.basename(filename)),
      });
      await prepareRequest(
        request,
        reportInput,
        path.join(output, sourceBranch),
        path.join(root, `yps-crispy-carnival-vrt-baselines/${sourceBranch}`),
      );
    }
    return { status: "prepared" };
  }
  if (command === "publish-bootstrap") {
    if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch")
      throw new Error("Bootstrap requires explicit workflow dispatch");
    const results = [];
    for (const branch of ["develop", "main"])
      results.push(await publishPrepared(path.join(path.resolve(flags.prepared), branch), api, { bootstrap: true }));
    return { status: "bootstrapped", results };
  }
  throw new Error("Unknown report command");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await main();
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT) {
      for (const key of ["status", "report_url"])
        if (result[key]) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${result[key]}\n`);
    }
  } catch (error) {
    // S3 credentials and third-party response bodies must never reach CI logs.
    console.error(error instanceof R2ConfigurationError ? error.message : `Report operation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
