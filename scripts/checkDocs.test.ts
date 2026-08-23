import { describe, expect, it } from "vitest";
import {
  buildConvexOperationalReferenceRegistryFromSources,
  checkDocs,
  type DocsWorkspace,
  extractConvexOperationalReferences,
  extractConvexReferences,
  extractHeadingAnchors,
  extractRepoPathReferences,
  findArchiveIssues,
  findConvexOperationalReferenceIssues,
  findConvexReferenceIssues,
  findCurrentDocPathIssues,
  findMarkdownLinkIssues,
  findPlanIndexIssues,
  findPublicConvexInventoryIssues,
  findReachabilityIssues,
} from "./checkDocs";

describe("文書検査全体", () => {
  it("2遷移以内で到達できる完全な文書構成を受理する", () => {
    const documents = {
      "doc/INDEX.md": [
        "# Docs",
        "[Architecture](ARCHITECTURE.md)",
        "[Features](features/INDEX.md)",
        "[Plans](plans/INDEX.md)",
        "[Manual](manual/INDEX.md)",
        "[Archive](archive/INDEX.md)",
      ].join("\n"),
      "doc/ARCHITECTURE.md": "# Architecture\n`src/existing.ts`",
      "doc/features/INDEX.md": "# Features\n[Feature](feature.md)",
      "doc/features/feature.md": "# Feature",
      "doc/manual/INDEX.md": "# Manual",
      "doc/plans/INDEX.md": [
        "# Plans",
        "## Proposed",
        "| 計画 | 状態 |",
        "|---|---|",
        "| [Proposal](proposal.md) | reviewing |",
        "## Active",
        "| 計画 | 状態 | 未完了条件 |",
        "|---|---|---|",
        "| [Active](active.md) | implementing | 実装を完了する |",
        "## History",
        "| 計画 | 状態 |",
        "|---|---|",
        "| [History](history.md) | completed |",
      ].join("\n"),
      "doc/plans/proposal.md": "# Proposal\n`src/future.ts`",
      "doc/plans/active.md": "# Active",
      "doc/plans/history.md": "# History",
      "doc/archive/INDEX.md": "# Archive\n[Old](old.md)",
      "doc/archive/old.md": [
        "# Old",
        "> Archive日: 2026-07-23  ",
        "> 理由: `superseded`  ",
        "> 後継: [Feature](../features/feature.md)",
      ].join("\n"),
    };

    expect(checkDocs({ documents, existingPaths: new Set(["src/existing.ts"]) })).toEqual([]);
  });
});

describe("Markdownリンクと見出しanchor", () => {
  it("日本語・記号・重複見出しのanchorを解決する", () => {
    const documents = {
      "doc/source.md": [
        "[日本語](target.md#4-バックエンド仕様convexaishiftdraft)",
        "[duplicate](target.md#同じ見出し-1)",
        "[external](https://example.com/missing.md)",
      ].join("\n"),
      "doc/target.md": [
        "# Target",
        "## 4. バックエンド仕様（convex/aiShiftDraft/）",
        "## 同じ見出し",
        "## 同じ見出し",
      ].join("\n"),
    };

    expect(findMarkdownLinkIssues({ documents })).toEqual([]);
    expect(extractHeadingAnchors(documents["doc/target.md"])).toEqual(
      new Set(["target", "4-バックエンド仕様convexaishiftdraft", "同じ見出し", "同じ見出し-1"]),
    );
  });

  it("存在しないファイルと見出しを別々に報告する", () => {
    const documents = {
      "doc/source.md": "[missing](missing.md)\n[anchor](target.md#missing)",
      "doc/target.md": "# Existing",
    };

    expect(findMarkdownLinkIssues({ documents }).map((issue) => issue.code)).toEqual([
      "broken-markdown-link",
      "missing-heading-anchor",
    ]);
  });

  it("括弧を含むlink先とreference-style linkを解決する", () => {
    const documents = {
      "doc/source.md": ["[inline](some_(old).md)", "[reference][target]", "", "[target]: target.md#見出し"].join("\n"),
      "doc/some_(old).md": "# Old",
      "doc/target.md": "# 見出し",
    };

    expect(findMarkdownLinkIssues({ documents })).toEqual([]);
  });

  it("ルートREADMEの相対linkも検査する", () => {
    const documents = {
      "README.md": "[Docs](doc/missing.md)",
      "doc/INDEX.md": "# Docs",
    };

    expect(findMarkdownLinkIssues({ documents })).toEqual([
      expect.objectContaining({ code: "broken-markdown-link", filePath: "README.md" }),
    ]);
    expect(findReachabilityIssues(documents)).toEqual([]);
  });

  it("fragmentの大文字化と余分なhashを受理しない", () => {
    const documents = {
      "doc/source.md": "[case](target.md#Title)\n[hash](target.md#title#extra)",
      "doc/target.md": "# Title",
    };

    expect(findMarkdownLinkIssues({ documents }).map((issue) => issue.code)).toEqual([
      "missing-heading-anchor",
      "missing-heading-anchor",
    ]);
  });

  it("重複suffixと同名の見出しにも一意なanchorを付ける", () => {
    expect(extractHeadingAnchors("# foo\n# foo\n# foo-1")).toEqual(new Set(["foo", "foo-1", "foo-1-1"]));
  });
});

