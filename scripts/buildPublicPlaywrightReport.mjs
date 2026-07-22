import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_TESTS = 5_000;
const MAX_SUITE_DEPTH = 25;
const MAX_RESULT_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETRIES = 20;
const TEST_OUTCOMES = new Set(["expected", "unexpected", "flaky", "skipped"]);
const SOURCE_RESULTS = new Set(["success", "failure"]);
const REQUIRED_OPTIONS = [
  "--input",
  "--output",
  "--result",
  "--pull-number",
  "--head-sha",
  "--source-run-id",
  "--source-run-attempt",
  "--actions-url",
  "--preview-url",
];

function usage() {
  return [
    "Usage: node scripts/buildPublicPlaywrightReport.mjs",
    "--input <playwright-json> --output <directory>",
    "--result <success|failure> --pull-number <number> --head-sha <sha>",
    "--source-run-id <number> --source-run-attempt <number>",
    "--actions-url <url> --preview-url <url>",
  ].join(" ");
}

function parseArguments(argv) {
  if (argv.length !== REQUIRED_OPTIONS.length * 2) throw new Error(usage());

  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!REQUIRED_OPTIONS.includes(option) || !value || values.has(option)) {
      throw new Error(usage());
    }
    values.set(option, value);
  }
  if (REQUIRED_OPTIONS.some((option) => !values.has(option))) throw new Error(usage());
  return Object.fromEntries(values);
}

function parsePositiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is outside the supported range.`);
  return parsed;
}

function assertHeadSha(value) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("Head SHA must be a full lowercase Git commit SHA.");
  }
  return value;
}

function assertActionsUrl(value, sourceRunId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Actions URL is invalid.");
  }
  const expectedPath = `/yn1323/yps-crispy-carnival/actions/runs/${sourceRunId}`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error("Actions URL must identify the declared run in the expected GitHub repository.");
  }
  return url.href;
}

function assertPreviewUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Preview URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".dev-yps-crispy-carnival.pages.dev") ||
    url.hostname === "dev-yps-crispy-carnival.pages.dev" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Preview URL must be a root deployment URL for the development Cloudflare Pages project.");
  }
  return url.href;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const normalized = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  const characters = [...normalized];
  return characters.length <= maxLength ? normalized : `${characters.slice(0, maxLength - 1).join("")}…`;
}

function readTestResult(test, title) {
  if (!isRecord(test) || !Array.isArray(test.results) || !TEST_OUTCOMES.has(test.status)) {
    throw new Error("Playwright JSON contains an invalid test result.");
  }

  let durationMs = 0;
  let retries = 0;
  for (const result of test.results) {
    if (!isRecord(result)) throw new Error("Playwright JSON contains an invalid test attempt.");
    const duration = result.duration;
    const retry = result.retry;
    if (
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > MAX_RESULT_DURATION_MS
    ) {
      throw new Error("Playwright JSON contains an invalid test duration.");
    }
    if (!Number.isInteger(retry) || retry < 0 || retry > MAX_RETRIES) {
      throw new Error("Playwright JSON contains an invalid retry count.");
    }
    durationMs += Math.round(duration);
    retries = Math.max(retries, retry);
  }

  return {
    title,
    project: sanitizeText(test.projectName, "default", 100),
    status: test.status,
    durationMs,
    retries,
  };
}

function extractTests(report) {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Playwright JSON must contain a suites array.");
  }

  const tests = [];
  const pending = [];
  for (let index = report.suites.length - 1; index >= 0; index -= 1) {
    pending.push({ suite: report.suites[index], parentTitles: [], depth: 1 });
  }
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item || !isRecord(item.suite) || !Array.isArray(item.suite.specs)) {
      throw new Error("Playwright JSON contains an invalid suite.");
    }
    if (item.depth > MAX_SUITE_DEPTH) throw new Error("Playwright JSON suite nesting is too deep.");

    const suiteTitle = sanitizeText(item.suite.title, "", 200);
    const titlePath = suiteTitle ? [...item.parentTitles, suiteTitle] : item.parentTitles;
    const childSuites = item.suite.suites ?? [];
    if (!Array.isArray(childSuites)) throw new Error("Playwright JSON contains an invalid child suite list.");
    for (let index = childSuites.length - 1; index >= 0; index -= 1) {
      pending.push({ suite: childSuites[index], parentTitles: titlePath, depth: item.depth + 1 });
    }

    for (const spec of item.suite.specs) {
      if (!isRecord(spec) || !Array.isArray(spec.tests)) {
        throw new Error("Playwright JSON contains an invalid spec.");
      }
      const specTitle = sanitizeText(spec.title, "Untitled test", 300);
      const title = sanitizeText([...titlePath, specTitle].join(" › "), "Untitled test", 500);
      for (const test of spec.tests) {
        tests.push(readTestResult(test, title));
        if (tests.length > MAX_TESTS) throw new Error("Playwright JSON exceeds the supported test count.");
      }
    }
  }
  return tests;
}

function summarize(tests) {
  const summary = { total: tests.length, passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 };
  for (const test of tests) {
    if (test.status === "expected") summary.passed += 1;
    else if (test.status === "unexpected") summary.failed += 1;
    else if (test.status === "flaky") summary.flaky += 1;
    else summary.skipped += 1;
    summary.durationMs += test.durationMs;
  }
  return summary;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDuration(durationMs) {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(1)} s`;
}

