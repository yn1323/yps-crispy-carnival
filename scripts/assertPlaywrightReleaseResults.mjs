import { readFileSync } from "node:fs";

const reportPath = process.argv[2] ?? "test-results.json";
const report = JSON.parse(readFileSync(reportPath, "utf-8"));
if ((report.errors ?? []).length > 0) {
  throw new Error(`Playwright report contains ${report.errors.length} top-level error(s): ${reportPath}`);
}
const skipped = [];
const flaky = [];
const failed = [];
const unexpectedExpectedStatuses = [];
let testCount = 0;
const projectCounts = new Map();
const observedSuiteFiles = new Set();
const observedContractLocations = [];
const annotationErrors = [];
const timingErrors = [];
const observedE2EUserIndexes = new Set();
const observedE2EActorPools = new Set();
const projectWallSpans = new Map();

const requiredProjectMinimums = new Map([
  ["setup", 6],
  ["multi-actor-chromium", 6],
  ["desktop-chromium", 67],
  ["mobile-chrome", 1],
]);
const requiredE2EUserIndexes = new Set([0, 1, 2, 3, 4, 5]);
const requiredE2EActorPools = new Set([0, 1]);
const projectsUsingE2EUserIndexes = new Set(["desktop-chromium", "mobile-chrome"]);
const requiredScenarioSuites = [
  "scenarios/auth-pages.test.ts",
  "scenarios/dashboard-pagination.test.ts",
  "scenarios/date-only-shift-full-flow.test.ts",
  "scenarios/first-shift-delivery.test.ts",
  "scenarios/legal-consent-flow.test.ts",
  "scenarios/line-link-token-flow.test.ts",
  "scenarios/notification-confirmation-view-flow.test.ts",
  "scenarios/notification-failure-recovery.test.ts",
  "scenarios/notification-release-matrix.test.ts",
  "scenarios/notification-reminder-flow.test.ts",
  "scenarios/notification-submit-flow.test.ts",
  "scenarios/multiActor/manager-invitation-collaboration.test.ts",
  "scenarios/multiActor/manager-role-removal.test.ts",
  "scenarios/multiActor/organization-deletion-flow.test.ts",
  "scenarios/multiActor/organization-person-removal.test.ts",
  "scenarios/multiActor/free-manager-exchange.test.ts",
  "scenarios/multiActor/multiple-organization-switching.test.ts",
  "scenarios/open-recruitment-added-staff-notification.test.ts",
  "scenarios/organization-deletion-flow.test.ts",
  "scenarios/organization-shop-lifecycle.test.ts",
  "scenarios/recruitment-deletion.test.ts",
  "scenarios/release-support-accessibility.test.ts",
  "scenarios/release-support-auth-onboarding.test.ts",
  "scenarios/release-support-feature-request.test.ts",
  "scenarios/release-support-public-contact.test.ts",
  "scenarios/release-support-staff-submit.mobile.test.ts",
  "scenarios/shop-settings-submission-pattern-flow.test.ts",
  "scenarios/shop-deletion-flow.test.ts",
  "scenarios/staff-after-confirmed-shift.test.ts",
  "scenarios/staff-registration-review.test.ts",
  "scenarios/staff-shift-submission.test.ts",
  "scenarios/staff-shift-target-impact.test.ts",
  "scenarios/trial-ending-notice.test.ts",
  "scenarios/user-shop-membership-flow.test.ts",
];
const requiredContractCoverage = [
  {
    id: "BILL-P0-01",
    file: "scenarios/trial-ending-notice.test.ts",
    project: "desktop-chromium",
  },
  {
    id: "MM-P0-01",
    file: "scenarios/multiActor/manager-invitation-collaboration.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "MM-P0-02",
    file: "scenarios/multiActor/manager-role-removal.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "MM-P0-03",
    file: "scenarios/multiActor/organization-person-removal.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "MM-P0-04",
    file: "scenarios/multiActor/free-manager-exchange.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "MG-P0-01",
    file: "scenarios/multiActor/multiple-organization-switching.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "OD-P0-01",
    file: "scenarios/multiActor/organization-deletion-flow.test.ts",
    project: "multi-actor-chromium",
  },
  {
    id: "OD-P0-02",
    file: "scenarios/organization-deletion-flow.test.ts",
    project: "desktop-chromium",
  },
  {
    id: "OD-P0-03",
    file: "scenarios/organization-deletion-flow.test.ts",
    project: "desktop-chromium",
  },
  { id: "MS-P0-01", file: "scenarios/organization-shop-lifecycle.test.ts", project: "desktop-chromium" },
  {
    id: "MS-P0-02",
    file: "scenarios/open-recruitment-added-staff-notification.test.ts",
    project: "desktop-chromium",
  },
  { id: "MS-P0-03", file: "scenarios/shop-deletion-flow.test.ts", project: "desktop-chromium" },
  { id: "MS-P0-04", file: "scenarios/user-shop-membership-flow.test.ts", project: "desktop-chromium" },
  {
    id: "REG-P0-01",
    file: "scenarios/shop-settings-submission-pattern-flow.test.ts",
    project: "desktop-chromium",
  },
  { id: "REG-P0-02", file: "scenarios/staff-registration-review.test.ts", project: "desktop-chromium" },
  {
    id: "REG-P0-03",
    file: "scenarios/notification-release-matrix.test.ts",
    project: "desktop-chromium",
    titleIncludes: "管理者向け登録・確定・稼働促進・不達digestをメールで受け付ける",
  },
  {
    id: "REG-P0-03",
    file: "scenarios/notification-release-matrix.test.ts",
    project: "desktop-chromium",
    titleIncludes: "LINE連携済み管理者へ4種digestを受け付ける",
  },
  {
    id: "REG-P0-03",
    file: "scenarios/multiActor/manager-invitation-collaboration.test.ts",
    project: "multi-actor-chromium",
    titleIncludes: "Cの本人不一致後にBが共同管理し、代表digestを受け取る",
  },
];
const requiredContractIds = new Set(requiredContractCoverage.map(({ id }) => id));

