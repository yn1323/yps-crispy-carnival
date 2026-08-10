import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_WORKFLOW_PATHS = [".github/workflows/playwright.yml", ".github/workflows/vrt.yml"] as const;

describe("report deployment workflows", () => {
  it.each(REPORT_WORKFLOW_PATHS)("%s はhosting-pagesの同時更新を有限回retryする", (relativePath) => {
    const workflow = readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8");

    expect(workflow).toContain("for attempt in 1 2 3 4 5; do");
    expect(workflow).toContain("git pull --rebase origin main");
    expect(workflow).toContain("if git push origin HEAD:main; then");
    expect(workflow).toContain(`if [ "\${attempt}" -eq 5 ]; then`);
    expect(workflow).toContain('sleep "$((attempt * 2))"');
    expect(workflow).not.toContain("git push --force");
  });
});