describe("現行文書のrepo相対path", () => {
  it("保守的なpath候補だけを検査し、提案・glob・URL・route・CLI参照を除外する", () => {
    const currentSource = [
      "`src/existing.ts`",
      "`apps/internal/src/worker.ts`",
      "`src/worker.ts:fetch`",
      "`src/missing.ts`",
      "`src/removed.ts`は現行リポジトリに存在しない。",
      "`src/helpers/`は作らない。",
      "`src/deleted-account.ts` — 削除済みuserの終了状態。",
      "`src/{future}/**/*.ts`",
      "`https://example.com/file.ts`",
      "`/terms`",
      "`pnpm docs:check`",
      "`convex/migrations/index:run`",
    ].join("\n");
    const documents = {
      "doc/ARCHITECTURE.md": currentSource,
      "doc/plans/proposal.md": "`src/not-built-yet.ts`",
    };
    const workspace: DocsWorkspace = {
      documents,
      existingPaths: new Set([
        "src/existing.ts",
        "src/worker.ts",
        "src/deleted-account.ts",
        "apps/internal/src/worker.ts",
      ]),
    };

    expect(extractRepoPathReferences(currentSource).map((reference) => reference.path)).toEqual([
      "src/existing.ts",
      "apps/internal/src/worker.ts",
      "src/worker.ts",
      "src/missing.ts",
      "src/deleted-account.ts",
    ]);
    expect(findCurrentDocPathIssues(workspace)).toEqual([
      expect.objectContaining({ code: "missing-repo-path", message: expect.stringContaining("src/missing.ts") }),
    ]);
  });

  it("別workspaceの同名pathでrootの不存在pathを補完しない", () => {
    const documents = {
      "doc/features/example.md": "`apps/internal/src/worker.ts`\n`src/worker.ts`",
    };

    expect(
      findCurrentDocPathIssues({
        documents,
        existingPaths: new Set(["apps/internal/src/worker.ts"]),
      }),
    ).toEqual([
      expect.objectContaining({ code: "missing-repo-path", message: expect.stringContaining("src/worker.ts") }),
    ]);
  });

  it("否定表現は同じ候補だけを除外し、前の実在pathを検査する", () => {
    const source = "`src/current.ts`を使い、`src/future.ts`は作らない。";

    expect(extractRepoPathReferences(source)).toEqual([{ path: "src/current.ts", line: 1 }]);
  });

  it("repo rootの外へ出るpath候補を除外する", () => {
    expect(extractRepoPathReferences("`src/../../outside.ts`")).toEqual([]);
  });
});

