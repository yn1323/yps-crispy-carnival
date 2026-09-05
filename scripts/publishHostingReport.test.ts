import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryReportStore } from "./hostedReportStore.fixture";
import { ReportStoreConflictError, readReportManifest, reportTargetPaths } from "./hostedReportStore.mjs";
import { maintainR2Reports } from "./maintainR2Reports.mjs";
import { normalizePublishRequest, type PublishRequest, publishHostedReport } from "./publishHostingReport.mjs";

const directories: string[] = [];
const current = async () => ({ status: "current" as const });
const open = async () => ({ status: "open" as const });

async function report(overrides: Partial<PublishRequest> = {}): Promise<PublishRequest> {
  const source = await mkdtemp(path.join(tmpdir(), "r2-publish-"));
  directories.push(source);
  await writeFile(path.join(source, "index.html"), "<html>report</html>");
  await writeFile(path.join(source, "out.json"), "{}");
  return {
    source,
    reportType: "vrt",
    pullRequest: 9,
    sourceSha: "a".repeat(40),
    runId: 100,
    runAttempt: 1,
    ...overrides,
  };
}

async function branchReport(overrides: Partial<PublishRequest> = {}) {
  const request = await report({ pullRequest: null, sourceBranch: "develop", ...overrides });
  const archivePath = path.join(request.source, "..", `${path.basename(request.source)}.zip`);
  directories.push(archivePath);
  const archive = Buffer.from("checked baseline archive");
  await writeFile(archivePath, archive);
  request.baselineArchive = {
    path: archivePath,
    checksum: createHash("sha256").update(archive).digest("hex"),
    imageCount: 2,
    bytes: archive.length,
  };
  return request;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("R2レポートの公開確定", () => {
  it("全ファイルを確認してから世代を確定し、同じrunの再実行は重複公開しない", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    const first = await publishHostedReport(request, { store: fixture.store, verifySource: current });
    const second = await publishHostedReport(request, { store: fixture.store, verifySource: current });
    expect([first.status, first.uploadedFiles, first.uploadedBytes, first.deletedFiles, first.warnings]).toEqual([
      "published",
      2,
      21,
      0,
      [],
    ]);
    expect(first.reportUrl).toBe("https://pub-test.r2.dev/vrt/pr-9/100-1/index.html");
    expect(second.status).toBe("noop");
    expect([...fixture.objects.keys()].sort()).toEqual([
      "state/vrt/pr-9.json",
      "vrt/pr-9/100-1/index.html",
      "vrt/pr-9/100-1/out.json",
    ]);
    expect((await readReportManifest(fixture.store, request))?.manifest).toEqual(first.manifest);
  });

  it("古いrunと偽の同一run SHAで最新レポートを置き換えない", async () => {
    const { store, objects } = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store, verifySource: current });
    const before = [...objects.entries()];
    expect((await publishHostedReport({ ...request, runId: 99 }, { store, verifySource: current })).status).toBe(
      "stale",
    );
    await expect(
      publishHostedReport({ ...request, sourceSha: "b".repeat(40), runAttempt: 2 }, { store, verifySource: current }),
    ).rejects.toThrow("identity collision");
    expect([...objects.entries()]).toEqual(before);
  });

  it("途中の転送失敗では旧確定世代を残し、今回だけを回収する", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store: fixture.store, verifySource: current });
    const before = [...fixture.objects.entries()];
    fixture.state.beforePut = async (key) => {
      if (key === "vrt/pr-9/101-1/out.json") throw new Error("transfer failed");
    };
    await expect(
      publishHostedReport({ ...request, runId: 101 }, { store: fixture.store, verifySource: current }),
    ).rejects.toThrow("transfer failed");
    expect([...fixture.objects.entries()]).toEqual(before);
  });

  it("確定直前にPR headが変わった場合は今回の公開を破棄する", async () => {
    const { store, objects } = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store, verifySource: current });
    const before = [...objects.entries()];
    let checks = 0;
    const result = await publishHostedReport(
      { ...request, runId: 101 },
      { store, verifySource: async () => ({ status: ++checks === 1 ? "current" : "stale" }) },
    );
    expect(result.status).toBe("stale");
    expect([...objects.entries()]).toEqual(before);
  });

  it("別世代が先に確定した場合に条件付きwriteで競合を検出し、勝者を残す", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store: fixture.store, verifySource: current });
    fixture.state.beforePut = async (key) => {
      if (key === "state/vrt/pr-9.json") {
        fixture.state.beforePut = null;
        await publishHostedReport({ ...request, runId: 102 }, { store: fixture.store, verifySource: current });
      }
    };
    await expect(
      publishHostedReport({ ...request, runId: 101 }, { store: fixture.store, verifySource: current }),
    ).rejects.toBeInstanceOf(ReportStoreConflictError);
    expect([...fixture.objects.keys()].sort()).toEqual([
      "state/vrt/pr-9.json",
      "vrt/pr-9/102-1/index.html",
      "vrt/pr-9/102-1/out.json",
    ]);
    expect((await readReportManifest(fixture.store, request))?.manifest.runId).toBe(102);
  });

  it("同じ世代の競合で先行公開が成功した場合は確定済みファイルを消さない", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    fixture.state.beforePut = async (key) => {
      if (key === "state/vrt/pr-9.json") {
        fixture.state.beforePut = null;
        await publishHostedReport(request, { store: fixture.store, verifySource: current });
      }
    };
    expect((await publishHostedReport(request, { store: fixture.store, verifySource: current })).status).toBe(
      "published",
    );
    expect([...fixture.objects.keys()].sort()).toEqual([
      "state/vrt/pr-9.json",
      "vrt/pr-9/100-1/index.html",
      "vrt/pr-9/100-1/out.json",
    ]);
  });

  it("公開中closeと遅延publishで対象PRの全世代だけを削除する", async () => {
    const { store, objects, seed } = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store, verifySource: current });
    seed("vrt/pr-90/100-1/index.html", "other PR");
    seed("baselines/develop/100-1.zip", "baseline");
    let checks = 0;
    const closed = await publishHostedReport(
      { ...request, runId: 101 },
      { store, verifySource: async () => ({ status: ++checks === 1 ? "current" : "closed" }) },
    );
    expect(closed.status).toBe("closed");
    expect(
      (await publishHostedReport(request, { store, verifySource: async () => ({ status: "closed" }) })).status,
    ).toBe("closed");
    expect([...objects.keys()].sort()).toEqual(["baselines/develop/100-1.zip", "vrt/pr-90/100-1/index.html"]);
  });

  it("branchのreportとbaselineを同じrunで確定し、旧baselineを参照解除後24時間保全する", async () => {
    const fixture = createMemoryReportStore(new Date("2026-09-01T00:00:00Z"));
    const request = await branchReport();
    await publishHostedReport(request, { store: fixture.store, verifySource: current });
    fixture.state.now = new Date("2026-09-05T00:00:00Z");
    const result = await publishHostedReport(
      { ...request, runId: 101 },
      { store: fixture.store, verifySource: current, now: () => fixture.state.now },
    );
    expect(result.manifest?.baseline?.key).toBe("baselines/develop/101-1.zip");
    await maintainR2Reports(request, { store: fixture.store, now: new Date("2026-09-05T23:59:59Z") });
    expect([...fixture.objects.keys()].sort()).toEqual([
      "baselines/develop/100-1.zip",
      "baselines/develop/101-1.zip",
      "state/vrt/branches/develop.json",
      "state/vrt/branches/develop/retired/100-1.json",
      "vrt/branches/develop/101-1/index.html",
      "vrt/branches/develop/101-1/out.json",
    ]);
    await maintainR2Reports(request, { store: fixture.store, now: new Date("2026-09-06T00:00:01Z") });
    expect([...fixture.objects.keys()].sort()).toEqual([
      "baselines/develop/101-1.zip",
      "state/vrt/branches/develop.json",
      "vrt/branches/develop/101-1/index.html",
      "vrt/branches/develop/101-1/out.json",
    ]);
  });

  it("確定後のコメント失敗では公開を残し、旧レポートを回収する", async () => {
    const { store, objects } = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store, verifySource: current });
    const result = await publishHostedReport(
      { ...request, runId: 101 },
      {
        store,
        verifySource: current,
        afterCommit: async () => {
          throw new Error("comment forbidden");
        },
      },
    );
    expect([result.status, result.warnings, result.deletedFiles]).toEqual([
      "published",
      ["Report is published; its notification or HTTP verification failed"],
      2,
    ]);
    expect([...objects.keys()].sort()).toEqual([
      "state/vrt/pr-9.json",
      "vrt/pr-9/101-1/index.html",
      "vrt/pr-9/101-1/out.json",
    ]);
  });

  it("retirement記録の失敗で確定済みbaselineを巻き戻さず、日次回収が猶予を確保する", async () => {
    const fixture = createMemoryReportStore(new Date("2026-09-01T00:00:00Z"));
    const request = await branchReport();
    await publishHostedReport(request, { store: fixture.store, verifySource: current });
    fixture.state.now = new Date("2026-09-05T00:00:00Z");
    fixture.state.beforePut = async (key) => {
      if (key.includes("/retired/")) throw new Error("temporary metadata failure");
    };
    const result = await publishHostedReport(
      { ...request, runId: 101 },
      { store: fixture.store, verifySource: current, now: () => fixture.state.now },
    );
    expect(result.status).toBe("published");
    expect(result.warnings).toEqual(["Previous baseline retirement will be retried by maintenance"]);
    expect((await readReportManifest(fixture.store, request))?.manifest.baseline?.key).toBe(
      "baselines/develop/101-1.zip",
    );
    fixture.state.beforePut = null;
    await maintainR2Reports(request, { store: fixture.store, now: fixture.state.now });
    expect([...fixture.objects.keys()].filter((key) => key.startsWith("baselines/")).sort()).toEqual([
      "baselines/develop/100-1.zip",
      "baselines/develop/101-1.zip",
    ]);
  });

  it("別PRのmanifestを既存状態へ持ち込めない", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    const result = await publishHostedReport(
      { ...request, pullRequest: 10 },
      { store: fixture.store, verifySource: current },
    );
    fixture.seed(reportTargetPaths(request).manifestKey, JSON.stringify(result.manifest));
    await expect(publishHostedReport(request, { store: fixture.store, verifySource: current })).rejects.toThrow(
      "does not match its source",
    );
  });

  it("PRからのbaseline更新、path traversal、symlink、管理メタデータを拒否する", async () => {
    const { store } = createMemoryReportStore();
    const request = await report();
    expect(() => normalizePublishRequest({ ...request, sourceBranch: "develop" })).toThrow("Exactly one");
    expect(() =>
      normalizePublishRequest({ ...request, sourceBranch: "../main", pullRequest: null } as unknown as PublishRequest),
    ).toThrow("Only develop/main");
    expect(() =>
      normalizePublishRequest({
        ...request,
        baselineArchive: { path: "x", checksum: "a".repeat(64), imageCount: 1, bytes: 1 },
      }),
    ).toThrow("Only branch");
    await mkdir(path.join(request.source, "state"));
    await expect(publishHostedReport(request, { store, verifySource: current })).rejects.toThrow("Reserved");
    await rm(path.join(request.source, "state"), { recursive: true });
    await symlink(path.join(request.source, "index.html"), path.join(request.source, "link.html"));
    await expect(publishHostedReport(request, { store, verifySource: current })).rejects.toThrow("symlink");
  });

  it("新しいreport世代と確定世代は日次回収で維持する", async () => {
    const fixture = createMemoryReportStore();
    const request = await report();
    await publishHostedReport(request, { store: fixture.store, verifySource: current });
    fixture.seed("vrt/pr-9/99-1/index.html", "abandoned", new Date("2026-09-01T00:00:00Z"));
    fixture.seed("vrt/pr-9/101-1/index.html", "uploading");
    await maintainR2Reports(request, { store: fixture.store, verifySource: open, now: fixture.state.now });
    expect([...fixture.objects.keys()].sort()).toEqual([
      "state/vrt/pr-9.json",
      "vrt/pr-9/100-1/index.html",
      "vrt/pr-9/100-1/out.json",
      "vrt/pr-9/101-1/index.html",
    ]);
  });
});
