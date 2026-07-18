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

const requiredProjectMinimums = new Map([
  ["setup", 3],
  ["multi-actor-chromium", 5],
  ["desktop-chromium", 63],
  ["mobile-chrome", 1],
]);
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
];
const requiredContractCoverage = [
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
  { id: "MS-P0-01", file: "scenarios/organization-shop-lifecycle.test.ts", project: "desktop-chromium" },
  {
    id: "MS-P0-02",
    file: "scenarios/open-recruitment-added-staff-notification.test.ts",
    project: "desktop-chromium",
  },
  { id: "MS-P0-03", file: "scenarios/shop-deletion-flow.test.ts", project: "desktop-chromium" },
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
        const contractIds = new Set(specTitle.match(/\b(?:MM|MG|MS|OD|REG)-P0-\d+\b/g) ?? []);
        observedContractLocations.push({ contractIds, file: suiteFile, project: test.projectName, title: specTitle });
      }
      const title = [...path, specTitle].join(" > ");
      if (test.expectedStatus !== "passed") unexpectedExpectedStatuses.push(`${title}: ${test.expectedStatus}`);
      if (test.expectedStatus === "skipped" || test.status === "skipped") skipped.push(title);

      const results = test.results ?? [];
      const finalResult = results.at(-1);
      if (!finalResult) {
        failed.push(`${title}: result is missing`);
      } else if (finalResult.status !== "passed") {
        failed.push(`${title}: ${finalResult.status ?? "missing status"}`);
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

console.log(
  `Release E2E result gate passed: ${testCount} tests, ${requiredScenarioSuites.length} required suites, ${requiredContractIds.size} required P0 contracts across ${requiredContractCoverage.length} suite/project/spec bindings, 0 skipped, 0 flaky.`,
);
