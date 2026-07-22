import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type ProjectName = "setup" | "multi-actor-chromium" | "desktop-chromium" | "mobile-chrome";
type ScenarioProjectName = Exclude<ProjectName, "setup">;

type SyntheticAnnotation = {
  type: string;
  description: string;
};

type SyntheticResult = {
  status: "passed";
  retry: number;
  startTime: string;
  duration: number;
  annotations: SyntheticAnnotation[];
};

type SyntheticTest = {
  expectedStatus: "passed";
  projectName: ProjectName;
  results: SyntheticResult[];
};

type SyntheticSuite = {
  title: string;
  file: string;
  specs: Array<{
    title: string;
    tests: SyntheticTest[];
  }>;
};

type SyntheticReport = {
  errors: unknown[];
  suites: SyntheticSuite[];
};

type ScenarioFixture = {
  file: string;
  project: ScenarioProjectName;
  titles: readonly string[];
};

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const GATE_SCRIPT_PATH = path.join(SCRIPT_DIRECTORY, "assertPlaywrightReleaseResults.mjs");
const BASE_TIME_MS = Date.UTC(2026, 0, 1);
const PROJECT_TIMINGS = {
  setup: { startOffsetMs: 0, durationMs: 1_000 },
  "multi-actor-chromium": { startOffsetMs: 2_000, durationMs: 2_000 },
  "desktop-chromium": { startOffsetMs: 5_000, durationMs: 4_000 },
  "mobile-chrome": { startOffsetMs: 6_000, durationMs: 1_000 },
} as const satisfies Record<ProjectName, { startOffsetMs: number; durationMs: number }>;

const SCENARIO_FIXTURES = [
  {
    file: "scenarios/auth-pages.test.ts",
    project: "desktop-chromium",
    titles: ["認証ページを確認する"],
  },
  {
    file: "scenarios/dashboard-pagination.test.ts",
    project: "desktop-chromium",
    titles: ["ダッシュボードのページングを確認する"],
  },
  {
    file: "scenarios/date-only-shift-full-flow.test.ts",
    project: "desktop-chromium",
    titles: ["日付単位シフトを完了する"],
  },
  {
    file: "scenarios/first-shift-delivery.test.ts",
    project: "desktop-chromium",
    titles: ["初回シフトを届ける"],
  },
  {
    file: "scenarios/legal-consent-flow.test.ts",
    project: "desktop-chromium",
    titles: ["法務同意を完了する"],
  },
  {
    file: "scenarios/line-link-token-flow.test.ts",
    project: "desktop-chromium",
    titles: ["LINE連携を完了する"],
  },
  {
    file: "scenarios/notification-confirmation-view-flow.test.ts",
    project: "desktop-chromium",
    titles: ["確定通知から閲覧する"],
  },
  {
    file: "scenarios/notification-failure-recovery.test.ts",
    project: "desktop-chromium",
    titles: ["通知失敗から復旧する"],
  },
  {
    file: "scenarios/notification-release-matrix.test.ts",
    project: "desktop-chromium",
    titles: [
      "[REG-P0-03] 管理者向け登録・確定・稼働促進・不達digestをメールで受け付ける",
      "[REG-P0-03] LINE連携済み管理者へ4種digestを受け付ける",
    ],
  },
  {
    file: "scenarios/notification-reminder-flow.test.ts",
    project: "desktop-chromium",
    titles: ["リマインド通知を受け付ける"],
  },
  {
    file: "scenarios/notification-submit-flow.test.ts",
    project: "desktop-chromium",
    titles: ["提出通知を受け付ける"],
  },
  {
    file: "scenarios/multiActor/manager-invitation-collaboration.test.ts",
    project: "multi-actor-chromium",
    titles: ["[MM-P0-01][REG-P0-03] Cの本人不一致後にBが共同管理し、代表digestを受け取る"],
  },
  {
    file: "scenarios/multiActor/manager-role-removal.test.ts",
    project: "multi-actor-chromium",
    titles: ["[MM-P0-02] 管理者権限を削除する"],
  },
  {
    file: "scenarios/multiActor/organization-deletion-flow.test.ts",
    project: "multi-actor-chromium",
    titles: ["[OD-P0-01] 複数actorで組織を削除する"],
  },
  {
    file: "scenarios/multiActor/organization-person-removal.test.ts",
    project: "multi-actor-chromium",
    titles: ["[MM-P0-03] 組織からユーザーを削除する"],
  },
  {
    file: "scenarios/multiActor/free-manager-exchange.test.ts",
    project: "multi-actor-chromium",
    titles: ["[MM-P0-04] 無料管理者を交代する"],
  },
  {
    file: "scenarios/multiActor/multiple-organization-switching.test.ts",
    project: "multi-actor-chromium",
    titles: ["[MG-P0-01] 複数組織を切り替える"],
  },
  {
    file: "scenarios/open-recruitment-added-staff-notification.test.ts",
    project: "desktop-chromium",
    titles: ["[MS-P0-02] 募集中に追加したスタッフへ通知する"],
  },
  {
    file: "scenarios/organization-deletion-flow.test.ts",
    project: "desktop-chromium",
    titles: ["[OD-P0-02] 組織削除を完了する", "[OD-P0-03] 支払い継続中の組織削除を防ぐ"],
  },
  {
    file: "scenarios/organization-billing-plan-change.test.ts",
    project: "desktop-chromium",
    titles: ["[BILL-P0-02] 支払い不要Businessを保ち、BusinessからProへの変更後の超過を人物削除で復旧する"],
  },
  {
    file: "scenarios/organization-shop-lifecycle.test.ts",
    project: "desktop-chromium",
    titles: ["[MS-P0-01] 組織と店舗のライフサイクルを確認する"],
  },
  {
    file: "scenarios/recruitment-deletion.test.ts",
    project: "desktop-chromium",
    titles: ["募集を削除する"],
  },
  {
    file: "scenarios/release-support-accessibility.test.ts",
    project: "desktop-chromium",
    titles: ["アクセシビリティを確認する"],
  },
  {
    file: "scenarios/release-support-auth-onboarding.test.ts",
    project: "desktop-chromium",
    titles: ["認証オンボーディングを確認する"],
  },
  {
    file: "scenarios/release-support-feature-request.test.ts",
    project: "desktop-chromium",
    titles: ["機能要望を送る"],
  },
  {
    file: "scenarios/release-support-public-contact.test.ts",
    project: "desktop-chromium",
    titles: ["公開問い合わせを確認する"],
  },
  {
    file: "scenarios/release-support-staff-submit.mobile.test.ts",
    project: "mobile-chrome",
    titles: ["モバイルでシフトを提出する"],
  },
  {
    file: "scenarios/shop-settings-submission-pattern-flow.test.ts",
    project: "desktop-chromium",
    titles: ["[REG-P0-01] 店舗の提出方式を変更する"],
  },
  {
    file: "scenarios/shop-deletion-flow.test.ts",
    project: "desktop-chromium",
    titles: ["[MS-P0-03] 店舗削除を完了する"],
  },
  {
    file: "scenarios/staff-after-confirmed-shift.test.ts",
    project: "desktop-chromium",
    titles: ["確定後のスタッフ導線を確認する"],
  },
  {
    file: "scenarios/staff-registration-review.test.ts",
    project: "desktop-chromium",
    titles: ["[REG-P0-02] スタッフ登録を審査する"],
  },
  {
    file: "scenarios/staff-shift-submission.test.ts",
    project: "desktop-chromium",
    titles: ["スタッフがシフトを提出する"],
  },
  {
    file: "scenarios/staff-shift-target-impact.test.ts",
    project: "desktop-chromium",
    titles: ["スタッフ対象変更の影響を確認する"],
  },
  {
    file: "scenarios/trial-ending-notice.test.ts",
    project: "desktop-chromium",
    titles: ["[BILL-P0-01] トライアル終了前の支払い案内を確認する"],
  },
  {
    file: "scenarios/user-shop-membership-flow.test.ts",
    project: "desktop-chromium",
    titles: ["[MS-P0-04] ユーザーの店舗所属を管理する"],
  },
] as const satisfies readonly ScenarioFixture[];

