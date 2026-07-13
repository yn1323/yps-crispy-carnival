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

const requiredProjectMinimums = new Map([
  ["setup", 3],
  ["desktop-chromium", 61],
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
  "scenarios/open-recruitment-added-staff-notification.test.ts",
  "scenarios/recruitment-deletion.test.ts",
  "scenarios/release-support-accessibility.test.ts",
  "scenarios/release-support-auth-onboarding.test.ts",
  "scenarios/release-support-feature-request.test.ts",
  "scenarios/release-support-public-contact.test.ts",
  "scenarios/release-support-staff-submit.mobile.test.ts",
  "scenarios/shop-settings-submission-pattern-flow.test.ts",
  "scenarios/staff-after-confirmed-shift.test.ts",
  "scenarios/staff-registration-review.test.ts",
  "scenarios/staff-shift-submission.test.ts",
  "scenarios/staff-shift-target-impact.test.ts",
];

function inspectSuite(suite, ancestors) {
  const path = suite.title ? [...ancestors, suite.title] : ancestors;
  if (suite.file) observedSuiteFiles.add(suite.file.replaceAll("\\", "/").replace(/^.*\/e2e\//, ""));

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      testCount += 1;
      projectCounts.set(test.projectName, (projectCounts.get(test.projectName) ?? 0) + 1);
      const title = [...path, spec.title ?? "unnamed test"].join(" > ");
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

  for (const child of suite.suites ?? []) inspectSuite(child, path);
}

for (const suite of report.suites ?? []) inspectSuite(suite, []);

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

console.log(
  `Release E2E result gate passed: ${testCount} tests, ${requiredScenarioSuites.length} required suites, 0 skipped, 0 flaky.`,
);
