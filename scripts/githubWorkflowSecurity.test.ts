import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type WorkflowStep = {
  id?: string;
  if?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type WorkflowConcurrency = {
  group?: string;
  "cancel-in-progress"?: boolean;
  queue?: "single" | "max";
};

type Workflow = {
  concurrency?: WorkflowConcurrency;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
};

type WorkflowJob = {
  concurrency?: WorkflowConcurrency;
  if?: string;
  needs?: string | string[];
  environment?: unknown;
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
  "timeout-minutes"?: number;
};

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const RELEASE_WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/release.yml");
const OBSOLETE_VERSION_SYNC_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/sync-release-version-to-develop.yml");
const releaseSource = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
const releaseWorkflow = parse(releaseSource) as Workflow;
const DOLLAR = "$";
const CHECKOUT_ACTION = "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803";
const GITHUB_SCRIPT_ACTION = "actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd";
const UPLOAD_ARTIFACT_ACTION = "actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f";

function githubExpression(expression: string): string {
  return `${DOLLAR}{{ ${expression} }}`;
}

function interpolation(expression: string): string {
  return `${DOLLAR}{${expression}}`;
}

function readWorkflow(filename: string): { source: string; workflow: Workflow } {
  const source = readFileSync(path.join(REPOSITORY_ROOT, ".github/workflows", filename), "utf8");
  return { source, workflow: parse(source) as Workflow };
}

function getJob(workflow: Workflow, name: string): WorkflowJob {
  const job = workflow.jobs?.[name];
  if (!job) throw new Error(`workflow job not found: ${name}`);
  return job;
}

function getSteps(job: WorkflowJob): WorkflowStep[] {
  if (!job.steps) throw new Error("workflow job must define steps");
  return job.steps;
}

function getReleaseSteps(): WorkflowStep[] {
  const steps = releaseWorkflow.jobs?.release?.steps;
  if (!steps) throw new Error("release workflow must define jobs.release.steps");
  return steps;
}

function findStep(steps: WorkflowStep[], name: string): WorkflowStep {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`release workflow step not found: ${name}`);
  return step;
}

function getGithubScript(step: WorkflowStep): string {
  const script = step.with?.script;
  if (typeof script !== "string") throw new Error(`github-script source is missing: ${step.name ?? "unnamed step"}`);
  return script;
}

type PublisherSourceGateScenario = {
  workflowFilename: string;
  stepName: string;
  env: Record<string, string>;
  workflowRun: Record<string, unknown>;
  liveWorkflowRun?: Record<string, unknown>;
  sourceRuns?: Array<Record<string, unknown>>;
  pullRequest?: Record<string, unknown>;
  branch?: Record<string, unknown>;
  artifacts?: Array<{ expired: boolean; name: string; size_in_bytes: number }>;
};

async function executePublisherSourceGate(scenario: PublisherSourceGateScenario) {
  const { workflow } = readWorkflow(scenario.workflowFilename);
  const gate = findStep(getSteps(getJob(workflow, "publish")), scenario.stepName);
  const failures: string[] = [];
  const listWorkflowRunArtifacts = vi.fn();
  const listWorkflowRunsForWorkflow = vi.fn();
  const github = {
    paginate: vi.fn(async (endpoint: unknown) => {
      if (endpoint === listWorkflowRunArtifacts) return scenario.artifacts ?? [];
      if (endpoint === listWorkflowRunsForWorkflow) {
        return scenario.sourceRuns ?? [scenario.liveWorkflowRun ?? scenario.workflowRun];
      }
      throw new Error("unexpected paginate endpoint");
    }),
    rest: {
      actions: {
        getWorkflowRun: vi.fn(async () => ({ data: scenario.liveWorkflowRun ?? scenario.workflowRun })),
        listWorkflowRunArtifacts,
        listWorkflowRunsForWorkflow,
      },
      pulls: {
        get: vi.fn(async () => ({ data: scenario.pullRequest ?? {} })),
      },
      repos: {
        getBranch: vi.fn(async () => ({ data: scenario.branch ?? {} })),
      },
    },
  };
  const context = {
    payload: { workflow_run: scenario.workflowRun },
    repo: { owner: "example", repo: "shiftori" },
  };
  const core = {
    setFailed: vi.fn((message: string) => failures.push(message)),
  };

  for (const [name, value] of Object.entries(scenario.env)) vi.stubEnv(name, value);
  try {
    const execute = new Function("github", "context", "core", `return (async () => {${getGithubScript(gate)}\n})()`);
    await execute(github, context, core);
  } finally {
    vi.unstubAllEnvs();
  }
  return { failures, github };
}

type PlaywrightCommentScenario = {
  mergeSha: string;
  result: string;
  artifactUploaded?: "true" | "false";
  associatedPulls: Array<Record<string, unknown>>;
  pullRequest?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
};

async function executePlaywrightComment(scenario: PlaywrightCommentScenario) {
  const { workflow } = readWorkflow("playwright.yml");
  const step = findStep(getSteps(getJob(workflow, "comment")), "Comment merged PR with Full Regression result");
  const listPullRequestsAssociatedWithCommit = vi.fn();
  const listComments = vi.fn();
  const failures: string[] = [];
  const github = {
    paginate: vi.fn(async (endpoint: unknown) => {
      if (endpoint === listPullRequestsAssociatedWithCommit) return scenario.associatedPulls;
      if (endpoint === listComments) return scenario.comments ?? [];
      throw new Error("unexpected paginate endpoint");
    }),
    rest: {
      repos: { listPullRequestsAssociatedWithCommit },
      pulls: {
        get: vi.fn(async () => ({ data: scenario.pullRequest ?? {} })),
      },
      issues: {
        listComments,
        updateComment: vi.fn(async () => undefined),
        createComment: vi.fn(async () => undefined),
      },
    },
  };
  const context = {
    eventName: "push",
    ref: "refs/heads/develop",
    sha: scenario.mergeSha,
    payload: { after: scenario.mergeSha },
    repo: { owner: "example", repo: "shiftori" },
    runId: 300,
    serverUrl: "https://github.com",
  };
  const core = {
    info: vi.fn(),
    setFailed: vi.fn((message: string) => failures.push(message)),
  };

  vi.stubEnv("TEST_RESULT", scenario.result);
  vi.stubEnv("REPORT_ARTIFACT_UPLOADED", scenario.artifactUploaded ?? "true");
  try {
    const execute = new Function("github", "context", "core", `return (async () => {${getGithubScript(step)}\n})()`);
    await execute(github, context, core);
  } finally {
    vi.unstubAllEnvs();
  }
  return { failures, github };
}

type VrtStatusCommentScenario = {
  action: "in_progress" | "completed";
  workflowRun: Record<string, unknown>;
  liveWorkflowRun?: Record<string, unknown>;
  sourceRuns?: Array<Record<string, unknown>>;
  pullRequest?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
};

async function executeVrtStatusComment(scenario: VrtStatusCommentScenario) {
  const { workflow } = readWorkflow("publish-vrt-report.yml");
  const step = findStep(getSteps(getJob(workflow, "comment-source-status")), "Comment PR with VRT source status");
  const listComments = vi.fn();
  const listWorkflowRunsForWorkflow = vi.fn();
  const failures: string[] = [];
  const github = {
    paginate: vi.fn(async (endpoint: unknown) => {
      if (endpoint === listComments) return scenario.comments ?? [];
      if (endpoint === listWorkflowRunsForWorkflow) {
        return scenario.sourceRuns ?? [scenario.liveWorkflowRun ?? scenario.workflowRun];
      }
      throw new Error("unexpected paginate endpoint");
    }),
    rest: {
      actions: {
        getWorkflowRun: vi.fn(async () => ({ data: scenario.liveWorkflowRun ?? scenario.workflowRun })),
        listWorkflowRunsForWorkflow,
      },
      pulls: {
        get: vi.fn(async () => ({ data: scenario.pullRequest ?? {} })),
      },
      issues: {
        listComments,
        updateComment: vi.fn(async () => undefined),
        createComment: vi.fn(async () => undefined),
      },
    },
  };
  const context = {
    payload: { action: scenario.action, workflow_run: scenario.workflowRun },
    repo: { owner: "example", repo: "shiftori" },
    runId: 300,
    serverUrl: "https://github.com",
  };
  const core = {
    notice: vi.fn(),
    setFailed: vi.fn((message: string) => failures.push(message)),
  };

  const execute = new Function("github", "context", "core", `return (async () => {${getGithubScript(step)}\n})()`);
  await execute(github, context, core);
  return { failures, github };
}

