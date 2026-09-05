import { describe, expect, it, vi } from "vitest";
import {
  checkPublicObject,
  commentOnReport,
  githubClient,
  preflight,
  requestFromEvent,
  resultSummary,
  type SourceRequest,
  verifyGitHubSource,
} from "./hostedReportCi.mjs";
import { createMemoryReportStore } from "./hostedReportStore.fixture";
import { R2ConfigurationError, SOURCE_REPOSITORY } from "./hostedReportStore.mjs";

const request: SourceRequest = {
  reportType: "vrt",
  pullRequest: 900,
  sourceBranch: null,
  sourceSha: "a".repeat(40),
  runId: 100,
  runAttempt: 2,
};
const repository = { full_name: SOURCE_REPOSITORY };
const run = {
  repository,
  head_repository: repository,
  head_sha: request.sourceSha,
  run_attempt: 2,
  path: ".github/workflows/vrt.yml",
  event: "pull_request",
  head_branch: "feat/example",
  pull_requests: [{ number: 900 }],
};
const pr = {
  state: "open",
  head: { repo: repository, sha: request.sourceSha, ref: "feat/example" },
  base: { repo: repository, ref: "main" },
};

describe("レポートのGitHub出所検証", () => {
  it("main向け同一repository PRのheadと現在attemptを確認する", async () => {
    const api = vi.fn().mockResolvedValueOnce(run).mockResolvedValueOnce(pr);
    await expect(verifyGitHubSource(request, api)).resolves.toEqual({ status: "current" });
  });
  it("更新済みPRと終了済みPRを公開対象にしない", async () => {
    await expect(
      verifyGitHubSource(
        request,
        vi
          .fn()
          .mockResolvedValueOnce(run)
          .mockResolvedValueOnce({ ...pr, head: { ...pr.head, sha: "b".repeat(40) } }),
      ),
    ).resolves.toEqual({ status: "stale" });
    await expect(
      verifyGitHubSource(
        request,
        vi
          .fn()
          .mockResolvedValueOnce(run)
          .mockResolvedValueOnce({ ...pr, state: "closed" }),
      ),
    ).resolves.toEqual({ status: "closed" });
  });
  it("取り消されたworkflowの結果を新しく公開しない", async () => {
    await expect(
      verifyGitHubSource(request, vi.fn().mockResolvedValue({ ...run, conclusion: "cancelled" })),
    ).resolves.toEqual({ status: "stale" });
  });
  it.each([
    { run_attempt: 3 },
    { head_sha: "b".repeat(40) },
    { path: ".github/workflows/other.yml" },
    { head_repository: { full_name: "attacker/fork" } },
    { event: "workflow_dispatch" },
    { pull_requests: [{ number: 901 }] },
  ])("異なる実行の結果を拒否する: %j", async (override) => {
    const api = vi
      .fn()
      .mockResolvedValueOnce({ ...run, ...override })
      .mockResolvedValueOnce(pr);
    await expect(verifyGitHubSource(request, api)).rejects.toThrow();
  });
  it("PR成功ではbranch baselineを更新できない", async () => {
    await expect(
      verifyGitHubSource({ ...request, pullRequest: null, sourceBranch: "main" }, vi.fn().mockResolvedValue(run)),
    ).rejects.toThrow("branch pushes");
  });
  it("branch pushは現在branchのSHAと一致する場合だけ更新する", async () => {
    const source = { ...request, pullRequest: null, sourceBranch: "develop" };
    const branchRun = { ...run, event: "push", head_branch: "develop" };
    await expect(
      verifyGitHubSource(
        source,
        vi
          .fn()
          .mockResolvedValueOnce(branchRun)
          .mockResolvedValueOnce({ commit: { sha: request.sourceSha } }),
      ),
    ).resolves.toEqual({ status: "current" });
    await expect(
      verifyGitHubSource(
        source,
        vi
          .fn()
          .mockResolvedValueOnce(branchRun)
          .mockResolvedValueOnce({ commit: { sha: "b".repeat(40) } }),
      ),
    ).resolves.toEqual({ status: "stale" });
  });
  it("初回移行もancestorと全capture成功を必須にする", async () => {
    const source = { ...request, pullRequest: null, sourceBranch: "main" };
    const api = vi
      .fn()
      .mockResolvedValueOnce({ ...run, event: "push", head_branch: "main" })
      .mockResolvedValueOnce({ commit: { sha: "b".repeat(40) } })
      .mockResolvedValueOnce({ status: "ahead" })
      .mockResolvedValueOnce({
        jobs: [1, 2, 3, 4].map((shard) => ({
          name: `capture (${shard})`,
          conclusion: shard === 4 ? "failure" : "success",
        })),
      });
    await expect(verifyGitHubSource(source, api, { bootstrap: true })).rejects.toThrow("four successful");
  });
  it("イベントのfork入力を拒否する", () => {
    expect(() =>
      requestFromEvent(
        {
          repository,
          number: 900,
          pull_request: { ...pr, head: { ...pr.head, repo: { full_name: "attacker/fork" } } },
        },
        {
          GITHUB_REPOSITORY: SOURCE_REPOSITORY,
          GITHUB_RUN_ID: "100",
          GITHUB_RUN_ATTEMPT: "2",
          GITHUB_EVENT_NAME: "pull_request",
        },
        "vrt",
      ),
    ).toThrow("same-repository");
  });
});