function normalizeSuiteFile(file) {
  return file.replaceAll("\\", "/").replace(/^.*\/e2e\//, "");
}

function observeWallSpan(projectName, title, result) {
  const start = Date.parse(result.startTime ?? "");
  const duration = result.duration;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 0) {
    timingErrors.push(`${projectName}: ${title}: result timing is invalid`);
    return;
  }

  const end = start + duration;
  const current = projectWallSpans.get(projectName);
  projectWallSpans.set(projectName, {
    start: Math.min(current?.start ?? start, start),
    end: Math.max(current?.end ?? end, end),
  });
}

function observeRequiredNumericAnnotation({ annotations, projectName, title, type, allowed, observed }) {
  const matches = (annotations ?? []).filter((annotation) => annotation.type === type);
  if (matches.length !== 1) {
    annotationErrors.push(`${projectName}: ${title}: requires exactly one ${type} annotation`);
    return;
  }

  const description = matches[0].description;
  if (typeof description !== "string" || !/^\d+$/.test(description)) {
    annotationErrors.push(`${projectName}: ${title}: ${type} must be a numeric annotation`);
    return;
  }

  const value = Number(description);
  if (!allowed.has(value)) {
    annotationErrors.push(`${projectName}: ${title}: ${type} is outside the allowed range`);
    return;
  }

  observed.add(value);
}