type VrtPublicationCommentScenario = {
  workflowRun: Record<string, unknown>;
  liveWorkflowRun?: Record<string, unknown>;
  sourceRuns?: Array<Record<string, unknown>>;
  pullRequest?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
  env?: Partial<{
    VALIDATION_RESULT: string;
    SHOULD_PUBLISH: string;
    APPROVAL_RESULT: string;
    PUBLISH_RESULT: string;
    REPORT_DEPLOYED: string;
    HAS_DIFF: string;
  }>;
};

async function executeVrtPublicationComment(scenario: VrtPublicationCommentScenario) {
  const { workflow } = readWorkflow("publish-vrt-report.yml");
  const step = findStep(
    getSteps(getJob(workflow, "comment-publication-result")),
    "Comment PR with trusted VRT publication result",
  );
  const listComments = vi.fn();
  const listWorkflowRunsForWorkflow = vi.fn();
  const failures: string[] = [];
  const github = {
    paginate: vi.fn(async (endpoint: unknown) => {
      if (endpoint === listComments) return scenario.comments ?? [];
      if (endpoint === listWorkflowRunsForWorkflow) {
        return scenario.sourceRuns ?? [scenario.liveWorkflowRun ?? scenario.workflowRun];
      }
      throw new Error("unexpected paginate endpoint");
    }),
    rest: {
      actions: {
        getWorkflowRun: vi.fn(async () => ({ data: scenario.liveWorkflowRun ?? scenario.workflowRun })),
        listWorkflowRunsForWorkflow,
      },
      pulls: {
        get: vi.fn(async () => ({ data: scenario.pullRequest ?? {} })),
      },
      issues: {
        listComments,
        updateComment: vi.fn(async () => undefined),
        createComment: vi.fn(async () => undefined),
      },
    },
  };
  const context = {
    payload: { workflow_run: scenario.workflowRun },
    repo: { owner: "example", repo: "shiftori" },
    runId: 300,
    serverUrl: "https://github.com",
  };
  const core = {
    notice: vi.fn(),
    setFailed: vi.fn((message: string) => failures.push(message)),
  };
  const headSha = String(scenario.workflowRun.head_sha ?? "");
  const env = {
    VRT_REPORT_DIR: "yps-crispy-carnival-vrt",
    EXPECTED_BASELINE_REF: "develop",
    EXPECTED_HEAD_SHA: headSha,
    EXPECTED_PULL_NUMBER: "42",
    EXPECTED_SOURCE_RUN_ATTEMPT: "1",
    VALIDATION_RESULT: "success",
    SHOULD_PUBLISH: "true",
    APPROVAL_RESULT: "success",
    PUBLISH_RESULT: "success",
    REPORT_DEPLOYED: "true",
    HAS_DIFF: "false",
    PUBLISH_RUN_ATTEMPT: "1",
    REPORT_URL: "https://yn1323.github.io/hosting-pages/yps-crispy-carnival-vrt/pr-42/",
    ...scenario.env,
  };

  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  try {
    const execute = new Function("github", "context", "core", `return (async () => {${getGithubScript(step)}\n})()`);
    await execute(github, context, core);
  } finally {
    vi.unstubAllEnvs();
  }
  return { failures, github };
}