describe("Convex API参照", () => {
  it("exact dotted参照とcolon export参照だけを抽出する", () => {
    const source = [
      "`api.dashboard.queries.getMyShops`",
      "`internal.notificationOutbox.actions.processPending`",
      "`api.organization.mutations.*`",
      "`contact/actions:deliver`",
      "`lib:getStatus`",
      "`src/worker.ts:fetch`",
    ].join("\n");

    expect(extractConvexReferences(source)).toEqual([
      { kind: "dotted", reference: "api.dashboard.queries.getMyShops", line: 1 },
      { kind: "dotted", reference: "internal.notificationOutbox.actions.processPending", line: 2 },
      { kind: "colon", reference: "contact/actions:deliver", line: 4 },
    ]);
  });

  it("存在しないdotted APIとcolon exportを別々に報告する", () => {
    const documents = {
      "doc/features/example.md": [
        "`api.dashboard.queries.getMyShops`",
        "`api.dashboard.queries.missing`",
        "`contact/actions:deliver`",
        "`contact/actions:missing`",
      ].join("\n"),
    };

    expect(
      findConvexReferenceIssues({
        documents,
        convexReferences: {
          dotted: new Set(["api.dashboard.queries.getMyShops"]),
          colon: new Set(["contact/actions:deliver"]),
        },
      }).map((issue) => issue.code),
    ).toEqual(["missing-convex-api-reference", "missing-convex-colon-reference"]);
  });
});

describe("Public Convex surface inventory", () => {
  const document = (countLine: string, rows: string[]) =>
    [
      "# Full Regression",
      "## Public Convex surface inventory",
      "",
      countLine,
      "",
      "| Module | Public exports | 対応契約 / 状態 |",
      "|---|---|---|",
      ...rows,
      "",
      "## Public HTTP surface inventory",
    ].join("\n");

  it("記載件数と全公開exportが生成surfaceに一致する文書を受理する", () => {
    const documents = {
      "doc/specs/full-regression-contracts.md": document("public query、mutation、actionは2個である。", [
        "| `dashboard/queries` | `getCurrentUser`、`getMyShops` | `AUTH-TENANT-01` |",
      ]),
    };

    expect(
      findPublicConvexInventoryIssues({
        documents,
        publicConvexSurface: new Set(["dashboard/queries#getCurrentUser", "dashboard/queries#getMyShops"]),
      }),
    ).toEqual([]);
  });

  it("未記載、廃止済みexport、件数ずれを別々に報告する", () => {
    const documents = {
      "doc/specs/full-regression-contracts.md": document("public query、mutation、actionは1個である。", [
        "| `dashboard/queries` | `getCurrentUser`、`removedQuery` | `AUTH-TENANT-01` |",
      ]),
    };

    expect(
      findPublicConvexInventoryIssues({
        documents,
        publicConvexSurface: new Set(["dashboard/queries#getCurrentUser", "dashboard/queries#getMyShops"]),
      }).map((issue) => issue.code),
    ).toEqual([
      "missing-public-convex-inventory-export",
      "stale-public-convex-inventory-export",
      "incorrect-public-convex-inventory-count",
    ]);
  });
});

