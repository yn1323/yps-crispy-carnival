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
  it("旧hostingのbotコメントをR2リンクへ更新し、人のコメントを変更しない", async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, user: { login: "user" }, body: "## VRT Report\nuser content" },
        { id: 2, user: { login: "github-actions[bot]" }, body: "## VRT Report\nold hosting link" },
      ])
      .mockResolvedValueOnce({});
    await commentOnReport(request, "https://pub-test.r2.dev/vrt/pr-900/100-2/index.html", api);
    expect(api).toHaveBeenLastCalledWith(`/repos/${SOURCE_REPOSITORY}/issues/comments/2`, {
      method: "PATCH",
      body: expect.stringContaining("https://pub-test.r2.dev/vrt/pr-900/100-2/index.html"),
    });
  });
  it("動画を削除しても失敗と件数を隠さない", () => {
    expect(
      resultSummary("playwright", { stats: { expected: 8, unexpected: 1, flaky: 2, skipped: 3 } }, "failure"),
    ).toBe("テスト失敗：成功 8 / 失敗 1 / 不安定 2 / スキップ 3。");
  });
  it("画像を省いた変更なし件数も残す", () => {
    expect(
      resultSummary("vrt", { failedItems: ["a"], newItems: [], deletedItems: [], passedItems: ["b", "c"] }),
    ).toContain("変更なし 2");
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
