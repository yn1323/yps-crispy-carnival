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
  env?: Record<string, string>;
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

type PrCommentScenario = {
  workflowFilename: string;
  jobName: string;
  stepName: string;
  env: Record<string, string>;
  pullRequest?: Record<string, unknown>;
  comments?: Array<Record<string, unknown>>;
  jobs?: Array<Record<string, unknown>>;
};

async function executePrComment(scenario: PrCommentScenario) {
  const { workflow } = readWorkflow(scenario.workflowFilename);
  const step = findStep(getSteps(getJob(workflow, scenario.jobName)), scenario.stepName);
  const listComments = vi.fn();
  const listJobsForWorkflowRun = vi.fn();
  const updateComment = vi.fn(async (_input: Record<string, unknown>) => undefined);
  const createComment = vi.fn(async (_input: Record<string, unknown>) => undefined);
  const headSha = scenario.env.EXPECTED_HEAD_SHA ?? "a".repeat(40);
  const pullRequest = scenario.pullRequest ?? {
    state: "open",
    base: { ref: "develop" },
    head: { sha: headSha, repo: { full_name: "example/shiftori" } },
  };
  const github = {
    paginate: vi.fn(async (endpoint: unknown) => {
      if (endpoint === listComments) return scenario.comments ?? [];
      if (endpoint === listJobsForWorkflowRun) return scenario.jobs ?? [];
      throw new Error("unexpected paginate endpoint");
    }),
    rest: {
      actions: { listJobsForWorkflowRun },
      pulls: { get: vi.fn(async () => ({ data: pullRequest })) },
      issues: {
        listComments,
        updateComment,
        createComment,
      },
    },
  };
  const context = {
    eventName: "pull_request",
    payload: {
      pull_request: {
        number: 42,
        head: { sha: headSha, repo: { full_name: "example/shiftori" } },
      },
    },
    repo: { owner: "example", repo: "shiftori" },
    runId: 300,
    runAttempt: 2,
    serverUrl: "https://github.com",
  };
  const core = { notice: vi.fn(), setFailed: vi.fn() };

  for (const [name, value] of Object.entries(scenario.env)) vi.stubEnv(name, value);
  try {
    const execute = new Function("github", "context", "core", `return (async () => {${getGithubScript(step)}\n})()`);
    await execute(github, context, core);
  } finally {
    vi.unstubAllEnvs();
  }
  return { core, github };
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

describe("Direct PR workflow security", () => {
  it("runs authenticated Full Regression on the exact same-repository PR head", () => {
    const { source, workflow } = readWorkflow("playwright.yml");
    const pullRequest = workflow.on?.pull_request as { branches?: string[]; types?: string[] };
    const test = getJob(workflow, "test");
    const steps = getSteps(test);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);
    const run = findStep(steps, "Run Playwright Full Regression");

    expect(pullRequest).toEqual({
      branches: ["develop"],
      types: ["opened", "synchronize", "reopened", "edited"],
    });
    expect(workflow.on?.push).toBeUndefined();
    expect(workflow.concurrency).toEqual({
      group: `playwright-${githubExpression("github.event.pull_request.number")}`,
      "cancel-in-progress": true,
    });
    expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(test.environment).toBe("Preview");
    expect(test.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(test.if).toContain("!startsWith(github.head_ref, 'renovate/')");
    expect(test.if).toContain("github.actor != 'dependabot[bot]'");
    expect(checkout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha"),
      "persist-credentials": false,
    });
    expect(run.run).toContain("pnpm e2e:release");
    expect(run.run).toContain("::add-mask::");
    expect(run.env).toMatchObject({
      VITE_CONVEX_URL: githubExpression("steps.preview.outputs.PREVIEW_URL"),
      E2E_CLERK_USERS: githubExpression("vars.E2E_CLERK_USERS"),
      E2E_CLERK_PASSWORD: githubExpression("secrets.E2E_CLERK_PASSWORD || vars.E2E_CLERK_PASSWORD"),
      CLERK_SECRET_KEY: githubExpression("secrets.CLERK_SECRET_KEY"),
      VITE_CLERK_PUBLISHABLE_KEY: githubExpression("secrets.VITE_CLERK_PUBLISHABLE_KEY"),
      VITE_TURNSTILE_SITE_KEY: githubExpression("secrets.VITE_TURNSTILE_SITE_KEY"),
      CONVEX_DEPLOY_KEY: githubExpression("secrets.CONVEX_DEPLOY_KEY"),
      NOTIFICATION_DELIVERY_MODE: "dry-run",
    });
    expect(source).not.toContain("pull_request_target");
    expect(source).not.toContain("workflow_run");
  });

  it("configures and verifies a delivery-suppressed E2E-only Convex preview", () => {
    const { workflow } = readWorkflow("playwright.yml");
    const test = getJob(workflow, "test");
    const steps = getSteps(test);
    const deploy = findStep(steps, "Deploy Preview");
    const configure = findStep(steps, "Configure E2E Preview safety");
    const verify = findStep(steps, "Verify Preview E2E Safety");
    const resultGate = findStep(steps, "Verify Full Regression result gate");
    const backendAudit = findStep(steps, "Verify Full Regression backend audit");

    expect(test.env).toEqual({
      CONVEX_PREVIEW_NAME: `pr-${githubExpression("github.event.pull_request.number")}-e2e`,
    });
    expect(deploy.run).toContain("--preview-create");
    expect(deploy.run).toContain("--cmd-url-env-var-name CONVEX_URL");
    expect(deploy.env?.CONVEX_DEPLOY_KEY).toBe(githubExpression("secrets.CONVEX_DEPLOY_KEY"));
    expect(configure.run).toContain("openssl rand -hex 32");
    expect(configure.run).toContain("E2E_TESTING_DEPLOYMENT_URL");
    expect(configure.run).toContain("E2E_TESTING_ENABLED true");
    expect(configure.run).toContain("NOTIFICATION_DELIVERY_MODE dry-run");
    expect(configure.run).toContain("ORGANIZATION_INVITATION_SIGNING_SECRET");
    expect(verify.run).toContain("testing:getE2ESafetyState");
    expect(verify.run).toContain("helpersEnabled");
    expect(verify.run).toContain("notificationDeliverySuppressed");
    expect(verify.run).toContain("organizationInvitationSigningSecretConfigured");
    expect(resultGate.run).toBe("pnpm e2e:assert-release-results");
    expect(backendAudit.run).toContain("testing:getE2EBackendAudit");
    expect(backendAudit.run).toContain("auditedOrganizationCount");
    expect(backendAudit.run).toContain("duplicateActiveDedupeKeyCount");
  });

  it("publishes only a validated sanitized E2E summary directly to hosting-pages", () => {
    const { workflow } = readWorkflow("playwright.yml");
    const test = getJob(workflow, "test");
    const steps = getSteps(test);
    const artifactSafety = findStep(steps, "Verify Playwright artifact safety");
    const publicResult = findStep(steps, "Resolve public E2E result");
    const build = findStep(steps, "Build sanitized public E2E report");
    const publicSafety = findStep(steps, "Validate sanitized public E2E report");
    const currentHead = findStep(steps, "Revalidate PR head before publishing E2E report");
    const publish = findStep(steps, "Publish sanitized E2E report to hosting-pages");
    const wait = findStep(steps, "Wait for hosting-pages E2E report");
    const privateArtifact = findStep(steps, "Upload private Playwright report");
    const enforce = findStep(steps, "Enforce Full Regression result");

    expect(artifactSafety.run).toContain("pnpm e2e:assert-artifact-safety");
    expect(artifactSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(publicResult.env).toMatchObject({
      PLAYWRIGHT_RESULT: githubExpression("steps.playwright.outcome"),
      RESULT_GATE_RESULT: githubExpression("steps.result-gate.outcome"),
      BACKEND_AUDIT_RESULT: githubExpression("steps.backend-audit.outcome"),
    });
    expect(publicResult.run).toContain("result=failure");
    expect(build.run).toContain("buildPublicPlaywrightReport.mjs");
    expect(build.run).toContain("--input test-results.json");
    expect(build.run).toContain("--output public-playwright-report");
    expect(build.env?.PREVIEW_URL).toBe(
      `https://pr-${githubExpression("github.event.pull_request.number")}.dev-yps-crispy-carnival.pages.dev/`,
    );
    expect(build.env?.PLAYWRIGHT_RESULT).toBe(githubExpression("steps.public-result.outputs.result"));
    expect(publicSafety.run).toContain("--profile playwright-public-report");
    expect(publicSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(getGithubScript(currentHead)).toContain("pullRequest.state === 'open'");
    expect(getGithubScript(currentHead)).toContain("pullRequest.head.sha === process.env.EXPECTED_HEAD_SHA");
    expect(getGithubScript(currentHead)).toContain("pullRequest.head.repo?.full_name");
    expect(publish.env?.HOSTING_PAGES_TOKEN).toBe(githubExpression("secrets.HOSTING_PAGES_TOKEN"));
    expect(publish.run).toContain("github.com/yn1323/hosting-pages.git");
    expect(publish.run).toContain("public-playwright-report/.");
    expect(publish.run).toContain("scripts/pushHostingPagesWithRetry.sh");
    expect(publish.run).toContain("deploy-marker-");
    expect(wait.run).toContain("deploy-marker-");
    expect(wait.run).toContain("curl -sf");
    expect(privateArtifact.uses).toBe(UPLOAD_ARTIFACT_ACTION);
    expect(privateArtifact.if).toContain("steps.artifact-safety.outcome == 'success'");
    expect(privateArtifact.with?.["retention-days"]).toBe(7);
    expect(JSON.stringify(privateArtifact.with?.path)).toContain("playwright-report/");
    expect(JSON.stringify(privateArtifact.with?.path)).toContain("test-results/");
    expect(enforce.run).toContain("PUBLIC_REPORT_SAFETY_RESULT");
    expect(enforce.run).toContain("PUBLISH_REPORT_RESULT");
    expect(enforce.run).toContain("PUBLIC_RESULT_STEP");
  });

  it("updates a separate open-PR E2E comment with Actions, hosting-pages, and Cloudflare links", async () => {
    const expectedHeadSha = "a".repeat(40);
    const existing = {
      id: 91,
      body: "<!-- shiftori-playwright-report:v1 -->\nold",
      user: { login: "github-actions[bot]" },
    };
    const vrtComment = {
      id: 92,
      body: "<!-- shiftori-vrt-report:v1 -->\n## VRT Report",
      user: { login: "github-actions[bot]" },
    };
    const result = await executePrComment({
      workflowFilename: "playwright.yml",
      jobName: "comment",
      stepName: "Comment PR with Playwright result",
      env: {
        E2E_REPORT_DIR: "yps-crispy-carnival-e2e",
        EXPECTED_HEAD_SHA: expectedHeadSha,
        TEST_RESULT: "success",
        REPORT_DEPLOYED: "true",
        REPORT_ARTIFACT_UPLOADED: "true",
      },
      comments: [existing, vrtComment],
    });

    expect(result.github.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 91,
        body: expect.stringMatching(
          /shiftori-playwright-report:v1[\s\S]*Status: Passed[\s\S]*Actionsを見る[\s\S]*actions\/runs\/300[\s\S]*yps-crispy-carnival-e2e\/pr-42\/[\s\S]*pr-42\.dev-yps-crispy-carnival\.pages\.dev[\s\S]*Actionsの非公開artifactを見る/,
        ),
      }),
    );
    const body = result.github.rest.issues.updateComment.mock.calls[0]?.[0]?.body as string;
    expect(body).not.toContain("shiftori-vrt-report:v1");
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("does not update the E2E comment for a stale PR head", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePrComment({
      workflowFilename: "playwright.yml",
      jobName: "comment",
      stepName: "Comment PR with Playwright result",
      env: {
        E2E_REPORT_DIR: "yps-crispy-carnival-e2e",
        EXPECTED_HEAD_SHA: expectedHeadSha,
        TEST_RESULT: "success",
        REPORT_DEPLOYED: "false",
        REPORT_ARTIFACT_UPLOADED: "false",
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: "b".repeat(40), repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.core.notice).toHaveBeenCalled();
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("deploys the exact same-repository PR head to Cloudflare Pages branch pr-N", () => {
    const { source, workflow } = readWorkflow("deploy.yml");
    const pullRequest = workflow.on?.pull_request as { branches?: string[]; types?: string[] };
    const preview = getJob(workflow, "deploy-preview");
    const steps = getSteps(preview);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);
    const convex = findStep(steps, "Deploy Convex Preview");
    const build = findStep(steps, "Build");
    const revalidate = findStep(steps, "Revalidate current PR head before Cloudflare publish");
    const deploy = findStep(steps, "Deploy PR head to Cloudflare Pages");
    const smoke = findStep(steps, "Smoke deployed Cloudflare Preview");

    expect(pullRequest).toEqual({
      branches: ["develop"],
      types: ["opened", "synchronize", "reopened", "closed"],
    });
    expect(workflow.on?.push).toEqual({ branches: ["develop"] });
    expect(preview.environment).toBe("Preview");
    expect(preview.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(preview.if).toContain("!startsWith(github.head_ref, 'renovate/')");
    expect(preview.if).toContain("github.actor != 'dependabot[bot]'");
    expect(checkout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha"),
      "persist-credentials": false,
    });
    expect(convex.env?.CONVEX_DEPLOY_KEY).toBe(githubExpression("secrets.CONVEX_DEPLOY_KEY"));
    expect(build.env).toMatchObject({
      VITE_CLERK_PUBLISHABLE_KEY: githubExpression("secrets.VITE_CLERK_PUBLISHABLE_KEY"),
      VITE_GTM_ID: githubExpression("secrets.VITE_GTM_ID"),
      VITE_TURNSTILE_SITE_KEY: githubExpression("secrets.VITE_TURNSTILE_SITE_KEY"),
    });
    expect(deploy.env).toMatchObject({
      CLOUDFLARE_API_TOKEN: githubExpression("secrets.CLOUDFLARE_API_TOKEN"),
      CLOUDFLARE_ACCOUNT_ID: githubExpression("secrets.CLOUDFLARE_ACCOUNT_ID"),
      PR_NUMBER: githubExpression("github.event.pull_request.number"),
      EXPECTED_HEAD_SHA: githubExpression("github.event.pull_request.head.sha"),
    });
    expect(deploy.run).toContain("--project-name dev-yps-crispy-carnival");
    expect(deploy.run).toContain(`--branch "pr-${interpolation("PR_NUMBER")}"`);
    expect(deploy.run).toContain('--commit-hash "$EXPECTED_HEAD_SHA"');
    expect(getGithubScript(revalidate)).toContain("pullRequest.state !== 'open'");
    expect(getGithubScript(revalidate)).toContain("pullRequest.head.sha !== process.env.EXPECTED_HEAD_SHA");
    expect(smoke.run).toBe("pnpm e2e:deployed");
    expect(smoke.env?.E2E_DEPLOYED_BASE_URL).toBe(githubExpression("steps.deploy.outputs.DEPLOY_URL"));
    expect(source).not.toContain("workflow_run");
  });

  it("keeps the Cloudflare Preview comment separate and current-head-bound", async () => {
    const expectedHeadSha = "a".repeat(40);
    const { workflow } = readWorkflow("deploy.yml");
    const commentJob = getJob(workflow, "comment-preview");
    const comment = findStep(getSteps(commentJob), "Comment PR with Cloudflare Preview");
    const script = getGithubScript(comment);

    expect(commentJob.permissions).toEqual({
      contents: "read",
      issues: "write",
      "pull-requests": "write",
    });
    expect(commentJob.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(script).toContain("shiftori-cloudflare-preview:v1");
    expect(script).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(script).toContain("PRプレビューを開く");
    expect(script).toContain("Actionsを見る");

    const result = await executePrComment({
      workflowFilename: "deploy.yml",
      jobName: "comment-preview",
      stepName: "Comment PR with Cloudflare Preview",
      env: {
        EXPECTED_HEAD_SHA: expectedHeadSha,
        DEPLOY_RESULT: "success",
        DEPLOY_URL: "https://deployment.dev-yps-crispy-carnival.pages.dev/",
      },
      comments: [
        {
          id: 99,
          body: "<!-- shiftori-playwright-report:v1 -->\n## Playwright Test Report",
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        body: expect.stringMatching(
          /shiftori-cloudflare-preview:v1[\s\S]*Status: Deployed[\s\S]*deployment\.dev-yps-crispy-carnival\.pages\.dev[\s\S]*pr-42\.dev-yps-crispy-carnival\.pages\.dev[\s\S]*actions\/runs\/300/,
        ),
      }),
    );
    const body = result.github.rest.issues.createComment.mock.calls[0]?.[0]?.body as string;
    expect(body).not.toContain("shiftori-playwright-report:v1");
  });

  it("publishes validated VRT reports directly from the exact current source", () => {
    const { source, workflow } = readWorkflow("vrt.yml");
    const prepare = getJob(workflow, "prepare");
    const build = getJob(workflow, "build");
    const capture = getJob(workflow, "capture");
    const compare = getJob(workflow, "compare");
    const prepareStep = findStep(getSteps(prepare), "Resolve VRT destination");
    const compareSteps = getSteps(compare);
    const compareCheckout = compareSteps.find((step) => step.uses === CHECKOUT_ACTION);
    const clone = findStep(compareSteps, "Checkout VRT Pages");
    const screenshotSafety = findStep(compareSteps, "Validate VRT screenshot data");
    const report = findStep(compareSteps, "Build VRT report");
    const reportSafety = findStep(compareSteps, "Validate generated VRT report");
    const sourceGate = findStep(compareSteps, "Revalidate VRT source before publish");
    const publish = findStep(compareSteps, "Publish VRT report and baseline");
    const wait = findStep(compareSteps, "Wait for hosting-pages VRT report");

    expect(workflow.on?.pull_request).toEqual({ branches: ["develop", "main"] });
    expect(workflow.on?.push).toEqual({ branches: ["develop", "main"] });
    for (const job of [prepare, build, capture]) {
      expect(job.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
      expect(job.if).toContain("!startsWith(github.head_ref, 'renovate/')");
      expect(job.if).toContain("github.actor != 'dependabot[bot]'");
    }
    expect(compare.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(compare.if).toContain("!startsWith(github.head_ref, 'renovate/')");
    expect(compare.if).toContain("github.actor != 'dependabot[bot]'");
    expect(compare.environment).toBe("Preview");
    expect(compareCheckout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
    expect(getGithubScript(prepareStep)).toContain("pull.head.repo?.full_name");
    expect(clone.env?.HOSTING_PAGES_TOKEN).toBe(githubExpression("secrets.HOSTING_PAGES_TOKEN"));
    expect(clone.run).toContain("github.com/yn1323/hosting-pages.git");
    expect(screenshotSafety.run).toContain("--profile vrt-screenshots");
    expect(report.env?.REG_SUIT_CLIENT_ID).toBe(githubExpression("secrets.REG_SUIT_CLIENT_ID"));
    expect(reportSafety.run).toContain("--profile vrt-report");
    expect(reportSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(getGithubScript(sourceGate)).toContain("pullRequest.state === 'open'");
    expect(getGithubScript(sourceGate)).toContain("pullRequest.head.sha === expectedHeadSha");
    expect(getGithubScript(sourceGate)).toContain("branch.commit.sha === expectedHeadSha");
    expect(publish.run).toContain("vrt-work/reg/.");
    expect(publish.run).toContain("scripts/pushHostingPagesWithRetry.sh");
    expect(publish.run).toContain("deploy-marker-");
    expect(wait.run).toContain("deploy-marker-");
    expect(wait.run).toContain("curl -sf");
    expect(source).not.toContain("workflow_run");
  });

  it("requires explicit vrt-approval when a PR has visual differences", () => {
    const { workflow } = readWorkflow("vrt.yml");
    const approve = getJob(workflow, "approve");

    expect(approve.needs).toEqual(["prepare", "compare"]);
    expect(approve.environment).toBe("vrt-approval");
    expect(approve.if).toContain("needs.prepare.outputs.should_fail_on_diff == 'true'");
    expect(approve.if).toContain("needs.compare.outputs.has_diff == 'true'");
    expect(approve.if).toContain("needs.compare.result == 'success'");
  });

  it("updates a separate VRT comment with report, Actions, and approval links", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePrComment({
      workflowFilename: "vrt.yml",
      jobName: "comment",
      stepName: "Comment PR with VRT result",
      env: {
        VRT_REPORT_DIR: "yps-crispy-carnival-vrt",
        COMPARE_RESULT: "success",
        HAS_DIFF: "true",
        REPORT_DEPLOYED: "true",
        REPORT_URL: "https://yn1323.github.io/hosting-pages/yps-crispy-carnival-vrt/pr-42/",
        EXPECTED_HEAD_SHA: expectedHeadSha,
        RUN_ATTEMPT: "2",
      },
      comments: [
        {
          id: 99,
          body: "<!-- shiftori-playwright-report:v1 -->\n## Playwright Test Report",
          user: { login: "github-actions[bot]" },
        },
      ],
      jobs: [{ name: "approve", html_url: "https://github.com/example/shiftori/actions/runs/300/job/999" }],
    });

    expect(result.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        body: expect.stringMatching(
          /shiftori-vrt-report:v1[\s\S]*差分あり（承認待ち）[\s\S]*yps-crispy-carnival-vrt\/pr-42\/\?v=300-2[\s\S]*actions\/runs\/300[\s\S]*actions\/runs\/300\/job\/999/,
        ),
      }),
    );
    expect(result.github.paginate).toHaveBeenCalledWith(result.github.rest.actions.listJobsForWorkflowRun, {
      owner: "example",
      repo: "shiftori",
      run_id: 300,
      per_page: 100,
    });
    const body = result.github.rest.issues.createComment.mock.calls[0]?.[0]?.body as string;
    expect(body).not.toContain("shiftori-playwright-report:v1");
  });

  it("marks the VRT comment approved after the environment approval finishes", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePrComment({
      workflowFilename: "vrt.yml",
      jobName: "comment-after-approval",
      stepName: "Mark VRT comment as approved",
      env: {
        VRT_REPORT_DIR: "yps-crispy-carnival-vrt",
        EXPECTED_HEAD_SHA: expectedHeadSha,
        REPORT_DEPLOYED: "true",
        REPORT_URL: "https://yn1323.github.io/hosting-pages/yps-crispy-carnival-vrt/pr-42/",
        RUN_ATTEMPT: "2",
      },
      comments: [
        {
          id: 77,
          body: "<!-- shiftori-vrt-report:v1 -->\n## VRT Report\n\nStatus: 差分あり（承認待ち）",
          user: { login: "github-actions[bot]" },
        },
      ],
      jobs: [{ name: "approve", html_url: "https://github.com/example/shiftori/actions/runs/300/job/999" }],
    });

    expect(result.github.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 77,
        body: expect.stringMatching(
          /Status: 差分あり（承認済み）[\s\S]*yps-crispy-carnival-vrt\/pr-42\/\?v=300-2[\s\S]*承認済みjobを見る/,
        ),
      }),
    );
  });

  it("does not update the VRT comment for a stale PR head", async () => {
    const expectedHeadSha = "a".repeat(40);
    const result = await executePrComment({
      workflowFilename: "vrt.yml",
      jobName: "comment",
      stepName: "Comment PR with VRT result",
      env: {
        VRT_REPORT_DIR: "yps-crispy-carnival-vrt",
        COMPARE_RESULT: "success",
        HAS_DIFF: "false",
        REPORT_DEPLOYED: "false",
        REPORT_URL: "https://yn1323.github.io/hosting-pages/yps-crispy-carnival-vrt/pr-42/",
        EXPECTED_HEAD_SHA: expectedHeadSha,
      },
      pullRequest: {
        state: "open",
        base: { ref: "develop" },
        head: { sha: "b".repeat(40), repo: { full_name: "example/shiftori" } },
      },
    });

    expect(result.core.notice).toHaveBeenCalled();
    expect(result.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("removes the workflow_run publishers and PR preview artifact producer", () => {
    for (const filename of ["pr-preview.yml", "publish-pr-preview.yml", "publish-vrt-report.yml"]) {
      expect(existsSync(path.join(REPOSITORY_ROOT, ".github/workflows", filename))).toBe(false);
    }

    for (const filename of ["playwright.yml", "deploy.yml", "vrt.yml"]) {
      expect(readWorkflow(filename).source).not.toContain("workflow_run");
    }
  });

  it("cancels Full Regression and uses base code for credentialed PR cleanup", () => {
    const { source, workflow } = readWorkflow("deploy.yml");
    const cleanup = getJob(workflow, "cleanup-preview");
    const steps = getSteps(cleanup);
    const validate = findStep(steps, "Validate cleanup target");
    const checkout = findStep(steps, "Checkout trusted cleanup code");
    const cloudflareCleanup = findStep(steps, "Delete Cloudflare Pages previews");

    expect(workflow.on?.pull_request).toEqual({
      branches: ["develop"],
      types: ["opened", "synchronize", "reopened", "closed"],
    });
    expect(cleanup.concurrency).toEqual({
      group: `playwright-${githubExpression("github.event.pull_request.number")}`,
      "cancel-in-progress": true,
    });
    expect(cleanup.if).toContain("github.event.action == 'closed'");
    expect(cleanup.if).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(cleanup.environment).toBe("Preview");
    expect(getGithubScript(validate)).toContain("pull.base.repo.full_name");
    expect(getGithubScript(validate)).toContain("pull.head.repo?.full_name");
    expect(checkout.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.base.sha"),
      "persist-credentials": false,
    });
    expect(cloudflareCleanup.run).toContain("PAGE=1");
    expect(cloudflareCleanup.run).toContain("per_page=100");
    expect(cloudflareCleanup.run).toContain("result_info.total_pages");
    expect(source).toContain(`pr-${interpolation("PR_NUMBER")}-deploy,pr-${interpolation("PR_NUMBER")}-e2e`);
    expect(existsSync(path.join(REPOSITORY_ROOT, ".github/workflows/cleanup-pr-preview.yml"))).toBe(false);
  });

  it("keeps UI tests secretless while checking out the exact PR source", () => {
    const { source, workflow } = readWorkflow("test-ui.yml");
    const unitTest = getJob(workflow, "unit-test");
    const steps = getSteps(unitTest);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);

    expect(workflow.on?.pull_request).toBeDefined();
    expect(JSON.stringify(unitTest)).not.toContain(`${DOLLAR}{{ secrets.`);
    expect(source).not.toContain("CONVEX_DEPLOY_KEY");
    expect(source).not.toContain("CLERK_SECRET_KEY");
    expect(unitTest.env).toEqual({
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_storybook",
      VITE_CONVEX_URL: "https://storybook.convex.cloud",
    });
    expect(checkout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
  });

  it("keeps credentialed develop build and deploy jobs off arbitrary pushes", () => {
    const { workflow: buildWorkflow } = readWorkflow("build.yml");
    const { workflow: deployWorkflow } = readWorkflow("deploy.yml");
    const developDeploy = getJob(deployWorkflow, "deploy-develop");
    const developCheckout = getSteps(developDeploy).find((step) => step.uses === CHECKOUT_ACTION);

    expect(buildWorkflow.on).toEqual({ push: { branches: ["develop"] } });
    expect(developDeploy.if).toContain("github.event_name == 'push'");
    expect(developDeploy.if).toContain("github.ref == 'refs/heads/develop'");
    expect(developDeploy.environment).toBe("Develop");
    expect(developCheckout?.with).toMatchObject({
      ref: githubExpression("github.sha"),
      "persist-credentials": false,
    });
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