describe("Convex HTTP route・cron・migration参照", () => {
  const validSources = {
    http: [
      "const http = httpRouter();",
      'http.route({ path: "/line/webhook", method: "OPTIONS", handler });',
      'http.route({ path: "/line/webhook", method: "POST", handler });',
    ].join("\n"),
    crons: [
      "const crons = cronJobs();",
      'crons.cron("analytics-daily-aggregation", "0 18 * * *", handler);',
      'crons.interval("notification-outbox-drain", { minutes: 1 }, handler);',
    ].join("\n"),
    migrations: [
      "export const run = migrations.runner([",
      "  internal.migrations.m001_first_migration.migration,",
      "  internal.migrations.m002_second_migration.migration,",
      "]);",
      "export const runM001 = migrations.runner(",
      "  internal.migrations.m001_first_migration.migration,",
      ");",
    ].join("\n"),
  };

  it("fence外のinline codeから明示的な運用参照だけを抽出する", () => {
    const source = [
      "`POST /line/webhook`",
      "`/line/webhook`",
      "cron `notification-outbox-drain`",
      "`analytics-daily-aggregation` cronが起動する",
      "`manager-terms-doc-2026-05-09`",
      "`m001`",
      "`m002_second_migration`",
      "```text",
      "`POST /missing`",
      "cron `missing-cron`",
      "`m999_missing`",
      "```",
    ].join("\n");

    expect(extractConvexOperationalReferences(source)).toEqual([
      { kind: "http-route", reference: "POST /line/webhook", line: 1 },
      { kind: "cron", reference: "notification-outbox-drain", line: 3 },
      { kind: "cron", reference: "analytics-daily-aggregation", line: 4 },
      { kind: "migration", reference: "m001", line: 6 },
      { kind: "migration", reference: "m002_second_migration", line: 7 },
    ]);
  });

  it("ASTからroute、cron、migrationと一意な短縮migration名を構築する", () => {
    const registry = buildConvexOperationalReferenceRegistryFromSources(validSources);

    expect(registry.httpRoutes).toEqual(new Set(["OPTIONS /line/webhook", "POST /line/webhook"]));
    expect(registry.cronNames).toEqual(new Set(["analytics-daily-aggregation", "notification-outbox-drain"]));
    expect(registry.migrationNames).toEqual(new Set(["m001", "m001_first_migration", "m002", "m002_second_migration"]));
  });

  it("現行文書の存在しないroute、cron、migrationを別々に報告する", () => {
    const documents = {
      "doc/features/example.md": [
        "`POST /line/webhook`",
        "`GET /line/webhook`",
        "cron `notification-outbox-drain`",
        "cron `missing-cron`",
        "`m001`",
        "`m002_second_migration`",
        "`m999`",
      ].join("\n"),
      "doc/plans/proposal.md": "`GET /missing-plan-route`\ncron `missing-plan-cron`\n`m998`",
      "doc/archive/old.md": "`GET /missing-archive-route`\ncron `missing-archive-cron`\n`m997`",
    };
    const convexOperationalReferences = buildConvexOperationalReferenceRegistryFromSources(validSources);

    expect(findConvexOperationalReferenceIssues({ documents, convexOperationalReferences })).toEqual([
      expect.objectContaining({
        code: "missing-convex-http-route-reference",
        filePath: "doc/features/example.md",
        line: 2,
      }),
      expect.objectContaining({
        code: "missing-convex-cron-reference",
        filePath: "doc/features/example.md",
        line: 4,
      }),
      expect.objectContaining({
        code: "missing-convex-migration-reference",
        filePath: "doc/features/example.md",
        line: 7,
      }),
    ]);
  });

  it.each([
    {
      label: "HTTP route",
      sources: { ...validSources, http: 'http.route({ path: routePath, method: "POST", handler });' },
      message: "literalのmethodとpath",
    },
    {
      label: "cron",
      sources: { ...validSources, crons: "crons.interval(cronName, { minutes: 1 }, handler);" },
      message: "cron名はliteral",
    },
    {
      label: "migration",
      sources: { ...validSources, migrations: "export const run = migrations.runner(migrationReference);" },
      message: "静的なfunction reference",
    },
  ])("動的な$label登録からinventoryを作らない", ({ sources, message }) => {
    expect(() => buildConvexOperationalReferenceRegistryFromSources(sources)).toThrow(message);
  });

  it("migration番号の重複を拒否する", () => {
    expect(() =>
      buildConvexOperationalReferenceRegistryFromSources({
        ...validSources,
        migrations: [
          "export const run = migrations.runner([",
          "  internal.migrations.m021_first_migration.migration,",
          "  internal.migrations.m021_second_migration.migration,",
          "]);",
        ].join("\n"),
      }),
    ).toThrow("migration番号m021が重複しています");
  });
});

describe("2遷移以内の到達性", () => {
  it("Archive本文を除き2遷移外のMarkdownを報告する", () => {
    const documents = {
      "doc/INDEX.md": "[Features](features/INDEX.md)\n[Archive](archive/INDEX.md)",
      "doc/features/INDEX.md": "[Feature](feature.md)",
      "doc/features/feature.md": "# Feature",
      "doc/manual/orphan.md": "# Orphan",
      "doc/archive/INDEX.md": "[Old](old.md)",
      "doc/archive/old.md": "# Old",
    };

    expect(findReachabilityIssues(documents)).toEqual([
      expect.objectContaining({ code: "unreachable-current-doc", filePath: "doc/manual/orphan.md" }),
    ]);
  });

  it("Archive INDEXはルートINDEXから到達できることを要求する", () => {
    const documents = {
      "doc/INDEX.md": "# Docs",
      "doc/archive/INDEX.md": "[Old](old.md)",
      "doc/archive/old.md": "# Old",
    };

    expect(findReachabilityIssues(documents)).toEqual([
      expect.objectContaining({ code: "unreachable-current-doc", filePath: "doc/archive/INDEX.md" }),
    ]);
  });
});