describe("GitHub release workflow security", () => {
  it("checks out the immutable merged pull request commit instead of a moving branch", () => {
    const checkout = getReleaseSteps().find((step) => step.uses === CHECKOUT_ACTION);

    expect(checkout?.with?.ref).toBe(githubExpression("github.event.pull_request.merge_commit_sha"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(checkout?.with?.ref).not.toBe("main");
    expect(releaseSource).not.toMatch(/^\s+ref:\s+(?:main|refs\/heads\/main)\s*$/m);
  });

  it("fails closed unless merge HEAD and the canary-attested head have the same content tree", () => {
    const gate = findStep(getReleaseSteps(), "Verify immutable release content");

    expect(gate.env).toMatchObject({
      EXPECTED_MERGE_SHA: githubExpression("github.event.pull_request.merge_commit_sha"),
      ATTESTED_HEAD_SHA: githubExpression("github.event.pull_request.head.sha"),
    });
    expect(gate.run).toContain("set -euo pipefail");
    expect(gate.run).toContain("^[0-9a-f]{40}$");
    expect(gate.run).toContain('if ! [[ "$EXPECTED_MERGE_SHA" =~ $SHA_PATTERN ]]');
    expect(gate.run).toContain('if ! [[ "$ATTESTED_HEAD_SHA" =~ $SHA_PATTERN ]]');
    expect(gate.run).toContain('ACTUAL_HEAD_SHA="$(git rev-parse HEAD)"');
    expect(gate.run).toContain('if [ "$ACTUAL_HEAD_SHA" != "$EXPECTED_MERGE_SHA" ]');
    expect(gate.run).toContain('git fetch --no-tags --depth=1 origin "$ATTESTED_HEAD_SHA"');
    expect(gate.run).toContain('FETCHED_ATTESTED_HEAD_SHA="$(git rev-parse FETCH_HEAD)"');
    expect(gate.run).toContain('if [ "$FETCHED_ATTESTED_HEAD_SHA" != "$ATTESTED_HEAD_SHA" ]');
    expect(gate.run?.match(/\^\{tree\}/g)).toHaveLength(2);
    expect(gate.run).toContain('if [ "$RELEASE_TREE_SHA" != "$ATTESTED_TREE_SHA" ]');
    expect(gate.run).toContain("exit 1");
  });

  it("runs the immutable content gate before local actions and release credentials", () => {
    const steps = getReleaseSteps();
    const gateIndex = steps.findIndex((step) => step.name === "Verify immutable release content");
    const checkoutIndex = steps.findIndex((step) => step.uses === CHECKOUT_ACTION);
    const firstLocalActionIndex = steps.findIndex((step) => step.uses?.startsWith("./"));
    const firstCredentialIndex = steps.findIndex((step) => {
      const serialized = JSON.stringify(step);
      return serialized.includes("${{ secrets.") || serialized.includes(githubExpression("github.token"));
    });

    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(steps[checkoutIndex]?.with?.["persist-credentials"]).toBe(false);
    expect(firstLocalActionIndex).toBeGreaterThan(gateIndex);
    expect(firstCredentialIndex).toBeGreaterThan(gateIndex);
    expect(JSON.stringify(steps.slice(0, gateIndex))).not.toContain("github.token");
    expect(JSON.stringify(steps.slice(0, gateIndex))).not.toContain("${{ secrets.");

    for (const name of [
      "Deploy Convex",
      "Run Convex migrations",
      "Build",
      "Setup prerender browser",
      "Prerender static routes",
      "Deploy to Cloudflare Pages",
      "Create GitHub Release",
    ]) {
      expect(
        steps.findIndex((step) => step.name === name),
        name,
      ).toBeGreaterThan(gateIndex);
    }
  });

  it("keeps provider canary approval bound to the attested pull request head", () => {
    const canaryGate = findStep(getReleaseSteps(), "Verify provider canary approval");

    expect(canaryGate.env?.EXPECTED_HEAD_SHA).toBe(githubExpression("github.event.pull_request.head.sha"));
    expect(canaryGate.run).toContain(`shiftori-provider-canary:${interpolation("process.env.EXPECTED_HEAD_SHA")}`);
    expect(canaryGate.run).toContain("shiftori-provider-canary-verified:v1");
  });

  it("uses the version already present in the release tree without mutating source or pushing main", () => {
    const steps = getReleaseSteps();
    const metadata = findStep(steps, "Determine release metadata");
    const allCommands = steps.map((step) => step.run ?? "").join("\n");

    expect(metadata.run).toContain('require("./package.json").version');
    expect(metadata.run).toContain(`echo "tag=v${interpolation("RELEASE_VERSION")}"`);
    expect(allCommands).not.toMatch(/\bnpm\s+version\b/);
    expect(allCommands).not.toMatch(/\bgit\s+(?:add|commit)\b/);
    expect(allCommands).not.toMatch(/\bgit\s+push\s+origin\s+(?:main|refs\/heads\/main)\b/);
  });

  it("creates an idempotent tag only at the expected merge commit", () => {
    const steps = getReleaseSteps();
    const tag = findStep(steps, "Create immutable release tag");
    const githubRelease = findStep(steps, "Create GitHub Release");
    const tagScript = getGithubScript(tag);

    expect(tag.env).toMatchObject({
      EXPECTED_MERGE_SHA: githubExpression("steps.release-content.outputs.merge_sha"),
      RELEASE_TAG: githubExpression("steps.release.outputs.tag"),
    });
    expect(tag.uses).toBe(GITHUB_SCRIPT_ACTION);
    expect(tag.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(tagScript).toContain("github.rest.git.getRef");
    expect(tagScript).toContain("github.rest.git.getTag");
    expect(tagScript).toContain("github.rest.git.createRef");
    expect(tagScript).toContain("sha: expectedSha");
    expect(tagScript).toContain("(await resolveCommit(reference.object)) !== expectedSha");
    expect(tagScript).toContain("core.setFailed");
    expect(githubRelease.with).toMatchObject({
      tag_name: githubExpression("steps.release.outputs.tag"),
      target_commitish: githubExpression("steps.release-content.outputs.merge_sha"),
    });
  });

  it("does not retain the obsolete post-release version back-sync workflow", () => {
    expect(existsSync(OBSOLETE_VERSION_SYNC_PATH)).toBe(false);
  });
});

describe("PR workflow credential isolation", () => {
  it("runs credentialed Full Regression only for the exact develop push commit", () => {
    const { source, workflow } = readWorkflow("playwright.yml");
    const testJob = getJob(workflow, "test");
    const checkout = getSteps(testJob).find((step) => step.uses === CHECKOUT_ACTION);

    expect(workflow.on).toEqual({ push: { branches: ["develop"] } });
    expect(checkout?.with?.ref).toBe(githubExpression("github.sha"));
    expect(source).toContain(githubExpression("secrets.CONVEX_DEPLOY_KEY"));
    expect(source).not.toContain("github.event.pull_request");
  });

  it("returns the Full Regression result to exactly one merged develop pull request", async () => {
    const { workflow } = readWorkflow("playwright.yml");
    const testJob = getJob(workflow, "test");
    const upload = findStep(getSteps(testJob), "Upload Playwright report");
    const commentJob = getJob(workflow, "comment");
    const steps = getSteps(commentJob);
    const comment = findStep(steps, "Comment merged PR with Full Regression result");
    const script = getGithubScript(comment);
    const mergeSha = "a".repeat(40);
    const mergedPull = {
      number: 42,
      state: "closed",
      merged_at: "2026-07-22T00:00:00Z",
      merge_commit_sha: mergeSha,
      base: { ref: "develop", repo: { full_name: "example/shiftori" } },
    };
    const result = await executePlaywrightComment({
      mergeSha,
      result: "success",
      associatedPulls: [mergedPull],
      pullRequest: mergedPull,
      comments: [
        {
          id: 99,
          body: [
            "## Playwright Test Report",
            "",
            "Status: Running",
            "",
            "| Action | Link |",
            "|---|---|",
            "| レポート確認 | [Actionsを見る](https://github.com/example/shiftori/actions/runs/100) |",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(commentJob.needs).toBe("test");
    expect(testJob.outputs).toEqual({
      report_artifact_uploaded: githubExpression("steps.playwright-report-artifact.outcome == 'success'"),
    });
    expect(upload.id).toBe("playwright-report-artifact");
    expect(upload.uses).toBe(UPLOAD_ARTIFACT_ACTION);
    expect(commentJob.if).toBe(githubExpression("always()"));
    expect(commentJob.permissions).toEqual({ contents: "read", issues: "write", "pull-requests": "write" });
    expect(steps).toHaveLength(1);
    expect(comment.uses).toBe(GITHUB_SCRIPT_ACTION);
    expect(comment.env?.REPORT_ARTIFACT_UPLOADED).toBe(githubExpression("needs.test.outputs.report_artifact_uploaded"));
    expect(comment.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(JSON.stringify(commentJob)).not.toContain("${{ secrets.");
    expect(script).toContain("listPullRequestsAssociatedWithCommit");
    expect(script).toContain("pull.merge_commit_sha === mergeSha");
    expect(script).toContain("pullRequest.merge_commit_sha !== mergeSha");
    expect(script).toContain("shiftori-playwright-report:v1");
    expect(script).not.toContain("comment.body?.includes(heading)");
    expect(script).toContain("legacyCandidates.length === 1");
    expect(script).toContain(`body.startsWith(\`${interpolation("heading")}\\n\`)`);
    expect(script).toContain("!body.includes(otherMarker)");
    expect(script).toContain("!body.includes(otherHeading)");
    expect(result.failures).toEqual([]);
    expect(result.github.paginate).toHaveBeenNthCalledWith(
      1,
      result.github.rest.repos.listPullRequestsAssociatedWithCommit,
      { owner: "example", repo: "shiftori", commit_sha: mergeSha, per_page: 100 },
    );
    expect(result.github.rest.pulls.get).toHaveBeenCalledWith({
      owner: "example",
      repo: "shiftori",
      pull_number: 42,
    });
    expect(result.github.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 99,
        body: expect.stringMatching(
          /<!-- shiftori-playwright-report:v1 -->[\s\S]*## Playwright Test Report[\s\S]*Status: Passed[\s\S]*Actionsの非公開artifactを見る[\s\S]*actions\/runs\/300/,
        ),
      }),
    );
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it.each([
    { testResult: "failure", artifactUploaded: "true" as const, linkLabel: "Actionsの非公開artifactを見る" },
    { testResult: "cancelled", artifactUploaded: "false" as const, linkLabel: "Actionsで実行結果を見る" },
    { testResult: "skipped", artifactUploaded: "false" as const, linkLabel: "Actionsで実行結果を見る" },
  ])(
    "creates a $testResult Full Regression comment with a valid Actions link",
    async ({ testResult, artifactUploaded, linkLabel }) => {
      const mergeSha = "a".repeat(40);
      const mergedPull = {
        number: 42,
        state: "closed",
        merged_at: "2026-07-22T00:00:00Z",
        merge_commit_sha: mergeSha,
        base: { ref: "develop", repo: { full_name: "example/shiftori" } },
      };
      const result = await executePlaywrightComment({
        mergeSha,
        result: testResult,
        artifactUploaded,
        associatedPulls: [mergedPull],
        pullRequest: mergedPull,
        comments: [],
      });

      expect(result.failures).toEqual([]);
      expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          body: expect.stringMatching(
            new RegExp(`Status: Failed \\(${testResult}\\)[\\s\\S]*${linkLabel}[\\s\\S]*actions/runs/300`),
          ),
        }),
      );
      expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    },
  );

  it("does not merge the Full Regression result into the VRT comment", async () => {
    const mergeSha = "a".repeat(40);
    const mergedPull = {
      number: 42,
      state: "closed",
      merged_at: "2026-07-22T00:00:00Z",
      merge_commit_sha: mergeSha,
      base: { ref: "develop", repo: { full_name: "example/shiftori" } },
    };
    const result = await executePlaywrightComment({
      mergeSha,
      result: "success",
      associatedPulls: [mergedPull],
      pullRequest: mergedPull,
      comments: [
        {
          id: 99,
          body: [
            "## Playwright Test Report",
            "",
            "Status: Passed",
            "",
            "| Action | Link |",
            "|---|---|",
            "| 実行確認 | [Actionsを見る](https://github.com/example/shiftori/actions/runs/100) |",
            "",
            "## VRT Report",
            "",
            "Status: Passed",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        body: expect.stringContaining("<!-- shiftori-playwright-report:v1 -->"),
      }),
    );
  });

  it("does not attach a Full Regression result to a direct develop push", async () => {
    const result = await executePlaywrightComment({
      mergeSha: "a".repeat(40),
      result: "success",
      associatedPulls: [],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it.each(["test-ui.yml", "vrt.yml"])("keeps PR producer %s free of secrets and write tokens", (filename) => {
    const { source, workflow } = readWorkflow(filename);

    expect(workflow.on?.pull_request).toBeDefined();
    expect(source).not.toContain("${{ secrets.");
    expect(Object.values(workflow.permissions ?? {})).not.toContain("write");
    for (const job of Object.values(workflow.jobs ?? {})) {
      expect(Object.values(job.permissions ?? {})).not.toContain("write");
      const executesCheckedOutCode = job.steps?.some(
        (step) => step.uses?.startsWith("./") || step.uses === CHECKOUT_ACTION || step.run,
      );
      if (executesCheckedOutCode) {
        expect(JSON.stringify(job)).not.toContain("${{ secrets.");
      }
    }
  });

  it("builds PR preview data from the exact head using browser-public Preview secrets only", () => {
    const { source, workflow } = readWorkflow("pr-preview.yml");
    const job = getJob(workflow, "build-preview-artifact");
    const steps = getSteps(job);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);
    const upload = steps.find((step) => step.uses === UPLOAD_ARTIFACT_ACTION);
    const secretNames = [...source.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]).sort();

    expect(job.environment).toBe("Preview");
    expect(Object.values(workflow.permissions ?? {})).not.toContain("write");
    expect(checkout?.with?.ref).toBe(githubExpression("github.event.pull_request.head.sha"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(upload?.with).toMatchObject({ name: "pr-preview-dist", path: "dist/" });
    expect(secretNames).toEqual([
      "VITE_CLERK_PUBLISHABLE_KEY",
      "VITE_CONVEX_URL",
      "VITE_GTM_ID",
      "VITE_TURNSTILE_SITE_KEY",
    ]);
  });

  it("publishes PR preview data only from a validated trusted workflow_run consumer", () => {
    const { workflow } = readWorkflow("publish-pr-preview.yml");
    const publish = getJob(workflow, "publish");
    const steps = getSteps(publish);
    const sourceGate = findStep(steps, "Validate source workflow metadata");
    const sourceScript = getGithubScript(sourceGate);
    const checkout = findStep(steps, "Checkout trusted publisher");
    const download = findStep(steps, "Download preview data artifact");
    const finalSourceGate = findStep(steps, "Revalidate preview source immediately before publish");
    const finalSourceScript = getGithubScript(finalSourceGate);
    const publication = findStep(steps, "Publish static preview data");
    const comment = findStep(steps, "Comment PR with published preview");
    const artifactGateIndex = steps.findIndex((step) => step.name === "Validate preview data artifact");
    const privacyGateIndex = steps.findIndex((step) => step.name === "Scan preview data artifact");
    const finalSourceGateIndex = steps.indexOf(finalSourceGate);
    const publicationIndex = steps.indexOf(publication);
    const firstSecretIndex = steps.findIndex((step) => JSON.stringify(step).includes("${{ secrets."));

    expect(workflow.on).toEqual({
      workflow_run: { workflows: ["PR Preview Artifact"], types: ["completed"] },
    });
    expect(workflow.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
      "pull-requests": "write",
    });
    expect(workflow.concurrency).toEqual({
      group: `pr-preview-${githubExpression("github.event.workflow_run.pull_requests[0].number")}`,
      "cancel-in-progress": false,
    });
    expect(sourceScript).toContain("run.name !== 'PR Preview Artifact'");
    expect(sourceScript).toContain("run.head_repository?.full_name");
    expect(sourceScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(sourceScript).toContain("available.length !== 1");
    expect(sourceScript).toContain("available[0].name !== 'pr-preview-dist'");
    expect(sourceScript).toContain("available[0].size_in_bytes <= 0");
    expect(sourceScript).toContain("available[0].size_in_bytes > 300 * 1024 * 1024");
    expect(sourceGate.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(checkout.with?.ref).toBe(githubExpression("github.sha"));
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(download.with).toMatchObject({
      name: "pr-preview-dist",
      "run-id": githubExpression("github.event.workflow_run.id"),
      "github-token": githubExpression("github.token"),
    });
    expect(finalSourceGate.env).toMatchObject({
      EXPECTED_HEAD_SHA: githubExpression("steps.source.outputs.head_sha"),
      EXPECTED_PULL_NUMBER: githubExpression("steps.source.outputs.pull_number"),
    });
    expect(finalSourceGate.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(finalSourceScript).toContain("run.head_sha !== expectedHeadSha");
    expect(finalSourceScript).toContain("pullRequest.state !== 'open'");
    expect(finalSourceScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(finalSourceScript).toContain("run.pull_requests[0]?.number !== pullNumber");
    expect(finalSourceScript).toContain("available[0].name !== 'pr-preview-dist'");
    expect(comment.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(artifactGateIndex).toBeGreaterThan(steps.indexOf(download));
    expect(artifactGateIndex).toBeLessThan(firstSecretIndex);
    expect(privacyGateIndex).toBeGreaterThan(artifactGateIndex);
    expect(privacyGateIndex).toBeLessThan(firstSecretIndex);
    expect(finalSourceGateIndex).toBeGreaterThan(privacyGateIndex);
    expect(finalSourceGateIndex).toBe(publicationIndex - 1);
    expect(publicationIndex).toBe(firstSecretIndex);
    expect(findStep(steps, "Validate preview data artifact").run).toContain("--profile preview-dist");
    expect(findStep(steps, "Publish static preview data").run).toContain("--no-bundle");
    expect(JSON.stringify(publish)).not.toMatch(/(?:bash|node|tsx)\s+trusted-artifacts\/preview-dist/);
  });

  it.each([
    { label: "the pull request was closed", state: "closed", pullHeadSha: "a".repeat(40), runHeadSha: "a".repeat(40) },
    { label: "the pull request head advanced", state: "open", pullHeadSha: "b".repeat(40), runHeadSha: "a".repeat(40) },
    {
      label: "the artifact source SHA changed",
      state: "open",
      pullHeadSha: "a".repeat(40),
      runHeadSha: "b".repeat(40),
    },
  ])("fails the final PR preview gate when $label", async ({ state, pullHeadSha, runHeadSha }) => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePublisherSourceGate({
      workflowFilename: "publish-pr-preview.yml",
      stepName: "Revalidate preview source immediately before publish",
      env: { EXPECTED_HEAD_SHA: expectedHeadSha, EXPECTED_PULL_NUMBER: "42" },
      workflowRun: {
        id: 100,
        name: "PR Preview Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: runHeadSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state,
        base: { ref: "develop" },
        head: { sha: pullHeadSha, repo: { full_name: "example/shiftori" } },
      },
      artifacts: [{ expired: false, name: "pr-preview-dist", size_in_bytes: 1024 }],
    });

    expect(result.failures).not.toEqual([]);
  });

  it("allows the final PR preview gate only for the current open head and artifact", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePublisherSourceGate({
      workflowFilename: "publish-pr-preview.yml",
      stepName: "Revalidate preview source immediately before publish",
      env: { EXPECTED_HEAD_SHA: expectedHeadSha, EXPECTED_PULL_NUMBER: "42" },
      workflowRun: {
        id: 100,
        name: "PR Preview Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: expectedHeadSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: expectedHeadSha, repo: { full_name: "example/shiftori" } },
      },
      artifacts: [{ expired: false, name: "pr-preview-dist", size_in_bytes: 1024 }],
    });

    expect(result.failures).toEqual([]);
  });

  it("uses trusted base code for credentialed PR cleanup", () => {
    const { source, workflow } = readWorkflow("cleanup-pr-preview.yml");
    const cleanup = getJob(workflow, "cleanup");
    const steps = getSteps(cleanup);
    const target = findStep(steps, "Validate cleanup target");
    const checkout = findStep(steps, "Checkout trusted cleanup code");

    expect(workflow.on?.pull_request).toBeUndefined();
    expect(workflow.on?.pull_request_target).toMatchObject({ branches: ["develop"], types: ["closed"] });
    expect(workflow.concurrency).toEqual({
      group: `pr-preview-${githubExpression("github.event.pull_request.number")}`,
      "cancel-in-progress": true,
    });
    expect(target.with?.["github-token"]).toBe("");
    expect(checkout.with?.ref).toBe(githubExpression("github.event.pull_request.base.sha"));
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(source).not.toContain("github.event.pull_request.head.sha");
    expect(steps.findIndex((step) => step.name === "Validate cleanup target")).toBeLessThan(
      steps.findIndex((step) => JSON.stringify(step).includes("${{ secrets.")),
    );
  });

  it("keeps credentialed build and deploy workflows on develop only", () => {
    for (const filename of ["build.yml", "deploy.yml"]) {
      const { workflow } = readWorkflow(filename);
      expect(workflow.on?.pull_request, filename).toBeUndefined();
      expect(workflow.on?.push, filename).toMatchObject({ branches: ["develop"] });
      for (const job of Object.values(workflow.jobs ?? {})) {
        const checkout = job.steps?.find((step) => step.uses === CHECKOUT_ACTION);
        expect(checkout?.with?.ref, filename).toBe(githubExpression("github.sha"));
      }
    }
  });

  it("runs UI tests for PR source with deterministic mocks and no Convex credentials", () => {
    const { source, workflow } = readWorkflow("test-ui.yml");
    const ui = getJob(workflow, "unit-test");
    const checkout = getSteps(ui).find((step) => step.uses === CHECKOUT_ACTION);

    expect(workflow.on?.pull_request).toBeDefined();
    expect(workflow.on?.push).toBeDefined();
    expect(ui.environment).toBeUndefined();
    expect(checkout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
    expect(source).toContain("pk_test_storybook");
    expect(source).toContain("https://storybook.convex.cloud");
    expect(source).not.toContain("npx convex dev");
    expect(source).not.toContain("${{ secrets.");
  });

  it("publishes VRT from validated PNG data using trusted default-branch code", () => {
    const { workflow } = readWorkflow("publish-vrt-report.yml");
    const statusJob = getJob(workflow, "comment-source-status");
    const statusComment = findStep(getSteps(statusJob), "Comment PR with VRT source status");
    const statusScript = getGithubScript(statusComment);
    const validation = getJob(workflow, "validate-source");
    const sourceGate = findStep(getSteps(validation), "Validate source workflow metadata and artifact declarations");
    const sourceScript = getGithubScript(sourceGate);
    const publish = getJob(workflow, "publish");
    const steps = getSteps(publish);
    const checkout = findStep(steps, "Checkout trusted VRT publisher");
    const download = findStep(steps, "Download VRT screenshot data");
    const credentialSourceGate = findStep(steps, "Revalidate VRT source immediately before credentials");
    const credentialSourceScript = getGithubScript(credentialSourceGate);
    const publicationSourceGate = findStep(steps, "Revalidate VRT source immediately before publish");
    const publicationSourceScript = getGithubScript(publicationSourceGate);
    const publication = findStep(steps, "Publish trusted VRT report and baseline");
    const commentJob = getJob(workflow, "comment-publication-result");
    const comment = findStep(getSteps(commentJob), "Comment PR with trusted VRT publication result");
    const artifactGateIndex = steps.findIndex((step) => step.name === "Validate VRT screenshot data");
    const privacyGateIndex = steps.findIndex((step) => step.name === "Scan VRT screenshot data");
    const credentialSourceGateIndex = steps.indexOf(credentialSourceGate);
    const publicationSourceGateIndex = steps.indexOf(publicationSourceGate);
    const publicationIndex = steps.indexOf(publication);
    const firstSecretIndex = steps.findIndex((step) => JSON.stringify(step).includes("${{ secrets."));

    expect(workflow.on).toEqual({
      workflow_run: { workflows: ["VRT Artifact"], types: ["in_progress", "completed"] },
    });
    expect(statusJob.if).toBe("github.event.workflow_run.event == 'pull_request'");
    expect(statusJob.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
      "pull-requests": "write",
    });
    expect(statusJob.concurrency).toEqual({
      group: `vrt-source-status-pr-${githubExpression("github.event.workflow_run.pull_requests[0].number")}`,
      "cancel-in-progress": true,
    });
    expect(statusComment.uses).toBe(GITHUB_SCRIPT_ACTION);
    expect(statusComment.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(JSON.stringify(statusJob)).not.toContain("${{ secrets.");
    expect(statusScript).toContain("run.name !== 'VRT Artifact'");
    expect(statusScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(statusScript).toContain("actions.getWorkflowRun");
    expect(statusScript).toContain("actions.listWorkflowRunsForWorkflow");
    expect(statusScript.match(/github\.rest\.pulls\.get/g)).toHaveLength(2);
    expect(statusScript).toContain("shiftori-vrt-report:v1");
    expect(statusScript).toContain("shiftori-vrt-state:");
    expect(statusScript).toContain("publicationActionsUrl");
    expect(statusScript).not.toContain("comment.body?.includes(heading)");
    expect(statusScript).toContain("legacyCandidates.length === 1");
    expect(statusScript).toContain(`body.startsWith(\`${interpolation("heading")}\\n\`)`);
    expect(statusScript).toContain("!body.includes(otherMarker)");
    expect(statusScript).toContain("!body.includes(otherHeading)");
    expect(statusScript).toContain("issues.updateComment");
    expect(sourceScript).toContain("run.name !== 'VRT Artifact'");
    expect(sourceScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(sourceScript).toContain("branch.commit.sha !== run.head_sha");
    expect(sourceScript).toContain("actions.listWorkflowRunsForWorkflow");
    for (const name of ["vrt-actual-1", "vrt-actual-2", "vrt-actual-3", "vrt-actual-4"]) {
      expect(sourceScript).toContain(name);
    }
    expect(sourceScript).toContain("artifact.size_in_bytes <= 0");
    expect(sourceScript).toContain("artifact.size_in_bytes > 200 * 1024 * 1024");
    expect(sourceScript).toContain("totalBytes > 500 * 1024 * 1024");
    expect(sourceGate.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(checkout.with?.ref).toBe(githubExpression("github.sha"));
    expect(publish.permissions).toEqual({ actions: "read", contents: "read", "pull-requests": "read" });
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(download.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(publish.concurrency).toEqual({
      group: `vrt-${githubExpression(
        "needs.validate-source.outputs.pull_number != '' && needs.validate-source.outputs.pull_number || needs.validate-source.outputs.baseline_ref",
      )}`,
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(credentialSourceGate.env).toMatchObject({
      EXPECTED_BASELINE_REF: githubExpression("needs.validate-source.outputs.baseline_ref"),
      EXPECTED_HEAD_SHA: githubExpression("needs.validate-source.outputs.head_sha"),
      EXPECTED_PULL_NUMBER: githubExpression("needs.validate-source.outputs.pull_number"),
      EXPECTED_REPORT_KEY: githubExpression("needs.validate-source.outputs.report_key"),
      EXPECTED_RUN_ATTEMPT: githubExpression("needs.validate-source.outputs.run_attempt"),
    });
    expect(credentialSourceScript).toContain("actions.getWorkflowRun");
    expect(credentialSourceScript).toContain("actions.listWorkflowRunsForWorkflow");
    expect(credentialSourceScript).toContain("liveRun.run_attempt !== expectedRunAttempt");
    expect(credentialSourceScript).toContain("run.head_sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("pullRequest.state !== 'open'");
    expect(credentialSourceScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("branch.commit.sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("actualNames.some((name, index) => name !== expectedNames[index])");
    expect(publicationSourceGate.env).toMatchObject({
      EXPECTED_RUN_ATTEMPT: githubExpression("needs.validate-source.outputs.run_attempt"),
    });
    expect(publicationSourceScript).toContain("actions.getWorkflowRun");
    expect(publicationSourceScript).toContain("actions.listWorkflowRunsForWorkflow");
    expect(publicationSourceScript).toContain("liveRun.run_attempt !== expectedRunAttempt");
    expect(publicationSourceScript).toContain("run.head_sha !== expectedHeadSha");
    expect(publicationSourceScript).toContain("pullRequest.state !== 'open'");
    expect(publicationSourceScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(publicationSourceScript).toContain("branch.commit.sha !== expectedHeadSha");
    expect(comment.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(commentJob.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
      "pull-requests": "write",
    });
    expect(commentJob.needs).toEqual(["comment-source-status", "validate-source", "approve-pr-publication", "publish"]);
    expect(commentJob.if).toContain("always()");
    expect(commentJob.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(comment.env).toMatchObject({
      EXPECTED_BASELINE_REF: githubExpression("needs.validate-source.outputs.baseline_ref"),
      EXPECTED_HEAD_SHA: githubExpression("needs.validate-source.outputs.head_sha"),
      EXPECTED_PULL_NUMBER: githubExpression("needs.validate-source.outputs.pull_number"),
      EXPECTED_SOURCE_RUN_ATTEMPT: githubExpression("needs.validate-source.outputs.run_attempt"),
      VALIDATION_RESULT: githubExpression("needs.validate-source.result"),
      SHOULD_PUBLISH: githubExpression("needs.validate-source.outputs.should_publish"),
      APPROVAL_RESULT: githubExpression("needs.approve-pr-publication.result"),
      PUBLISH_RESULT: githubExpression("needs.publish.result"),
      REPORT_DEPLOYED: githubExpression("needs.publish.outputs.report_deployed"),
      HAS_DIFF: githubExpression("needs.publish.outputs.report_has_diff"),
    });
    expect(getGithubScript(comment)).toContain("差分あり（公開済み）");
    expect(getGithubScript(comment)).toContain("Trusted report公開失敗");
    expect(getGithubScript(comment)).toContain("Trusted report検証失敗");
    expect(getGithubScript(comment)).toContain("公開承認未完了");
    expect(getGithubScript(comment)).not.toContain("Differences approved and published");
    expect(getGithubScript(comment)).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(getGithubScript(comment)).toContain("actions.getWorkflowRun");
    expect(getGithubScript(comment)).toContain("actions.listWorkflowRunsForWorkflow");
    expect(getGithubScript(comment)).toContain("shiftori-vrt-state:");
    expect(getGithubScript(comment)).toContain("sourceActionsUrl");
    expect(getGithubScript(comment)).toContain("publicationActionsUrl");
    expect(getGithubScript(comment)).not.toContain("comment.body?.includes(heading)");
    expect(getGithubScript(comment)).toContain("legacyCandidates.length === 1");
    expect(getGithubScript(comment)).toContain(`body.startsWith(\`${interpolation("heading")}\\n\`)`);
    expect(getGithubScript(comment)).toContain("!body.includes(otherMarker)");
    expect(getGithubScript(comment)).toContain("!body.includes(otherHeading)");
    expect(getGithubScript(comment).match(/github\.rest\.pulls\.get/g)).toHaveLength(2);
    expect(getGithubScript(comment)).toContain("issues.updateComment");
    expect(findStep(steps, "Validate VRT screenshot data").run).toContain("--profile vrt-screenshots");
    expect(artifactGateIndex).toBeLessThan(firstSecretIndex);
    expect(privacyGateIndex).toBeGreaterThan(artifactGateIndex);
    expect(privacyGateIndex).toBeLessThan(firstSecretIndex);
    expect(credentialSourceGateIndex).toBeGreaterThan(privacyGateIndex);
    expect(credentialSourceGateIndex).toBe(firstSecretIndex - 1);
    expect(publicationSourceGateIndex).toBe(publicationIndex - 1);
    expect(findStep(steps, "Build VRT report with trusted code").run).toBe("pnpm vrt:report");
    expect(findStep(steps, "Validate generated VRT report").run).toContain("--profile vrt-report");
    expect(findStep(steps, "Scan generated VRT report").run).toContain("--root vrt-work/reg");
  });

  it("updates the trusted VRT comment while the current PR source is running", async () => {
    const headSha = "a".repeat(40);
    const result = await executeVrtStatusComment({
      action: "in_progress",
      workflowRun: {
        id: 200,
        workflow_id: 500,
        run_attempt: 1,
        status: "waiting",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: null,
        head_sha: headSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
      comments: [
        {
          id: 99,
          body: [
            "## VRT Report",
            "",
            "Status: Passed",
            "",
            "| Action | Link |",
            "|---|---|",
            "| VRT実行 | [Actionsを見る](https://github.com/example/shiftori/actions/runs/100) |",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 99,
        body: expect.stringMatching(/Status: 実行中[\s\S]*VRT実行[\s\S]*actions\/runs\/200/),
      }),
    );
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("actions/runs/300") }),
    );
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("差分レポートを見る") }),
    );
    expect(result.github.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(result.github.paginate).toHaveBeenCalledWith(result.github.rest.actions.listWorkflowRunsForWorkflow, {
      owner: "example",
      repo: "shiftori",
      workflow_id: 500,
      event: "pull_request",
      head_sha: headSha,
      per_page: 100,
    });
    expect(result.github.paginate).toHaveBeenCalledTimes(3);
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("links the VRT source and trusted publisher while publication is waiting", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        body: expect.stringMatching(
          /<!-- shiftori-vrt-report:v1 -->[\s\S]*## VRT Report[\s\S]*公開承認待ち[\s\S]*VRT実行[\s\S]*actions\/runs\/200[\s\S]*公開承認・公開処理[\s\S]*actions\/runs\/300/,
        ),
      }),
    );
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("差分レポートを見る") }),
    );
  });

  it.each([
    { conclusion: "failure", status: "Status: 失敗" },
    { conclusion: "cancelled", status: "Status: キャンセル" },
  ])("links only the VRT source when the source run is $conclusion", async ({ conclusion, status }) => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion,
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringMatching(new RegExp(`${status}[\\s\\S]*VRT実行[\\s\\S]*actions/runs/200`)),
      }),
    );
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("actions/runs/300") }),
    );
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("差分レポートを見る") }),
    );
  });

  it("does not merge the VRT status into the Playwright comment", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "failure",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
      comments: [
        {
          id: 99,
          body: [
            "## VRT Report",
            "",
            "Status: 失敗",
            "",
            "| Action | Link |",
            "|---|---|",
            "| VRT実行 | [Actionsを見る](https://github.com/example/shiftori/actions/runs/100) |",
            "",
            "## Playwright Test Report",
            "",
            "Status: Passed",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("<!-- shiftori-vrt-report:v1 -->") }),
    );
  });

  it("does not overwrite the VRT comment from a stale pull request run", async () => {
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: {
        id: 200,
        workflow_id: 500,
        run_attempt: 1,
        status: "completed",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: "failure",
        head_sha: "a".repeat(40),
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: "b".repeat(40), repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("does not overwrite the VRT comment when a newer source run exists for the same head", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: sourceRun,
      sourceRuns: [sourceRun, { ...sourceRun, id: 201, status: "in_progress", conclusion: null }],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("does not downgrade a published VRT comment for the same source attempt", async () => {
    const headSha = "a".repeat(40);
    const result = await executeVrtStatusComment({
      action: "completed",
      workflowRun: {
        id: 200,
        workflow_id: 500,
        run_attempt: 2,
        status: "completed",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: headSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
      comments: [
        {
          id: 99,
          body: [
            "<!-- shiftori-vrt-report:v1 -->",
            `<!-- shiftori-vrt-state:${headSha}:200:2:3 -->`,
            "## VRT Report",
            "",
            "Status: Passed",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("updates the current PR with the trusted VRT publication result", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtPublicationComment({
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
      comments: [
        {
          id: 99,
          body: [
            "## VRT Report",
            "",
            "Status: 実行中",
            "",
            "| Action | Link |",
            "|---|---|",
            "| VRT実行 | [Actionsを見る](https://github.com/example/shiftori/actions/runs/100) |",
          ].join("\n"),
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 99,
        body: expect.stringMatching(
          /Status: Passed[\s\S]*差分レポートを見る\]\(https:\/\/yn1323\.github\.io\/hosting-pages\/yps-crispy-carnival-vrt\/pr-42\/\?v=300-1\)[\s\S]*VRT実行[\s\S]*actions\/runs\/200[\s\S]*公開処理[\s\S]*actions\/runs\/300/,
        ),
      }),
    );
    expect(result.github.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(result.github.rest.pulls.get).toHaveBeenCalledTimes(2);
    expect(result.github.paginate).toHaveBeenCalledWith(result.github.rest.actions.listWorkflowRunsForWorkflow, {
      owner: "example",
      repo: "shiftori",
      workflow_id: 500,
      event: "pull_request",
      head_sha: headSha,
      per_page: 100,
    });
  });

  it.each([
    {
      env: {
        VALIDATION_RESULT: "failure",
        SHOULD_PUBLISH: "",
        APPROVAL_RESULT: "skipped",
        PUBLISH_RESULT: "skipped",
        REPORT_DEPLOYED: "",
        HAS_DIFF: "",
      },
      status: "Status: Trusted report検証失敗（failure）",
    },
    {
      env: { APPROVAL_RESULT: "failure", PUBLISH_RESULT: "skipped", REPORT_DEPLOYED: "", HAS_DIFF: "" },
      status: "Status: 公開承認未完了（failure）",
    },
    {
      env: { APPROVAL_RESULT: "cancelled", PUBLISH_RESULT: "skipped", REPORT_DEPLOYED: "", HAS_DIFF: "" },
      status: "Status: 公開承認未完了（cancelled）",
    },
    {
      env: { APPROVAL_RESULT: "success", PUBLISH_RESULT: "failure", REPORT_DEPLOYED: "false" },
      status: "Status: Trusted report公開失敗（failure）",
    },
    {
      env: { APPROVAL_RESULT: "success", PUBLISH_RESULT: "cancelled", REPORT_DEPLOYED: "false" },
      status: "Status: Trusted report公開失敗（cancelled）",
    },
  ])("reports a terminal VRT publication failure: $status", async ({ env, status }) => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtPublicationComment({
      workflowRun: sourceRun,
      env,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringMatching(
          new RegExp(`${status}[\\s\\S]*VRT実行[\\s\\S]*actions/runs/200[\\s\\S]*公開処理[\\s\\S]*actions/runs/300`),
        ),
      }),
    );
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("差分レポートを見る") }),
    );
  });

  it("skips the terminal VRT comment after the pull request head changes", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtPublicationComment({
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: "b".repeat(40), repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("skips the terminal VRT comment when a newer source run exists", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtPublicationComment({
      workflowRun: sourceRun,
      sourceRuns: [sourceRun, { ...sourceRun, id: 201, status: "in_progress", conclusion: null }],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.pulls.get).not.toHaveBeenCalled();
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("does not replace a terminal VRT comment from a newer source run", async () => {
    const headSha = "a".repeat(40);
    const sourceRun = {
      id: 200,
      workflow_id: 500,
      run_attempt: 1,
      status: "completed",
      name: "VRT Artifact",
      event: "pull_request",
      conclusion: "success",
      head_sha: headSha,
      head_repository: { full_name: "example/shiftori" },
      pull_requests: [{ number: 42 }],
    };
    const result = await executeVrtPublicationComment({
      workflowRun: sourceRun,
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
      comments: [
        {
          id: 99,
          body: `<!-- shiftori-vrt-report:v1 -->\n<!-- shiftori-vrt-state:${headSha}:201:1:3 -->\n## VRT Report`,
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it.each(["Revalidate VRT source immediately before credentials", "Revalidate VRT source immediately before publish"])(
    "fails %s after approval when the pull request head advanced",
    async (stepName) => {
      const expectedHeadSha = "a".repeat(40);
      const result = await executePublisherSourceGate({
        workflowFilename: "publish-vrt-report.yml",
        stepName,
        env: {
          EXPECTED_BASELINE_REF: "develop",
          EXPECTED_HEAD_SHA: expectedHeadSha,
          EXPECTED_PULL_NUMBER: "42",
          EXPECTED_REPORT_KEY: "pr-42",
          EXPECTED_RUN_ATTEMPT: "1",
        },
        workflowRun: {
          id: 200,
          workflow_id: 500,
          run_attempt: 1,
          status: "completed",
          name: "VRT Artifact",
          event: "pull_request",
          conclusion: "success",
          head_sha: expectedHeadSha,
          head_repository: { full_name: "example/shiftori" },
          pull_requests: [{ number: 42 }],
        },
        pullRequest: {
          state: "open",
          base: { ref: "develop" },
          head: { sha: "b".repeat(40), repo: { full_name: "example/shiftori" } },
        },
        artifacts: ["vrt-actual-1", "vrt-actual-2", "vrt-actual-3", "vrt-actual-4"].map((name) => ({
          expired: false,
          name,
          size_in_bytes: 1024,
        })),
      });

      expect(result.failures).not.toEqual([]);
    },
  );

  it.each(["Revalidate VRT source immediately before credentials", "Revalidate VRT source immediately before publish"])(
    "fails %s when a same-SHA source rerun supersedes the approved attempt",
    async (stepName) => {
      const expectedHeadSha = "a".repeat(40);
      const sourceRun = {
        id: 200,
        workflow_id: 500,
        run_attempt: 1,
        status: "completed",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: expectedHeadSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      };
      const result = await executePublisherSourceGate({
        workflowFilename: "publish-vrt-report.yml",
        stepName,
        env: {
          EXPECTED_BASELINE_REF: "develop",
          EXPECTED_HEAD_SHA: expectedHeadSha,
          EXPECTED_PULL_NUMBER: "42",
          EXPECTED_REPORT_KEY: "pr-42",
          EXPECTED_RUN_ATTEMPT: "1",
        },
        workflowRun: sourceRun,
        liveWorkflowRun: { ...sourceRun, run_attempt: 2, status: "in_progress", conclusion: null },
        pullRequest: {
          state: "open",
          base: { ref: "develop" },
          head: { sha: expectedHeadSha, repo: { full_name: "example/shiftori" } },
        },
      });

      expect(result.failures).not.toEqual([]);
      expect(result.github.rest.pulls.get).not.toHaveBeenCalled();
    },
  );

  it.each(["Revalidate VRT source immediately before credentials", "Revalidate VRT source immediately before publish"])(
    "fails %s when a newer source run exists for the same head",
    async (stepName) => {
      const expectedHeadSha = "a".repeat(40);
      const sourceRun = {
        id: 200,
        workflow_id: 500,
        run_attempt: 1,
        status: "completed",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: expectedHeadSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      };
      const result = await executePublisherSourceGate({
        workflowFilename: "publish-vrt-report.yml",
        stepName,
        env: {
          EXPECTED_BASELINE_REF: "develop",
          EXPECTED_HEAD_SHA: expectedHeadSha,
          EXPECTED_PULL_NUMBER: "42",
          EXPECTED_REPORT_KEY: "pr-42",
          EXPECTED_RUN_ATTEMPT: "1",
        },
        workflowRun: sourceRun,
        sourceRuns: [sourceRun, { ...sourceRun, id: 201, status: "in_progress", conclusion: null }],
      });

      expect(result.failures).not.toEqual([]);
      expect(result.github.rest.pulls.get).not.toHaveBeenCalled();
      expect(result.github.paginate).toHaveBeenCalledWith(result.github.rest.actions.listWorkflowRunsForWorkflow, {
        owner: "example",
        repo: "shiftori",
        workflow_id: 500,
        event: "pull_request",
        head_sha: expectedHeadSha,
        per_page: 100,
      });
      expect(result.github.paginate).toHaveBeenCalledTimes(1);
    },
  );

  it("fails the post-approval VRT credential gate when the pull request was closed", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePublisherSourceGate({
      workflowFilename: "publish-vrt-report.yml",
      stepName: "Revalidate VRT source immediately before credentials",
      env: {
        EXPECTED_BASELINE_REF: "develop",
        EXPECTED_HEAD_SHA: expectedHeadSha,
        EXPECTED_PULL_NUMBER: "42",
        EXPECTED_REPORT_KEY: "pr-42",
        EXPECTED_RUN_ATTEMPT: "1",
      },
      workflowRun: {
        id: 200,
        workflow_id: 500,
        run_attempt: 1,
        status: "completed",
        name: "VRT Artifact",
        event: "pull_request",
        conclusion: "success",
        head_sha: expectedHeadSha,
        head_repository: { full_name: "example/shiftori" },
        pull_requests: [{ number: 42 }],
      },
      pullRequest: {
        state: "closed",
        base: { ref: "develop" },
        head: { sha: expectedHeadSha, repo: { full_name: "example/shiftori" } },
      },
      artifacts: ["vrt-actual-1", "vrt-actual-2", "vrt-actual-3", "vrt-actual-4"].map((name) => ({
        expired: false,
        name,
        size_in_bytes: 1024,
      })),
    });

    expect(result.failures).not.toEqual([]);
  });

  it("keeps the producer diff gate without trusting it as publisher approval", () => {
    const { workflow: producer } = readWorkflow("vrt.yml");
    const { workflow: publisher } = readWorkflow("publish-vrt-report.yml");
    const producerApproval = getJob(producer, "approve");
    const approval = getJob(publisher, "approve-pr-publication");
    const publish = getJob(publisher, "publish");

    expect(producer.concurrency).toEqual({
      group: `vrt-${githubExpression("github.event.pull_request.number || github.ref_name")}`,
      "cancel-in-progress": true,
    });

    expect(producerApproval.needs).toEqual(["prepare", "compare"]);
    expect(producerApproval.environment).toBe("vrt-approval");
    expect(producerApproval.if).toContain("needs.compare.outputs.has_diff == 'true'");
    expect(approval.needs).toBe("validate-source");
    expect(approval.environment).toBe("vrt-approval");
    expect(approval.if).toContain("needs.validate-source.outputs.should_publish == 'true'");
    expect(approval.if).toContain("needs.validate-source.outputs.pull_number != ''");
    expect(publish.needs).toEqual(["comment-source-status", "validate-source", "approve-pr-publication"]);
    expect(publish.if).toContain("always()");
    expect(publish.if).toContain("needs.validate-source.result == 'success'");
    expect(publish.if).toContain("needs.validate-source.outputs.should_publish == 'true'");
    expect(publish.if).toContain("needs.validate-source.outputs.pull_number == ''");
    expect(publish.if).toContain("needs.approve-pr-publication.result == 'success'");
    expect(publish.environment).toBe("Preview");
    expect(JSON.stringify(publisher)).not.toContain("needs.compare");
    expect(JSON.stringify(publisher)).not.toContain("outputs.has_diff");
  });
});

describe("repository security scan workflow", () => {
  it("pins every external workflow and composite action to an immutable commit", () => {
    const workflowDirectory = path.join(REPOSITORY_ROOT, ".github/workflows");
    const actionDirectory = path.join(REPOSITORY_ROOT, ".github/actions");
    const files = [
      ...readdirSync(workflowDirectory)
        .filter((filename) => filename.endsWith(".yml"))
        .map((filename) => path.join(workflowDirectory, filename)),
      ...readdirSync(actionDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(actionDirectory, entry.name, "action.yml")),
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) {
        const reference = match[1];
        if (reference.startsWith("./")) continue;
        expect(reference, path.relative(REPOSITORY_ROOT, file)).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
      }
    }
  });

  it("scans reachable history with pinned TruffleHog and fails on scan errors", () => {
    const { workflow } = readWorkflow("security.yml");
    const job = getJob(workflow, "secret-history");
    const steps = getSteps(job);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);
    const scan = findStep(steps, "Scan reachable Git history for credentials");

    expect(workflow.on?.pull_request).toBeDefined();
    expect(workflow.on?.push).toBeDefined();
    expect(workflow.on?.schedule).toBeDefined();
    expect(checkout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "fetch-depth": 0,
      "persist-credentials": false,
    });
    expect(scan.uses).toBe("trufflesecurity/trufflehog@17456f8c7d042d8c82c9a8ca9e937231f9f42e26");
    expect(scan.with).toMatchObject({
      base: githubExpression("github.event_name == 'pull_request' && github.event.pull_request.base.sha || ''"),
      head: githubExpression("github.event.pull_request.head.sha || github.sha"),
      version: "3.95.2",
    });
    expect(scan.with?.extra_args).toContain("--results=verified,unknown");
    expect(scan.with?.extra_args).toContain("--fail-on-scan-errors");
  });

  it("scans public build output without credentials", () => {
    const { workflow } = readWorkflow("security.yml");
    const job = getJob(workflow, "public-artifact");
    const steps = getSteps(job);

    expect(JSON.stringify(job)).not.toContain("${{ secrets.");
    expect(findStep(steps, "Scan public and dist").run).toContain("--root public --root dist");
    expect(job.if).toContain("github.event_name == 'pull_request'");
  });

  it("fails dependency scans at High and runs CodeQL write permissions only on trusted events", () => {
    const { workflow } = readWorkflow("security.yml");
    const review = getJob(workflow, "dependency-review");
    const reviewStep = findStep(getSteps(review), "Reject newly introduced High or Critical vulnerabilities");
    const audit = getJob(workflow, "dependency-audit");
    const codeql = getJob(workflow, "codeql-sast");
    const initialize = findStep(getSteps(codeql), "Initialize CodeQL");

    expect(review.if).toBe("github.event_name == 'pull_request'");
    expect(reviewStep.uses).toMatch(/^actions\/dependency-review-action@[0-9a-f]{40}$/);
    expect(reviewStep.with?.["fail-on-severity"]).toBe("high");
    expect(audit.if).toBe("github.event_name != 'pull_request'");
    expect(findStep(getSteps(audit), "Reject High or Critical dependency vulnerabilities").run).toBe(
      "pnpm audit --audit-level high",
    );
    expect(codeql.if).toBe("github.event_name != 'pull_request'");
    expect(codeql.permissions?.["security-events"]).toBe("write");
    expect(initialize.uses).toMatch(/^github\/codeql-action\/init@[0-9a-f]{40}$/);
    expect(initialize.with).toMatchObject({
      "build-mode": "none",
      languages: "javascript-typescript",
      queries: "security-extended",
    });
  });

  it("runs pinned zizmor without Advanced Security write permission", () => {
    const { workflow } = readWorkflow("security.yml");
    const job = getJob(workflow, "workflow-sast");
    const scan = findStep(getSteps(job), "Scan workflows without Advanced Security write permission");

    expect(job.permissions).toEqual({ actions: "read", contents: "read" });
    expect(scan.uses).toMatch(/^zizmorcore\/zizmor-action@[0-9a-f]{40}$/);
    expect(scan.with).toMatchObject({
      "advanced-security": false,
      "min-confidence": "high",
      "min-severity": "high",
      version: "1.27.0",
    });
  });
});

type AuthorizationScenario = {
  eventName: string;
  payload: Record<string, unknown>;
  permission: string;
};

async function executeClaudeAuthorization(scenario: AuthorizationScenario) {
  const { workflow } = readWorkflow("claude.yml");
  const authorize = getJob(workflow, "authorize");
  const step = findStep(getSteps(authorize), "Authorize the original event sender");
  const script = getGithubScript(step);

  const outputs = new Map<string, string>();
  const summary = {
    addHeading: vi.fn(() => summary),
    addTable: vi.fn(() => summary),
    write: vi.fn(async () => undefined),
  };
  const core = {
    setOutput: vi.fn((name: string, value: string) => outputs.set(name, value)),
    summary,
  };
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission: scenario.permission } })),
      },
    },
  };
  const context = {
    eventName: scenario.eventName,
    payload: scenario.payload,
    repo: { owner: "example", repo: "shiftori" },
  };
  const execute = new Function("github", "context", "core", `return (async () => {${script}\n})()`);
  await execute(github, context, core);
  return { github, outputs };
}

describe("Claude workflow actor authorization", () => {
  it.each(["write", "maintain", "admin"])("allows an @claude request from %s permission", async (permission) => {
    const result = await executeClaudeAuthorization({
      eventName: "issue_comment",
      payload: { sender: { login: "trusted-user" }, comment: { body: "@claude review this" } },
      permission,
    });

    expect(result.outputs.get("mentioned")).toBe("true");
    expect(result.outputs.get("authorized")).toBe("true");
  });

  it.each(["read", "none"])("rejects an external @claude request with %s permission", async (permission) => {
    const result = await executeClaudeAuthorization({
      eventName: "issue_comment",
      payload: { sender: { login: "external-user" }, comment: { body: "@claude spend tokens" } },
      permission,
    });

    expect(result.outputs.get("mentioned")).toBe("true");
    expect(result.outputs.get("authorized")).toBe("false");
  });

  it("does not authorize a rerun by replacing the original event sender", async () => {
    const result = await executeClaudeAuthorization({
      eventName: "issue_comment",
      payload: {
        sender: { login: "external-user" },
        triggering_actor: { login: "repository-owner" },
        comment: { body: "@claude rerun" },
      },
      permission: "read",
    });

    expect(result.outputs.get("actor")).toBe("external-user");
    expect(result.outputs.get("authorized")).toBe("false");
  });

  it("keeps the Anthropic secret behind authorization and bounded execution", () => {
    const { source, workflow } = readWorkflow("claude.yml");
    const authorize = getJob(workflow, "authorize");
    const claude = getJob(workflow, "claude");
    const action = findStep(getSteps(claude), "Run Claude Code");
    const issueComment = workflow.on?.issue_comment as { types?: string[] };
    const reviewComment = workflow.on?.pull_request_review_comment as { types?: string[] };
    const review = workflow.on?.pull_request_review as { types?: string[] };
    const issues = workflow.on?.issues as { types?: string[] };

    expect(issueComment.types).toEqual(["created"]);
    expect(reviewComment.types).toEqual(["created"]);
    expect(review.types).toEqual(["submitted"]);
    expect(issues.types).toEqual(["opened"]);
    expect(issues.types).not.toContain("assigned");
    expect(source).not.toContain("triggering_actor");
    expect(JSON.stringify(authorize)).not.toContain("ANTHROPIC_API_KEY");
    expect(claude.needs).toBe("authorize");
    expect(claude.if).toContain("needs.authorize.outputs.authorized == 'true'");
    expect(claude["timeout-minutes"]).toBe(20);
    expect(action.with).toMatchObject({
      anthropic_api_key: githubExpression("secrets.ANTHROPIC_API_KEY"),
      claude_args: "--max-turns 10",
    });
  });
});
