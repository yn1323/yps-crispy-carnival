import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_SUITE_DEPTH = 25;
const MAX_SUITES = 10_000;
const MAX_SPECS = 10_000;
const MAX_TESTS = 5_000;
const MAX_RESULTS = 25_000;
const MAX_RESULT_DURATION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETRIES = 20;
const TEST_OUTCOMES = new Set(["expected", "unexpected", "flaky", "skipped"]);
const EMAIL_PATTERN = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

function usage() {
  return "Usage: node scripts/buildPlaywrightPublicInput.mjs --input <playwright-json> --output <public-json>";
}

function parseArguments(argv) {
  if (argv.length !== 4) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!["--input", "--output"].includes(option) || !value || values.has(option)) throw new Error(usage());
    values.set(option, value);
  }
  if (!values.has("--input") || !values.has("--output")) throw new Error(usage());
  return { input: values.get("--input"), output: values.get("--output") };
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
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  const characters = [...normalized];
  return characters.length <= maxLength ? normalized : `${characters.slice(0, maxLength - 1).join("")}…`;
}

function projectResult(result, counters) {
  if (!isRecord(result)) throw new Error("Playwright JSON contains an invalid test attempt.");
  if (
    typeof result.duration !== "number" ||
    !Number.isFinite(result.duration) ||
    result.duration < 0 ||
    result.duration > MAX_RESULT_DURATION_MS
  ) {
    throw new Error("Playwright JSON contains an invalid test duration.");
  }
  if (!Number.isInteger(result.retry) || result.retry < 0 || result.retry > MAX_RETRIES) {
    throw new Error("Playwright JSON contains an invalid retry count.");
  }
  counters.results += 1;
  if (counters.results > MAX_RESULTS) throw new Error("Playwright JSON exceeds the supported result count.");
  return { duration: Math.round(result.duration), retry: result.retry };
}

function projectTest(test, counters) {
  if (!isRecord(test) || !Array.isArray(test.results) || !TEST_OUTCOMES.has(test.status)) {
    throw new Error("Playwright JSON contains an invalid test result.");
  }
  counters.tests += 1;
  if (counters.tests > MAX_TESTS) throw new Error("Playwright JSON exceeds the supported test count.");
  return {
    projectName: sanitizeText(test.projectName, "default", 100),
    status: test.status,
    results: test.results.map((result) => projectResult(result, counters)),
  };
}

function projectSpec(spec, counters) {
  if (!isRecord(spec) || !Array.isArray(spec.tests)) {
    throw new Error("Playwright JSON contains an invalid spec.");
  }
  counters.specs += 1;
  if (counters.specs > MAX_SPECS) throw new Error("Playwright JSON exceeds the supported spec count.");
  return {
    title: sanitizeText(spec.title, "Untitled test", 300),
    tests: spec.tests.map((test) => projectTest(test, counters)),
  };
}

function projectSuite(suite, depth, counters) {
  if (!isRecord(suite) || !Array.isArray(suite.specs)) {
    throw new Error("Playwright JSON contains an invalid suite.");
  }
  if (depth > MAX_SUITE_DEPTH) throw new Error("Playwright JSON suite nesting is too deep.");
  counters.suites += 1;
  if (counters.suites > MAX_SUITES) throw new Error("Playwright JSON exceeds the supported suite count.");
  const childSuites = suite.suites ?? [];
  if (!Array.isArray(childSuites)) throw new Error("Playwright JSON contains an invalid child suite list.");
  return {
    title: sanitizeText(suite.title, "", 200),
    specs: suite.specs.map((spec) => projectSpec(spec, counters)),
    suites: childSuites.map((childSuite) => projectSuite(childSuite, depth + 1, counters)),
  };
}

function projectReport(report) {
  if (!isRecord(report) || !Array.isArray(report.suites)) {
    throw new Error("Playwright JSON must contain a suites array.");
  }
  const counters = { suites: 0, specs: 0, tests: 0, results: 0 };
  return { suites: report.suites.map((suite) => projectSuite(suite, 1, counters)) };
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026")}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const inputStat = await lstat(inputPath);
  if (!inputStat.isFile() || inputStat.isSymbolicLink()) {
    throw new Error("Playwright JSON input must be a regular file, not a symbolic link.");
  }
  if (inputStat.size > MAX_INPUT_BYTES) throw new Error("Playwright JSON input exceeds the size limit.");

  let rawReport;
  try {
    rawReport = JSON.parse(await readFile(inputPath, "utf8"));
  } catch {
    throw new Error("Playwright JSON could not be read or parsed.");
  }
  const output = stringifyJson(projectReport(rawReport));
  if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) throw new Error("Public Playwright input exceeds the size limit.");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, { encoding: "utf8", mode: 0o644, flag: "wx" });
  console.log("Public Playwright input generated from allowlisted result fields.");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public Playwright input generation failed.");
  process.exit(1);
}
