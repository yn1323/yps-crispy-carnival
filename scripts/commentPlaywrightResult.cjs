const fs = require("node:fs");

const escapeMarkdown = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");

const collectResults = (suites, summary) => {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === "expected") summary.passed += 1;
        else if (test.status === "unexpected" || test.status === "flaky") {
          summary.failed += 1;
          summary.failedTests.push(escapeMarkdown(spec.title.replace(/[\r\n]+/g, " ")));
        } else if (test.status === "skipped") summary.skipped += 1;
      }
    }
    collectResults(suite.suites, summary);
  }
};

module.exports = async ({ github, context, core }) => {
  const marker = "<!-- shiftori-playwright-report:v1 -->";
  const summary = { passed: 0, failed: 0, skipped: 0, failedTests: [] };
  let hasResults = false;

  try {
    const report = JSON.parse(fs.readFileSync("playwright-public-input/test-results.json", "utf8"));
    collectResults(report.suites, summary);
    hasResults = true;
  } catch {
    core.warning("Sanitized Playwright result JSON could not be read.");
  }

  const value = (count) => (hasResults ? String(count) : "unknown");
  const reportUrl = `https://yn1323.github.io/hosting-pages/${process.env.REPORT_DIR}/pr-${context.issue.number}/`;
  const reportLink =
    process.env.REPORT_PUBLISHED === "success"
      ? `[Playwrightレポートを見る](${reportUrl}?v=${context.runId}-${context.runAttempt})`
      : `[hosting-pagesの予定URLを開く（今回未公開の場合あり）](${reportUrl})`;
  const failedList = summary.failedTests.length
    ? ["", "### 失敗したテスト", ...summary.failedTests.slice(0, 20).map((title) => `- ${title}`)]
    : [];
  const body = [
    marker,
    "## Playwright Test Report",
    "",
    `Status: ${process.env.TEST_RESULT === "success" ? "Passed" : "Failed"}`,
    `Results: Passed ${value(summary.passed)} / Failed ${value(summary.failed)} / Skipped ${value(summary.skipped)}`,
    "",
    `Report: ${reportLink}`,
    `Actions: [実行ログを見る](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`,
    ...failedList,
  ].join("\n");
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    per_page: 100,
  });
  const existing = comments.find(
    (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
  );

  if (existing) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body,
    });
  }
};
