import { describe, expect, it } from "vitest";
import { createMemoryReportStore } from "./hostedReportStore.fixture";
import { deleteClosedReport, discoverReportTargets, maintainR2Reports } from "./maintainR2Reports.mjs";

const publishedManifest = {
  schemaVersion: 1,
  sourceRepository: "yn1323/yps-crispy-carnival",
  reportType: "vrt",
  pullRequest: 9,
  sourceBranch: null,
  sourceSha: "a".repeat(40),
  runId: 100,
  runAttempt: 1,
  updatedAt: "2026-09-05T00:00:00Z",
  reportPrefix: "vrt/pr-9/100-1/",
  fileCount: 2,
  bytes: 8,
};

describe("R2の削除対象と保持期限", () => {
  it("一覧から未確定世代も含むPR・branch対象を重複せず発見する", async () => {
    const { store, seed } = createMemoryReportStore();
    for (const key of [
      "vrt/pr-9/100-1/index.html",
      "state/vrt/pr-9.json",
      "playwright/pr-12/100-1/index.html",
      "baselines/main/99-1.zip",
      "state/vrt/branches/develop/retired/10-1.json",
      "state/other.json",
    ])
      seed(key, "fixture");
    expect(await discoverReportTargets(store)).toEqual([
      { reportType: "playwright", pullRequest: 12, sourceBranch: null },
      { reportType: "vrt", pullRequest: null, sourceBranch: "develop" },
      { reportType: "vrt", pullRequest: null, sourceBranch: "main" },
      { reportType: "vrt", pullRequest: 9, sourceBranch: null },
    ]);
  });

  it("再openしたPRは削除せず、削除直前に再openした場合も全件維持する", async () => {
    const { store, seed, objects } = createMemoryReportStore();
    seed("vrt/pr-9/100-1/index.html", "report");
    seed("state/vrt/pr-9.json", JSON.stringify({ ...publishedManifest, fileCount: 1, bytes: 6 }));
    const target = { reportType: "vrt" as const, pullRequest: 9 };
    expect(await deleteClosedReport(target, { store, verifySource: async () => ({ status: "open" }) })).toEqual({
      status: "open",
      deletedFiles: 0,
    });
    let checks = 0;
    expect(
      await deleteClosedReport(target, {
        store,
        verifySource: async () => ({ status: ++checks === 1 ? "closed" : "open" }),
      }),
    ).toEqual({ status: "open", deletedFiles: 0 });
    expect([...objects.keys()].sort()).toEqual(["state/vrt/pr-9.json", "vrt/pr-9/100-1/index.html"]);
  });

  it("1000件を超えるPR世代を全件削除し、別PRと別種別を残す", async () => {
    const { store, seed, objects } = createMemoryReportStore();
    for (let index = 0; index < 1_001; index += 1) seed(`vrt/pr-9/100-1/${index}.png`, "image");
    seed("vrt/pr-90/100-1/index.html", "other PR");
    seed("playwright/pr-9/100-1/index.html", "other type");
    expect(
      await deleteClosedReport(
        { reportType: "vrt", pullRequest: 9 },
        { store, verifySource: async () => ({ status: "closed" }) },
      ),
    ).toEqual({ status: "closed", deletedFiles: 1_001 });
    expect([...objects.keys()].sort()).toEqual(["playwright/pr-9/100-1/index.html", "vrt/pr-90/100-1/index.html"]);
  });

  it("削除の部分失敗を成功扱いせず、再実行で残りを回収する", async () => {
    const fixture = createMemoryReportStore();
    fixture.seed("vrt/pr-9/100-1/index.html", "report");
    fixture.seed("vrt/pr-9/100-1/out.json", "{}");
    fixture.seed("state/vrt/pr-9.json", JSON.stringify(publishedManifest));
    fixture.state.beforeDelete = async (keys) => {
      if (keys[0] === "state/vrt/pr-9.json") return;
      fixture.objects.delete(keys[0]);
      throw new Error("partial deletion");
    };
    const target = { reportType: "vrt" as const, pullRequest: 9 };
    await expect(
      deleteClosedReport(target, { store: fixture.store, verifySource: async () => ({ status: "closed" }) }),
    ).rejects.toThrow("partial deletion");
    expect([...fixture.objects.keys()]).toEqual(["vrt/pr-9/100-1/out.json"]);
    fixture.state.beforeDelete = null;
    expect(
      await deleteClosedReport(target, { store: fixture.store, verifySource: async () => ({ status: "closed" }) }),
    ).toEqual({ status: "closed", deletedFiles: 1 });
    expect([...fixture.objects.keys()]).toEqual([]);
  });

  it.each(["manifest", "report"])(
    "%s削除後のreopenでも全世代を削除し、部分削除を指すmanifestを残さない",
    async (reopenAfter) => {
      const fixture = createMemoryReportStore();
      fixture.seed("state/vrt/pr-9.json", JSON.stringify({ ...publishedManifest, fileCount: 1_001, bytes: 5_005 }));
      for (let index = 0; index < 1_001; index += 1) fixture.seed(`vrt/pr-9/100-1/${index}.png`, "image");
      fixture.seed("vrt/pr-90/100-1/index.html", "other PR");
      fixture.seed("playwright/pr-9/100-1/index.html", "other type");
      fixture.seed("baselines/main/99-1.zip", "baseline");
      const remove = fixture.store.delete;
      let reopened = false;
      const pointersDuringBodyDeletion: boolean[] = [];
      fixture.store.delete = async (keys) => {
        const deletingReport = keys.some((key) => key.startsWith("vrt/pr-9/"));
        if (deletingReport) pointersDuringBodyDeletion.push(fixture.objects.has("state/vrt/pr-9.json"));
        const deleted = await remove(keys);
        if (
          (reopenAfter === "manifest" && keys.includes("state/vrt/pr-9.json")) ||
          (reopenAfter === "report" && deletingReport)
        )
          reopened = true;
        return deleted;
      };
      expect(
        await deleteClosedReport(
          { reportType: "vrt", pullRequest: 9 },
          {
            store: fixture.store,
            verifySource: async () => ({ status: reopened ? "open" : "closed" }),
          },
        ),
      ).toEqual({ status: "closed", deletedFiles: 1_002 });
      expect(reopened).toBe(true);
      expect(pointersDuringBodyDeletion).toEqual([false, false]);
      expect([...fixture.objects.keys()].sort()).toEqual([
        "baselines/main/99-1.zip",
        "playwright/pr-9/100-1/index.html",
        "vrt/pr-90/100-1/index.html",
      ]);
    },
  );

  it("manifestを削除できない場合はレポート本体を変更しない", async () => {
    const fixture = createMemoryReportStore();
    fixture.seed("state/vrt/pr-9.json", JSON.stringify(publishedManifest));
    fixture.seed("vrt/pr-9/100-1/index.html", "report");
    fixture.seed("vrt/pr-9/100-1/out.json", "{}");
    const before = [...fixture.objects.entries()];
    fixture.state.beforeDelete = async (keys) => {
      if (keys.includes("state/vrt/pr-9.json")) throw new Error("manifest deletion failed");
    };
    await expect(
      deleteClosedReport(
        { reportType: "vrt", pullRequest: 9 },
        {
          store: fixture.store,
          verifySource: async () => ({ status: "closed" }),
        },
      ),
    ).rejects.toThrow("manifest deletion failed");
    expect([...fixture.objects.entries()]).toEqual(before);
  });

  it("retirement記録前の中断では発見後24時間を確保してbaselineを回収する", async () => {
    const fixture = createMemoryReportStore();
    fixture.seed("baselines/main/1-1.zip", "old", new Date("2026-09-01T00:00:00Z"));
    const target = { reportType: "vrt" as const, sourceBranch: "main" as const };
    await maintainR2Reports(target, { store: fixture.store, now: new Date("2026-09-05T00:00:00Z") });
    expect([...fixture.objects.keys()].sort()).toEqual([
      "baselines/main/1-1.zip",
      "state/vrt/branches/main/retired/1-1.json",
    ]);
    await maintainR2Reports(target, { store: fixture.store, now: new Date("2026-09-06T00:00:01Z") });
    expect([...fixture.objects.keys()]).toEqual([]);
  });
});