function createValidReport(): SyntheticReport {
  let regularUserIndex = 0;
  let actorPoolIndex = 0;

  const createTest = (projectName: ProjectName): SyntheticTest => {
    const timing = PROJECT_TIMINGS[projectName];
    const annotations: SyntheticAnnotation[] = [];
    if (projectName === "desktop-chromium" || projectName === "mobile-chrome") {
      annotations.push({ type: "e2e-user-index", description: String(regularUserIndex % 6) });
      regularUserIndex += 1;
    }
    if (projectName === "multi-actor-chromium") {
      annotations.push({ type: "e2e-actor-pool", description: String(actorPoolIndex % 2) });
      actorPoolIndex += 1;
    }

    return {
      expectedStatus: "passed",
      projectName,
      results: [
        {
          status: "passed",
          retry: 0,
          startTime: new Date(BASE_TIME_MS + timing.startOffsetMs).toISOString(),
          duration: timing.durationMs,
          annotations,
        },
      ],
    };
  };

  const setupSuite: SyntheticSuite = {
    title: "fixtures/auth.setup.ts",
    file: "fixtures/auth.setup.ts",
    specs: Array.from({ length: 6 }, (_, index) => ({
      title: `E2Eユーザー${index}を認証する`,
      tests: [createTest("setup")],
    })),
  };
  const scenarioSuites: SyntheticSuite[] = SCENARIO_FIXTURES.map(({ file, project, titles }) => ({
    title: file,
    file,
    specs: titles.map((title) => ({ title, tests: [createTest(project)] })),
  }));
  const desktopSuite = scenarioSuites.find(({ file }) => file === "scenarios/auth-pages.test.ts");
  if (!desktopSuite) throw new Error("Synthetic desktop suite is missing");

  const desktopTestCount = scenarioSuites
    .flatMap(({ specs }) => specs)
    .flatMap(({ tests }) => tests)
    .filter(({ projectName }) => projectName === "desktop-chromium").length;
  for (let index = desktopTestCount; index < 66; index += 1) {
    desktopSuite.specs.push({
      title: `Desktop補完シナリオ${index}`,
      tests: [createTest("desktop-chromium")],
    });
  }

  return { errors: [], suites: [setupSuite, ...scenarioSuites] };
}