describe("公開コメントの集計", () => {
  it("GitHubの拒否理由は操作とHTTP statusだけを記録し、tokenや応答本文を出さない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const api = githubClient(
        "test-token",
        vi.fn().mockResolvedValue(new Response("private provider response", { status: 403 })),
      );
      await expect(
        api(`/repos/${SOURCE_REPOSITORY}/issues/900/comments`, { method: "POST", body: '{"body":"report"}' }),
      ).rejects.toThrow("GitHub API POST failed (HTTP 403)");
      expect(log.mock.calls).toEqual([["GitHub API POST failed (HTTP 403)"]]);
    } finally {
      log.mockRestore();
    }
  });
  it.each(["vrt", "playwright"] as const)("%sの旧botコメントだけを全件削除して新規投稿する", async (reportType) => {
    const title = reportType === "vrt" ? "VRT Report" : "Playwright Test Report";
    const marker = `<!-- r2-report:${reportType} -->`;
    const otherMarker = `<!-- r2-report:${reportType === "vrt" ? "playwright" : "vrt"} -->`;
    const api = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, user: { login: "user" }, body: marker },
        { id: 2, user: { login: "github-actions[bot]" }, body: `## ${title}\nold hosting link` },
        { id: 3, user: { login: "github-actions[bot]" }, body: marker },
        { id: 4, user: { login: "github-actions[bot]" }, body: otherMarker },
      ])
      .mockResolvedValue({});
    const url = `https://pub-test.r2.dev/${reportType}/pr-900/100-2/index.html`;
    await commentOnReport({ ...request, reportType }, url, api);
    expect(api.mock.calls.slice(1)).toEqual([
      [`/repos/${SOURCE_REPOSITORY}/issues/comments/2`, { method: "DELETE" }],
      [`/repos/${SOURCE_REPOSITORY}/issues/comments/3`, { method: "DELETE" }],
      [`/repos/${SOURCE_REPOSITORY}/issues/900/comments`, { method: "POST", body: expect.stringContaining(url) }],
    ]);
    const { body } = JSON.parse(api.mock.calls.at(-1)?.[1].body);
    expect(body.includes(`[VRTの承認画面を開く](https://github.com/${SOURCE_REPOSITORY}/actions/runs/100)`)).toBe(
      reportType === "vrt",
    );
  });
  it("全ページ取得が終わるまで削除を始めず、2ページ目の旧コメントも削除する", async () => {
    const comment = { id: 1, user: { login: "github-actions[bot]" }, body: "<!-- r2-report:vrt -->" };
    const api = vi
      .fn()
      .mockResolvedValueOnce([comment, ...Array.from({ length: 99 }, () => ({ user: { login: "user" } }))])
      .mockResolvedValueOnce([{ ...comment, id: 101 }])
      .mockResolvedValue({});
    await commentOnReport(request, "https://pub-test.r2.dev/report", api);
    expect(api.mock.calls.slice(0, 4)).toEqual([
      [`/repos/${SOURCE_REPOSITORY}/issues/900/comments?per_page=100&page=1`],
      [`/repos/${SOURCE_REPOSITORY}/issues/900/comments?per_page=100&page=2`],
      [`/repos/${SOURCE_REPOSITORY}/issues/comments/1`, { method: "DELETE" }],
      [`/repos/${SOURCE_REPOSITORY}/issues/comments/101`, { method: "DELETE" }],
    ]);
    expect(api).toHaveBeenCalledTimes(5);
  });
  it("旧コメントの削除に失敗した場合は新規投稿しない", async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, user: { login: "github-actions[bot]" }, body: "<!-- r2-report:vrt -->" }])
      .mockRejectedValueOnce(new Error("deletion failed"));
    await expect(commentOnReport(request, "https://pub-test.r2.dev/report", api)).rejects.toThrow("deletion failed");
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("動画を削除しても失敗と件数を隠さない", () => {
    expect(
      resultSummary("playwright", { stats: { expected: 8, unexpected: 1, flaky: 2, skipped: 3 } }, "failure"),
    ).toBe(
      "**テスト失敗**\n\n| ✅ 成功 | ❌ 失敗 | ⚠️ 不安定 | ⏭️ スキップ |\n| ---: | ---: | ---: | ---: |\n| 8 | 1 | 2 | 3 |",
    );
  });
  it("画像を省いた変更なし件数も残す", () => {
    expect(resultSummary("vrt", { failedItems: ["a"], newItems: [], deletedItems: [], passedItems: ["b", "c"] })).toBe(
      "| 🔄 変更 | 🆕 追加 | 🗑️ 削除 | ✅ 変更なし |\n| ---: | ---: | ---: | ---: |\n| 1 | 0 | 0 | 2 |",
    );
  });
});