function statusLabel(status) {
  return {
    expected: "Passed",
    unexpected: "Failed",
    flaky: "Flaky",
    skipped: "Skipped",
  }[status];
}

function renderHtml(report) {
  const overallLabel = report.result === "success" ? "Passed" : "Failed";
  const rows = report.tests
    .map(
      (test) => `
        <tr>
          <td>${escapeHtml(test.title)}</td>
          <td>${escapeHtml(test.project)}</td>
          <td><span class="test-status test-status-${escapeHtml(test.status)}">${statusLabel(test.status)}</span></td>
          <td>${escapeHtml(formatDuration(test.durationMs))}</td>
          <td>${test.retries}</td>
        </tr>`,
    )
    .join("");
  const tableBody = rows || '<tr><td colspan="5">No test results were recorded.</td></tr>';

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>PR #${report.pullRequest.number} E2E Report</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; line-height: 1.5; }
    header { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
    h1 { margin: 0; font-size: 1.6rem; }
    .overall { border-radius: 999px; padding: 6px 12px; font-weight: 700; }
    .overall-success, .test-status-expected { background: #dcfce7; color: #166534; }
    .overall-failure, .test-status-unexpected { background: #fee2e2; color: #991b1b; }
    .test-status-flaky { background: #fef3c7; color: #92400e; }
    .test-status-skipped { background: #e5e7eb; color: #374151; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 24px 0; }
    .summary div { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; }
    .summary strong { display: block; font-size: 1.3rem; }
    .links { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0 24px; }
    a { color: #2563eb; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #9ca3af; padding: 10px; text-align: left; vertical-align: top; }
    .test-status { display: inline-block; border-radius: 999px; padding: 2px 8px; font-weight: 700; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <h1>PR #${report.pullRequest.number} E2E Report</h1>
    <span class="overall overall-${report.result}">${overallLabel}</span>
  </header>
  <p>Head SHA: <code>${report.pullRequest.headSha}</code> / Publisher run: ${report.source.runId} (attempt ${report.source.runAttempt})</p>
  <div class="summary">
    <div><strong>${report.summary.total}</strong>Total</div>
    <div><strong>${report.summary.passed}</strong>Passed</div>
    <div><strong>${report.summary.failed}</strong>Failed</div>
    <div><strong>${report.summary.flaky}</strong>Flaky</div>
    <div><strong>${report.summary.skipped}</strong>Skipped</div>
    <div><strong>${escapeHtml(formatDuration(report.summary.durationMs))}</strong>Duration</div>
  </div>
  <nav class="links" aria-label="Report links">
    <a href="${escapeHtml(report.previewUrl)}" target="_blank" rel="noreferrer noopener">Preview environment</a>
    <a href="${escapeHtml(report.source.actionsUrl)}" target="_blank" rel="noreferrer noopener">GitHub Actions</a>
  </nav>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Test</th><th>Project</th><th>Status</th><th>Duration</th><th>Retries</th></tr></thead>
      <tbody>${tableBody}
      </tbody>
    </table>
  </div>
</body>
</html>
`;
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026")}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!SOURCE_RESULTS.has(options["--result"])) throw new Error("Result must be success or failure.");

  const pullNumber = parsePositiveInteger(options["--pull-number"], "Pull request number");
  const sourceRunId = parsePositiveInteger(options["--source-run-id"], "Source run ID");
  const sourceRunAttempt = parsePositiveInteger(options["--source-run-attempt"], "Source run attempt");
  const headSha = assertHeadSha(options["--head-sha"]);
  const actionsUrl = assertActionsUrl(options["--actions-url"], sourceRunId);
  const previewUrl = assertPreviewUrl(options["--preview-url"]);

  let rawReport;
  try {
    rawReport = JSON.parse(await readFile(path.resolve(options["--input"]), "utf8"));
  } catch {
    throw new Error("Playwright JSON could not be read or parsed.");
  }
  const tests = extractTests(rawReport);
  if (options["--result"] === "success" && (tests.length === 0 || tests.some((test) => test.status !== "expected"))) {
    throw new Error("A successful Playwright run must contain at least one passed test and no non-passing tests.");
  }
  const report = {
    schemaVersion: 1,
    result: options["--result"],
    pullRequest: { number: pullNumber, headSha },
    source: { runId: sourceRunId, runAttempt: sourceRunAttempt, actionsUrl },
    previewUrl,
    summary: summarize(tests),
    tests,
  };

  const outputDirectory = path.resolve(options["--output"]);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "report.json"), stringifyJson(report), { encoding: "utf8", mode: 0o644 }),
    writeFile(path.join(outputDirectory, "index.html"), renderHtml(report), { encoding: "utf8", mode: 0o644 }),
  ]);
  console.log(`Public Playwright report generated for ${tests.length} tests.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public Playwright report generation failed.");
  process.exit(1);
}