function formatWallSpan(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function inspectSuite(suite, ancestors, inheritedFile) {
  const path = suite.title ? [...ancestors, suite.title] : ancestors;
  const suiteFile = suite.file ? normalizeSuiteFile(suite.file) : inheritedFile;
  if (suiteFile) observedSuiteFiles.add(suiteFile);

  for (const spec of suite.specs ?? []) {
    const specTitle = spec.title ?? "unnamed test";
    for (const test of spec.tests ?? []) {
      testCount += 1;
      projectCounts.set(test.projectName, (projectCounts.get(test.projectName) ?? 0) + 1);
      if (suiteFile) {
        const contractIds = new Set(specTitle.match(/\b(?:BILL|MM|MG|MS|OD|REG)-P0-\d+\b/g) ?? []);
        observedContractLocations.push({ contractIds, file: suiteFile, project: test.projectName, title: specTitle });
      }
      const title = [...path, specTitle].join(" > ");
      if (test.expectedStatus !== "passed") unexpectedExpectedStatuses.push(`${title}: ${test.expectedStatus}`);
      if (test.expectedStatus === "skipped" || test.status === "skipped") skipped.push(title);

      const results = test.results ?? [];
      const finalResult = results.at(-1);
      for (const result of results) observeWallSpan(test.projectName, title, result);
      if (!finalResult) {
        failed.push(`${title}: result is missing`);
      } else if (finalResult.status !== "passed") {
        failed.push(`${title}: ${finalResult.status ?? "missing status"}`);
      }
      if (finalResult && projectsUsingE2EUserIndexes.has(test.projectName)) {
        observeRequiredNumericAnnotation({
          annotations: finalResult.annotations,
          projectName: test.projectName,
          title,
          type: "e2e-user-index",
          allowed: requiredE2EUserIndexes,
          observed: observedE2EUserIndexes,
        });
      }
      if (finalResult && test.projectName === "multi-actor-chromium") {
        observeRequiredNumericAnnotation({
          annotations: finalResult.annotations,
          projectName: test.projectName,
          title,
          type: "e2e-actor-pool",
          allowed: requiredE2EActorPools,
          observed: observedE2EActorPools,
        });
      }
      const failedBeforePassing =
        finalResult?.status === "passed" &&
        results.slice(0, -1).some((result) => ["failed", "timedOut", "interrupted"].includes(result.status ?? ""));
      if (failedBeforePassing || (finalResult?.retry ?? 0) > 0) flaky.push(title);
    }
  }

  for (const child of suite.suites ?? []) inspectSuite(child, path, suiteFile);
}

for (const suite of report.suites ?? []) inspectSuite(suite, [], undefined);

if (testCount === 0) throw new Error(`Playwright report contains no tests: ${reportPath}`);
if (unexpectedExpectedStatuses.length > 0) {
  throw new Error(`Release E2E contains non-passing expected statuses:\n${unexpectedExpectedStatuses.join("\n")}`);
}
if (failed.length > 0) throw new Error(`Release E2E has failed tests:\n${failed.join("\n")}`);
if (skipped.length > 0) throw new Error(`Release E2E has skipped tests:\n${skipped.join("\n")}`);
if (flaky.length > 0) throw new Error(`Release E2E has flaky tests:\n${flaky.join("\n")}`);
if (annotationErrors.length > 0) {
  throw new Error(`Release E2E has invalid worker annotations:\n${annotationErrors.join("\n")}`);
}
if (timingErrors.length > 0) {
  throw new Error(`Release E2E has invalid result timing:\n${timingErrors.join("\n")}`);
}

const unexpectedProjects = [...projectCounts.keys()].filter((project) => !requiredProjectMinimums.has(project));
if (unexpectedProjects.length > 0) {
  throw new Error(`Release E2E contains unsupported projects:\n${unexpectedProjects.join("\n")}`);
}

const missingProjects = [...requiredProjectMinimums].filter(
  ([project, minimum]) => (projectCounts.get(project) ?? 0) < minimum,
);
if (missingProjects.length > 0) {
  throw new Error(
    `Release E2E project coverage is below the required minimum:\n${missingProjects
      .map(([project, minimum]) => `${project}: ${projectCounts.get(project) ?? 0}/${minimum}`)
      .join("\n")}`,
  );
}

const missingE2EUserIndexes = [...requiredE2EUserIndexes].filter((index) => !observedE2EUserIndexes.has(index));
if (missingE2EUserIndexes.length > 0) {
  throw new Error(`Release E2E is missing e2e-user-index values: ${missingE2EUserIndexes.join(", ")}`);
}

const missingE2EActorPools = [...requiredE2EActorPools].filter((index) => !observedE2EActorPools.has(index));
if (missingE2EActorPools.length > 0) {
  throw new Error(`Release E2E is missing e2e-actor-pool values: ${missingE2EActorPools.join(", ")}`);
}

const missingProjectWallSpans = [...requiredProjectMinimums.keys()].filter((project) => !projectWallSpans.has(project));
if (missingProjectWallSpans.length > 0) {
  throw new Error(`Release E2E is missing project wall spans: ${missingProjectWallSpans.join(", ")}`);
}

const missingScenarios = requiredScenarioSuites.filter((required) => !observedSuiteFiles.has(required));
if (missingScenarios.length > 0) {
  throw new Error(`Release E2E is missing required scenario suites:\n${missingScenarios.join("\n")}`);
}

const missingContractCoverage = requiredContractCoverage.filter(
  (required) =>
    !observedContractLocations.some(
      (observed) =>
        observed.contractIds.has(required.id) &&
        observed.file === required.file &&
        observed.project === required.project &&
        (!required.titleIncludes || observed.title.includes(required.titleIncludes)),
    ),
);
if (missingContractCoverage.length > 0) {
  throw new Error(
    `Release E2E is missing required P0 contract coverage:\n${missingContractCoverage
      .map(
        ({ id, file, project, titleIncludes }) =>
          `${id}: ${project} / ${file}${titleIncludes ? ` / title includes: ${titleIncludes}` : ""}`,
      )
      .join("\n")}`,
  );
}

const observedProjectWallSpans = [...requiredProjectMinimums.keys()]
  .map((project) => {
    const span = projectWallSpans.get(project);
    return span ? `${project}=${formatWallSpan(span.end - span.start)}` : undefined;
  })
  .filter(Boolean);
const wallSpans = [...projectWallSpans.values()];
const observedOverallWall =
  wallSpans.length > 0
    ? formatWallSpan(Math.max(...wallSpans.map(({ end }) => end)) - Math.min(...wallSpans.map(({ start }) => start)))
    : "unavailable";

console.log(
  `Release E2E result gate passed: ${testCount} tests, ${requiredScenarioSuites.length} required suites, ${requiredContractIds.size} required P0 contracts across ${requiredContractCoverage.length} suite/project/spec bindings, all 6 user indexes, both actor pools, 0 skipped, 0 flaky. Observed wall span: total=${observedOverallWall}; ${observedProjectWallSpans.join(", ")}.`,
);
