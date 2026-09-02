import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  normalizePublishRequest,
  type PublishRequest,
  publishReportSnapshot,
  verifyCurrentSource,
} from "./publishHostingReport.mjs";

const temporaryDirectories: string[] = [];
const sha = (character: string) => character.repeat(40);

function git(repository: string, args: string[]) {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function createTemporaryDirectory(prefix: string) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createRemote() {
  const root = createTemporaryDirectory("publish-report-");
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  execFileSync("git", ["init", "--bare", remote]);
  execFileSync("git", ["init", seed]);
  git(seed, ["config", "user.name", "test"]);
  git(seed, ["config", "user.email", "test@example.com"]);
  mkdirSync(path.join(seed, "yps-crispy-carnival-vrt-baselines", "develop"), { recursive: true });
  writeFileSync(path.join(seed, "yps-crispy-carnival-vrt-baselines", "develop", "baseline.png"), "baseline");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "initial snapshot"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "origin", "HEAD:refs/heads/yps-reports"]);
  git(remote, ["config", "uploadpack.allowFilter", "true"]);
  return { root, remote };
}

function cloneWriter(root: string, remote: string, name: string) {
  const repository = path.join(root, name);
  execFileSync("git", [
    "clone",
    "--filter=blob:none",
    "--sparse",
    "--branch",
    "yps-reports",
    pathToFileURL(remote).href,
    repository,
  ]);
  return repository;
}

function createReport(root: string, name: string, type: "playwright" | "vrt") {
  const source = path.join(root, name);
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "index.html"), `<html>${name}</html>`);
  if (type === "vrt") writeFileSync(path.join(source, "out.json"), '{"failedItems":[]}');
  return source;
}

function playwrightRequest(repository: string, source: string, pullRequest: number, runId: number): PublishRequest {
  return {
    repository,
    source,
    target: `yps-crispy-carnival/${pullRequest}`,
    reportType: "playwright",
    pullRequest,
    sourceSha: sha("a"),
    runId,
    runAttempt: 1,
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("publishReportSnapshot", () => {
  it("親なしsnapshotを公開し、同じrunはno-op、古いrunは拒否する", async () => {
    const { root, remote } = createRemote();
    const writer = cloneWriter(root, remote, "writer");
    const source = createReport(root, "playwright", "playwright");

    const published = await publishReportSnapshot(playwrightRequest(writer, source, 101, 200), {
      sleep: async () => {},
    });
    expect(published.status).toBe("published");
    expect(git(remote, ["rev-list", "--parents", "-n", "1", "yps-reports"]).split(" ")).toHaveLength(1);
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival/101/index.html"])).toContain("playwright");
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival-vrt-baselines/develop/baseline.png"])).toBe(
      "baseline",
    );
    const metadata = JSON.parse(git(remote, ["show", "yps-reports:yps-crispy-carnival/101/.report-meta.json"]));
    expect(metadata).toMatchObject({ runId: 200, runAttempt: 1, pullRequest: 101, sourceSha: sha("a") });

    const same = await publishReportSnapshot(playwrightRequest(writer, source, 101, 200), { sleep: async () => {} });
    expect(same.status).toBe("noop");
    const beforeStale = git(remote, ["rev-parse", "yps-reports"]);
    const stale = await publishReportSnapshot(playwrightRequest(writer, source, 101, 199), { sleep: async () => {} });
    expect(stale.status).toBe("stale");
    expect(git(remote, ["rev-parse", "yps-reports"])).toBe(beforeStale);
  });

  it("同時writerのlease競合を再取得し、両方のreportを保持する", async () => {
    const { root, remote } = createRemote();
    const writerA = cloneWriter(root, remote, "writer-a");
    const writerB = cloneWriter(root, remote, "writer-b");
    const playwright = createReport(root, "playwright-a", "playwright");
    const vrt = createReport(root, "vrt-b", "vrt");
    let raced = false;

    const result = await publishReportSnapshot(playwrightRequest(writerA, playwright, 201, 300), {
      sleep: async () => {},
      beforePush: async ({ attempt }) => {
        if (attempt !== 1 || raced) return;
        raced = true;
        const competitor = await publishReportSnapshot(
          {
            repository: writerB,
            source: vrt,
            target: "yps-crispy-carnival-vrt/pr-202",
            reportType: "vrt",
            pullRequest: 202,
            sourceSha: sha("b"),
            runId: 301,
            runAttempt: 1,
            updatedAt: "2026-08-23T00:00:01.000Z",
          },
          { sleep: async () => {} },
        );
        expect(competitor.status).toBe("published");
      },
    });

    expect(result.status).toBe("published");
    expect(raced).toBe(true);
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival/201/index.html"])).toContain("playwright-a");
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival-vrt/pr-202/index.html"])).toContain("vrt-b");
    expect(git(remote, ["rev-list", "--parents", "-n", "1", "yps-reports"]).split(" ")).toHaveLength(1);
  });

  it("branch VRT reportとbaselineを同じsnapshotで置き換える", async () => {
    const { root, remote } = createRemote();
    const writer = cloneWriter(root, remote, "writer");
    const vrt = createReport(root, "vrt-develop", "vrt");
    const baseline = path.join(root, "baseline");
    mkdirSync(baseline);
    writeFileSync(path.join(baseline, "current.png"), "current");

    const result = await publishReportSnapshot(
      {
        repository: writer,
        source: vrt,
        target: "yps-crispy-carnival-vrt/branches/develop",
        reportType: "vrt",
        sourceBranch: "develop",
        sourceSha: sha("c"),
        runId: 400,
        runAttempt: 1,
        updatedAt: "2026-08-23T00:00:02.000Z",
        baselineSource: baseline,
        baselineTarget: "yps-crispy-carnival-vrt-baselines/develop",
      },
      { sleep: async () => {} },
    );

    expect(result.status).toBe("published");
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival-vrt/branches/develop/out.json"])).toBe(
      '{"failedItems":[]}',
    );
    expect(git(remote, ["show", "yps-reports:yps-crispy-carnival-vrt-baselines/develop/current.png"])).toBe("current");
    expect(git(remote, ["ls-tree", "-r", "--name-only", "yps-reports"])).not.toContain(
      "yps-crispy-carnival-vrt-baselines/develop/baseline.png",
    );
  });
});