describe("Plans INDEX", () => {
  it("すべてのplanが分類表へ一度だけ掲載されることを要求する", () => {
    const documents = {
      "doc/plans/INDEX.md": [
        "## Proposed",
        "| 計画 |",
        "|---|",
        "| [Proposal](proposal.md) |",
        "## Active",
        "| 計画 | 状態 | 未完了条件 |",
        "|---|---|---|",
        "| [Active](active.md) | implementing | 実装を完了する |",
        "| [Active again](active.md) | implementing | 実装を完了する |",
        "## History",
        "| 計画 |",
        "|---|",
      ].join("\n"),
      "doc/plans/proposal.md": "# Proposal",
      "doc/plans/active.md": "# Active",
      "doc/plans/history.md": "# History",
    };

    expect(findPlanIndexIssues(documents).map((issue) => [issue.code, issue.filePath])).toEqual([
      ["duplicate-plan-index-entry", "doc/plans/INDEX.md"],
      ["missing-plan-index-entry", "doc/plans/history.md"],
    ]);
  });

  it("3種類の分類見出しを要求する", () => {
    const documents = {
      "doc/plans/INDEX.md": "# Plans\n## Active",
    };

    expect(findPlanIndexIssues(documents).map((issue) => issue.message)).toEqual([
      "Proposedセクションがありません",
      "Historyセクションがありません",
    ]);
  });

  it("Active行に状態と未完了条件を要求する", () => {
    const documents = {
      "doc/plans/INDEX.md": [
        "## Proposed",
        "## Active",
        "| 計画 | 状態 | 未完了条件 |",
        "|---|---|---|",
        "| [Active](active.md) | | |",
        "## History",
      ].join("\n"),
      "doc/plans/active.md": "# Active",
    };

    expect(findPlanIndexIssues(documents).map((issue) => issue.code)).toEqual([
      "missing-active-plan-status",
      "missing-active-plan-condition",
    ]);
  });
});

describe("Archive INDEXとmetadata", () => {
  it("INDEX掲載・定義済み理由・後継案内を要求する", () => {
    const documents = {
      "doc/archive/INDEX.md": "[Listed](listed.md)",
      "doc/archive/listed.md": ["> 理由: `superseded`  ", "> 後継: [Current](../features/current.md)"].join("\n"),
      "doc/archive/missing.md": "# Missing metadata",
      "doc/features/current.md": "# Current",
    };

    expect(findArchiveIssues(documents).map((issue) => [issue.code, issue.filePath])).toEqual([
      ["missing-archive-index-entry", "doc/archive/missing.md"],
      ["missing-archive-reason", "doc/archive/missing.md"],
      ["missing-archive-successor", "doc/archive/missing.md"],
    ]);
  });

  it("定義されていないArchive理由を拒否する", () => {
    const documents = {
      "doc/archive/INDEX.md": "[Old](old.md)",
      "doc/archive/old.md": "> 理由: `old`\n> 後継: なし（機能を廃止）",
    };

    expect(findArchiveIssues(documents)).toEqual([
      expect.objectContaining({ code: "invalid-archive-reason", filePath: "doc/archive/old.md" }),
    ]);
  });

  it("曖昧な後継案内を拒否する", () => {
    const documents = {
      "doc/archive/INDEX.md": "[Old](old.md)",
      "doc/archive/old.md": "> 理由: `superseded`\n> 後継: TBD",
    };

    expect(findArchiveIssues(documents)).toEqual([
      expect.objectContaining({ code: "invalid-archive-successor", filePath: "doc/archive/old.md" }),
    ]);
  });

  it("理由付きの後継なしを受理する", () => {
    const documents = {
      "doc/archive/INDEX.md": "[Old](old.md)",
      "doc/archive/old.md": "> 理由: `removed-feature`\n> 後継: なし（機能を廃止したため）",
    };

    expect(findArchiveIssues(documents)).toEqual([]);
  });
});