describe("R2公開URLの実接続確認", () => {
  it("書込・読取・公開確認・匿名更新拒否・削除を検証し、確認用objectだけを消す", async () => {
    const { store, seed, objects } = createMemoryReportStore();
    seed("state/existing.json", "existing");
    const fetchImpl = vi.fn<typeof fetch>(async (input, options) => {
      if (options?.method === "PUT") return new Response(null, { status: 405 });
      const key = new URL(String(input)).pathname.slice(1);
      const object = objects.get(key);
      return object ? new Response(object.body.toString()) : new Response(null, { status: 404 });
    });
    await expect(preflight(store, { fetchImpl })).resolves.toEqual({ status: "verified" });
    expect([...objects.keys()]).toEqual(["state/existing.json"]);
  });
  it("429は上限付きで再試行する", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("expected"));
    await checkPublicObject("https://example.r2.dev/check", { expected: "expected", fetchImpl, sleep: vi.fn() });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("upload済みobjectの404と別bucketの内容を設定エラーにする", async () => {
    await expect(
      checkPublicObject("https://example.r2.dev/check", {
        fetchImpl: vi.fn().mockResolvedValue(new Response("missing", { status: 404 })),
      }),
    ).rejects.toBeInstanceOf(R2ConfigurationError);
    await expect(
      checkPublicObject("https://example.r2.dev/check", {
        expected: "expected",
        fetchImpl: vi.fn().mockResolvedValue(new Response("wrong")),
      }),
    ).rejects.toBeInstanceOf(R2ConfigurationError);
  });
  it("削除完了は公開URLの404で確かめる", async () => {
    await expect(
      checkPublicObject("https://example.r2.dev/check", {
        missing: true,
        fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
      }),
    ).resolves.toBeUndefined();
  });
});