describe("source and path validation", () => {
  it("PRの現在headだけをcurrentとして扱う", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ state: "open", head: { sha: sha("c"), repo: { full_name: "yn1323/yps-crispy-carnival" } } }),
        { status: 200 },
      );
    await expect(
      verifyCurrentSource({ token: "token", sourceSha: sha("c"), pullRequest: 10, sourceBranch: null, fetchImpl }),
    ).resolves.toMatchObject({ current: true });
    await expect(
      verifyCurrentSource({ token: "token", sourceSha: sha("d"), pullRequest: 10, sourceBranch: null, fetchImpl }),
    ).resolves.toMatchObject({ current: false, currentSha: sha("c") });
  });

  it("branchの現在headだけをcurrentとして扱う", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ object: { sha: sha("e") } }), { status: 200 });
    await expect(
      verifyCurrentSource({
        token: "token",
        sourceSha: sha("e"),
        pullRequest: null,
        sourceBranch: "develop",
        fetchImpl,
      }),
    ).resolves.toMatchObject({ current: true, currentSha: sha("e") });
  });

  it("report targetの取り違えとsymlinkを拒否する", () => {
    const root = createTemporaryDirectory("publish-validation-");
    const source = createReport(root, "report", "playwright");
    expect(() =>
      normalizePublishRequest({ ...playwrightRequest(root, source, 10, 1), target: "yps-crispy-carnival/11" }),
    ).toThrow("Report target does not match its source");

    const linkedSource = createReport(root, "linked", "playwright");
    symlinkSync(path.join(linkedSource, "index.html"), path.join(linkedSource, "linked.html"));
    expect(() =>
      normalizePublishRequest({
        ...playwrightRequest(root, linkedSource, 10, 1),
        target: "yps-crispy-carnival/10",
      }),
    ).toThrow("Report source contains a symlink");
  });
});
