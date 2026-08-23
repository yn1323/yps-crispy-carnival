import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type WorkflowStep = Record<string, unknown> & { name?: string };
type WorkflowJob = {
  permissions?: Record<string, string>;
  steps: WorkflowStep[];
};
type Workflow = { jobs: Record<string, WorkflowJob> };

function readWorkflow(name: string) {
  return parse(readFileSync(path.join(process.cwd(), ".github", "workflows", name), "utf8")) as Workflow;
}

function step(job: WorkflowJob, name: string) {
  const value = job.steps.find((candidate) => candidate.name === name);
  expect(value, `Workflow step not found: ${name}`).toBeDefined();
  return value as WorkflowStep;
}

const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

describe("hosting report workflow contract", () => {
  it.each([
    {
      workflow: "playwright.yml",
      job: "test",
      comment: "Comment PR while report is deploying",
      wait: "Wait for hosted Playwright report",
      update: "Update PR comment with Playwright report",
      fail: "Fail when Playwright report is unavailable",
    },
    {
      workflow: "vrt.yml",
      job: "compare",
      comment: "Comment PR while VRT report is deploying",
      wait: "Wait for hosted VRT report",
      update: "Update PR comment with VRT report",
      fail: "Fail when VRT report is unavailable",
    },
  ])("$workflow はコメント権限エラーとPages検証を分離する", ({ workflow, job, comment, wait, update, fail }) => {
    const target = readWorkflow(workflow).jobs[job];
    expect(target.permissions?.issues).toBe("write");
    expect(target.permissions?.["pull-requests"]).toBe("write");

    expect(step(target, comment)["continue-on-error"]).toBe(true);
    expect(step(target, update)["continue-on-error"]).toBe(true);

    const waitCondition = String(step(target, wait).if);
    expect(waitCondition).toContain("steps.publish.outputs.status");
    expect(waitCondition).not.toContain("report_comment");

    const failCondition = String(step(target, fail).if);
    expect(failCondition).toContain("steps.publish.outputs.status");
    expect(failCondition).toContain("steps.wait_deploy.outputs.deploy_status != 'success'");
    expect(failCondition).not.toContain("report_comment");
  });

  it("保持Workflowはsource tokenでPRを読みhosting tokenでsnapshotを更新する", () => {
    const target = readWorkflow("maintain-hosted-reports.yml").jobs.prune;
    expect(target.permissions?.contents).toBe("read");
    expect(target.permissions?.["pull-requests"]).toBe("read");

    const checkoutSteps = target.steps.filter(
      (candidate) => candidate.uses === "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803",
    );
    expect(checkoutSteps).toHaveLength(2);
    for (const checkout of checkoutSteps) {
      expect((checkout.with as Record<string, unknown>).repository).toBe("yn1323/hosting-pages");
      expect((checkout.with as Record<string, unknown>).token).toBe(expression("secrets.HOSTING_PAGES_TOKEN"));
    }

    const prune = step(target, "Prune expired reports with compare-and-swap");
    const environment = prune.env as Record<string, unknown>;
    expect(environment.SOURCE_REPOSITORY_TOKEN).toBe(expression("github.token"));
    expect(environment.GIT_AUTH_TOKEN).toBe(expression("secrets.HOSTING_PAGES_TOKEN"));
  });
});