function getProjectResults(report: SyntheticReport, projectName: ProjectName): SyntheticResult[] {
  return report.suites
    .flatMap(({ specs }) => specs)
    .flatMap(({ tests }) => tests)
    .filter((test) => test.projectName === projectName)
    .flatMap(({ results }) => results);
}

function getFirstProjectResult(report: SyntheticReport, projectName: ProjectName): SyntheticResult {
  const result = getProjectResults(report, projectName)[0];
  if (!result) throw new Error(`Synthetic ${projectName} result is missing`);
  return result;
}

function replaceAnnotationValue(
  report: SyntheticReport,
  projectNames: readonly ProjectName[],
  type: string,
  from: string,
  to: string,
) {
  for (const projectName of projectNames) {
    for (const result of getProjectResults(report, projectName)) {
      for (const annotation of result.annotations) {
        if (annotation.type === type && annotation.description === from) annotation.description = to;
      }
    }
  }
}

function runGate(report: SyntheticReport) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "release-result-gate-"));
  const reportPath = path.join(temporaryDirectory, "report.json");
  try {
    writeFileSync(reportPath, JSON.stringify(report));
    return spawnSync(process.execPath, [GATE_SCRIPT_PATH, reportPath], { encoding: "utf8" });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("assertPlaywrightReleaseResults", () => {
  it("全project・全user index・全actor poolを満たす結果を受理してwall spanを出力する", () => {
    const result = runGate(createValidReport());

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Release E2E result gate passed: 79 tests");
    expect(result.stdout).toContain(
      "35 required suites, 17 required P0 contracts across 19 suite/project/spec bindings",
    );
    expect(result.stdout).toContain(
      "Observed wall span: total=9.0s; setup=1.0s, multi-actor-chromium=2.0s, desktop-chromium=4.0s, mobile-chrome=1.0s.",
    );
  });

  it("必須user index annotationの欠落を拒否する", () => {
    const report = createValidReport();
    getFirstProjectResult(report, "desktop-chromium").annotations = [];

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release E2E has invalid worker annotations");
    expect(result.stderr).toContain("requires exactly one e2e-user-index annotation");
  });

  it.each([
    ["user index", "desktop-chromium", "e2e-user-index", "6"],
    ["actor pool", "multi-actor-chromium", "e2e-actor-pool", "2"],
  ] as const)("範囲外の%s annotationを拒否する", (_label, projectName, type, description) => {
    const report = createValidReport();
    getFirstProjectResult(report, projectName).annotations = [{ type, description }];

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${type} is outside the allowed range`);
  });

  it("有効範囲内でも全user indexが使われていない結果を拒否する", () => {
    const report = createValidReport();
    replaceAnnotationValue(report, ["desktop-chromium", "mobile-chrome"], "e2e-user-index", "5", "4");

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release E2E is missing e2e-user-index values: 5");
  });

  it("有効範囲内でも両方のactor poolが使われていない結果を拒否する", () => {
    const report = createValidReport();
    replaceAnnotationValue(report, ["multi-actor-chromium"], "e2e-actor-pool", "1", "0");

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release E2E is missing e2e-actor-pool values: 1");
  });

  it("必須projectの最小件数を満たさない結果を拒否する", () => {
    const report = createValidReport();
    report.suites[0].specs.pop();

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("setup: 5/6");
  });

  it("必須suiteが欠落した結果を拒否する", () => {
    const report = createValidReport();
    const suite = report.suites.find(({ file }) => file === "scenarios/dashboard-pagination.test.ts");
    if (!suite) throw new Error("Synthetic required suite is missing");
    suite.file = "scenarios/not-required.test.ts";

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("scenarios/dashboard-pagination.test.ts");
  });

  it("必須P0 bindingが欠落した結果を拒否する", () => {
    const report = createValidReport();
    const suite = report.suites.find(({ file }) => file === "scenarios/shop-settings-submission-pattern-flow.test.ts");
    if (!suite) throw new Error("Synthetic P0 suite is missing");
    suite.specs[0].title = "店舗の提出方式を変更する";

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REG-P0-01");
  });

  it("wall spanの時刻情報が不正な結果を拒否する", () => {
    const report = createValidReport();
    getFirstProjectResult(report, "desktop-chromium").startTime = "invalid";

    const result = runGate(report);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release E2E has invalid result timing");
  });
});
