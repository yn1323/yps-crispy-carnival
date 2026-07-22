import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type WorkflowStep = {
  "continue-on-error"?: boolean;
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
const DOWNLOAD_ARTIFACT_ACTION = "actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53";
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

describe("PR workflow and trusted publisher security", () => {
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

  it("keeps E2E publication credentials and PR comments out of the PR producer", () => {
    const { source, workflow } = readWorkflow("playwright.yml");
    const test = getJob(workflow, "test");
    const steps = getSteps(test);
    const publicInputSafety = findStep(steps, "Verify Playwright public report input");
    const artifactSafety = findStep(steps, "Verify Playwright artifact safety");
    const publicInput = findStep(steps, "Upload Playwright public report input");
    const privateArtifact = findStep(steps, "Upload private Playwright report");
    const enforce = findStep(steps, "Enforce Full Regression result");

    expect(publicInputSafety).toMatchObject({
      id: "public-input-safety",
      if: githubExpression("!cancelled()"),
      "continue-on-error": true,
    });
    expect(publicInputSafety.run).toContain("cp test-results.json playwright-public-input/test-results.json");
    expect(publicInputSafety.run).toContain("--profile playwright-public-input");
    expect(publicInputSafety.run).toContain("playwright-public-input/test-results.json");
    expect(publicInputSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(artifactSafety.run).toContain("pnpm e2e:assert-artifact-safety");
    expect(artifactSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(publicInput).toMatchObject({
      uses: UPLOAD_ARTIFACT_ACTION,
      if: githubExpression("!cancelled() && steps.public-input-safety.outcome == 'success'"),
    });
    expect(publicInput.with).toMatchObject({
      name: `playwright-public-input-${githubExpression("github.run_attempt")}`,
      path: "playwright-public-input/test-results.json",
      "if-no-files-found": "error",
      "retention-days": 1,
    });
    expect(privateArtifact.uses).toBe(UPLOAD_ARTIFACT_ACTION);
    expect(privateArtifact.if).toContain("steps.artifact-safety.outcome == 'success'");
    expect(privateArtifact.with).toMatchObject({
      name: `playwright-report-${githubExpression("github.run_attempt")}`,
      "if-no-files-found": "error",
      "retention-days": 7,
    });
    expect(JSON.stringify(privateArtifact.with?.path)).toContain("playwright-report/");
    expect(JSON.stringify(privateArtifact.with?.path)).toContain("test-results/");
    expect(enforce.env).toMatchObject({
      PUBLIC_INPUT_SAFETY_RESULT: githubExpression("steps.public-input-safety.outcome"),
      PUBLIC_INPUT_ARTIFACT_RESULT: githubExpression("steps.public-input-artifact.outcome"),
      PRIVATE_REPORT_ARTIFACT_RESULT: githubExpression("steps.playwright-report-artifact.outcome"),
    });
    expect(source).not.toContain("HOSTING_PAGES_TOKEN");
    expect(source).not.toContain("issues: write");
    expect(source).not.toContain("pull-requests: write");
    expect(source).not.toContain("buildPublicPlaywrightReport.mjs");
    expect(source).not.toContain("pushHostingPagesWithRetry.sh");
    expect(source).not.toContain("shiftori-playwright-report:v1");
  });

  it("publishes only a validated E2E summary from trusted default-branch code", () => {
    const { source, workflow } = readWorkflow("publish-playwright-report.yml");
    const workflowRun = workflow.on?.workflow_run as { workflows?: string[]; types?: string[] };
    const validate = getJob(workflow, "validate-source");
    const validateScript = getGithubScript(
      findStep(getSteps(validate), "Validate Playwright source and artifact declarations"),
    );
    const publish = getJob(workflow, "publish");
    const steps = getSteps(publish);
    const checkout = findStep(steps, "Checkout trusted Playwright publisher");
    const download = findStep(steps, "Download Playwright public report input");
    const inputSafety = findStep(steps, "Validate Playwright public report input");
    const build = findStep(steps, "Build trusted public Playwright report");
    const reportSafety = findStep(steps, "Validate trusted public Playwright report");
    const trustedReportArtifact = findStep(steps, "Upload trusted public Playwright report");
    const revalidate = findStep(steps, "Revalidate Playwright source before credentials");
    const clone = findStep(steps, "Checkout E2E hosting pages");
    const revalidatePublish = findStep(steps, "Revalidate Playwright source before publish");
    const publishStep = findStep(steps, "Publish trusted Playwright report");
    const wait = findStep(steps, "Wait for trusted Playwright report deploy");
    const credentialIndex = steps.indexOf(clone);
    const downloadedArtifactNames = Object.values(workflow.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses === DOWNLOAD_ARTIFACT_ACTION)
      .map((step) => step.with?.name);

    expect(workflowRun).toEqual({ workflows: ["Playwright Tests"], types: ["completed"] });
    expect(validate.if).toContain("github.event.workflow_run.head_repository.full_name == github.repository");
    expect(validateScript).toContain("pullRequest.state !== 'open'");
    expect(validateScript).toContain("pullRequest.base.ref !== 'develop'");
    expect(validateScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(validateScript).toContain("workflow_id: 'playwright.yml'");
    expect(validateScript).toContain("run.path !== expectedWorkflowPath");
    expect(validateScript).toContain("trustedWorkflow.id !== run.workflow_id");
    expect(validateScript).toContain("liveRun.path !== expectedWorkflowPath");
    expect(validateScript).toContain("getWorkflowRun");
    expect(validateScript).toContain("listWorkflowRunsForWorkflow");
    expect(validateScript).toContain("latestSourceRun?.id !== run.id");
    expect(validateScript).toContain("artifactNamePattern");
    expect(validateScript).toContain(`\`playwright-public-input-${interpolation("run.run_attempt")}\``);
    expect(validateScript).toContain(`\`playwright-report-${interpolation("run.run_attempt")}\``);
    expect(validateScript).toContain("10 * 1024 * 1024");
    expect(validateScript).toContain("500 * 1024 * 1024");
    expect(publish.environment).toBe("Report Publisher");
    expect(checkout.with).toMatchObject({
      ref: githubExpression("github.sha"),
      "persist-credentials": false,
    });
    expect(download.with).toMatchObject({
      name: `playwright-public-input-${githubExpression("needs.validate-source.outputs.run_attempt")}`,
      path: "trusted-artifacts/playwright-public-input",
      "run-id": githubExpression("github.event.workflow_run.id"),
      "github-token": githubExpression("github.token"),
    });
    expect(inputSafety.run).toContain("--profile playwright-public-input");
    expect(inputSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(build.run).toContain("buildPublicPlaywrightReport.mjs");
    expect(build.run).toContain("trusted-artifacts/playwright-public-input/test-results.json");
    expect(reportSafety.run).toContain("--profile playwright-public-report");
    expect(reportSafety.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(trustedReportArtifact.with).toMatchObject({
      name: "trusted-playwright-public-report",
      overwrite: true,
    });
    expect(getGithubScript(revalidate)).toContain("latestSourceRun?.id !== run.id");
    expect(getGithubScript(revalidate)).toContain("workflow_id: 'playwright.yml'");
    expect(getGithubScript(revalidate)).toContain("run.workflow_id !== trustedWorkflow.id");
    expect(getGithubScript(revalidate)).toContain("publicInputs.length !== 1");
    expect(getGithubScript(revalidatePublish)).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(getGithubScript(revalidatePublish)).toContain("workflow_id: 'playwright.yml'");
    expect(getGithubScript(revalidatePublish)).toContain("liveRun.path !== expectedWorkflowPath");
    expect(clone.env?.HOSTING_PAGES_TOKEN).toBe(githubExpression("secrets.REPORT_PUBLISHER_HOSTING_PAGES_TOKEN"));
    expect(JSON.stringify(steps.slice(0, credentialIndex))).not.toContain("HOSTING_PAGES_TOKEN");
    expect(publishStep.run).toContain(
      `hosting-pages/${interpolation("E2E_REPORT_DIR")}/pr-${interpolation("PR_NUMBER")}`,
    );
    expect(publishStep.run).toContain("git add --");
    expect(publishStep.run).toContain("pushHostingPagesWithRetry.sh");
    expect(publishStep.run).toContain("deploy-marker-");
    expect(wait.run).toContain("deploy-marker-");
    expect(wait.run).toContain("curl --fail");
    expect(downloadedArtifactNames).toEqual([
      `playwright-public-input-${githubExpression("needs.validate-source.outputs.run_attempt")}`,
      "trusted-playwright-public-report",
    ]);
    expect(downloadedArtifactNames).not.toContain(
      `playwright-report-${githubExpression("needs.validate-source.outputs.run_attempt")}`,
    );
    expect(source).toContain("trace・動画・スクリーンショットはActionsの非公開artifactだけ");
  });

  it("writes a separate E2E PR comment with the legacy summary layout and hosting URL", () => {
    const { workflow } = readWorkflow("publish-playwright-report.yml");
    const comment = getJob(workflow, "comment");
    const script = getGithubScript(findStep(getSteps(comment), "Comment PR with trusted Playwright result"));

    expect(comment.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
      "pull-requests": "write",
    });
    expect(script).toContain("<!-- shiftori-playwright-report:v1 -->");
    expect(script).toContain("<!-- shiftori-playwright-state:");
    expect(script).toContain("<!-- shiftori-vrt-report:v1 -->");
    expect(script).toContain("Results: Passed");
    expect(script).toContain("### 失敗したテスト");
    expect(script).toContain("<summary>すべてのテスト結果を表示</summary>");
    expect(script).toContain(
      `hosting-pages/${interpolation("process.env.E2E_REPORT_DIR")}/pr-${interpolation("issueNumber")}/`,
    );
    expect(script).toContain(`hosting-pages/yps-crispy-carnival/${interpolation("issueNumber")}/`);
    expect(script).toContain("legacyReportUrls.some");
    expect(script).toContain("Cloudflare Previewを開く");
    expect(script).toContain("実行結果・非公開artifact");
    expect(script).toContain("E2E Actionsを見る");
    expect(script).toContain("E2E環境: Convex");
    expect(script).toContain("report?.e2eDeployment");
    expect(script).toContain("workflow_id: 'playwright.yml'");
    expect(script).toContain("trustedWorkflow.id === run.workflow_id");
    expect(script).toContain("trace・動画・スクリーンショットはActionsの非公開artifactだけ");
    expect(script).toContain("pullRequest.head.sha === run.head_sha");
    expect(script).toContain("latestSourceRun?.id === run.id");
    expect(script).toContain("!commentBody.includes(otherMarker)");
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

  it("runs VRT on pull requests and branches while keeping the artifact producer secretless", () => {
    const { source, workflow } = readWorkflow("vrt.yml");
    const prepare = getJob(workflow, "prepare");
    const build = getJob(workflow, "build");
    const capture = getJob(workflow, "capture");
    const compare = getJob(workflow, "compare");
    const prepareStep = findStep(getSteps(prepare), "Resolve VRT comparison target");
    const buildCheckout = getSteps(build).find((step) => step.uses === CHECKOUT_ACTION);
    const captureSteps = getSteps(capture);
    const captureCheckout = captureSteps.find((step) => step.uses === CHECKOUT_ACTION);
    const upload = findStep(captureSteps, "Upload VRT screenshot data");
    const compareSteps = getSteps(compare);
    const compareCheckout = compareSteps.find((step) => step.uses === CHECKOUT_ACTION);
    const clone = findStep(compareSteps, "Read published VRT baseline without credentials");
    const screenshotSafety = findStep(compareSteps, "Validate VRT screenshot data");
    const comparison = findStep(compareSteps, "Build credential-free VRT comparison");

    expect(workflow.on?.pull_request).toEqual({
      branches: ["develop", "main"],
      types: ["opened", "synchronize", "reopened", "edited"],
    });
    expect(workflow.on?.push).toEqual({ branches: ["develop", "main"] });
    expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(workflow.concurrency).toEqual({
      group: `vrt-${githubExpression("github.event.pull_request.number || github.ref_name")}`,
      "cancel-in-progress": true,
    });
    expect(buildCheckout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
    expect(captureCheckout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
    expect(compareCheckout?.with).toMatchObject({
      ref: githubExpression("github.event.pull_request.head.sha || github.sha"),
      "persist-credentials": false,
    });
    expect(getGithubScript(prepareStep)).toContain("pull?.base?.ref");
    expect(upload.with).toMatchObject({
      name: `vrt-actual-${githubExpression("matrix.shard")}`,
      path: "vrt-actual/",
      "if-no-files-found": "error",
      overwrite: true,
      "retention-days": 3,
    });
    expect(clone.run).toBe(
      "git clone --depth 1 --single-branch https://github.com/yn1323/hosting-pages.git hosting-pages",
    );
    expect(screenshotSafety.run).toContain("--profile vrt-screenshots");
    expect(comparison.run).toContain("reg-suit compare -c regconfig.artifact.json");
    expect(JSON.stringify([prepare, build, capture, compare])).not.toContain("${{ secrets.");
    expect(source).not.toContain("HOSTING_PAGES_TOKEN");
    expect(source).not.toContain("issues: write");
    expect(source).not.toContain("pull-requests: write");
    expect(source).not.toContain("pushHostingPagesWithRetry.sh");
    expect(source).not.toContain("shiftori-vrt-report:v1");
    expect(source).not.toContain("workflow_run");
    expect(workflow.jobs?.approve).toBeUndefined();
  });

  it("publishes VRT artifacts only after trusted source and artifact validation", () => {
    const { workflow } = readWorkflow("publish-vrt-report.yml");
    const workflowRun = workflow.on?.workflow_run as { workflows?: string[]; types?: string[] };
    const validate = getJob(workflow, "validate-source");
    const validateScript = getGithubScript(
      findStep(getSteps(validate), "Validate source workflow metadata and artifact declarations"),
    );
    const approval = getJob(workflow, "approve-pr-publication");
    const approvalStep = findStep(getSteps(approval), "Approve current trusted VRT differences");
    const publicationComment = getJob(workflow, "comment-publication-result");
    const approvedComment = getJob(workflow, "comment-after-approval");
    const publish = getJob(workflow, "publish");
    const steps = getSteps(publish);
    const checkout = findStep(steps, "Checkout trusted VRT publisher");
    const download = findStep(steps, "Download VRT screenshot data");
    const screenshotSafety = findStep(steps, "Validate VRT screenshot data");
    const screenshotScan = findStep(steps, "Scan VRT screenshot data");
    const revalidate = findStep(steps, "Revalidate VRT source immediately before credentials");
    const clone = findStep(steps, "Read VRT Pages without credentials");
    const buildReport = findStep(steps, "Build VRT report with trusted code");
    const readCounts = findStep(steps, "Read trusted VRT result counts");
    const reportSafety = findStep(steps, "Validate generated VRT report");
    const reportScan = findStep(steps, "Scan generated VRT report");
    const revalidatePublish = findStep(steps, "Revalidate VRT source immediately before publish");
    const publishStep = findStep(steps, "Publish trusted VRT report and baseline");
    const wait = findStep(steps, "Wait for trusted VRT report deploy");
    const credentialIndex = steps.indexOf(publishStep);
    const statusWriteJobs = Object.entries(workflow.jobs ?? {})
      .filter(([, job]) => job.permissions?.statuses === "write")
      .map(([name]) => name)
      .sort();

    expect(workflowRun).toEqual({ workflows: ["VRT Artifact"], types: ["in_progress", "completed"] });
    expect(workflow.concurrency).toEqual({
      group: `publish-vrt-${githubExpression("github.event.workflow_run.workflow_id")}-${githubExpression("github.event.workflow_run.pull_requests[0].number || github.event.workflow_run.head_branch")}`,
      "cancel-in-progress": true,
    });
    expect(statusWriteJobs).toEqual(["comment-after-approval", "comment-publication-result", "comment-source-status"]);
    expect(validate.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(validate.if).toContain("github.event.workflow_run.head_repository.full_name == github.repository");
    expect(validateScript).toContain("pullRequest.state !== 'open'");
    expect(validateScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(validateScript).toContain("branch.commit.sha !== run.head_sha");
    expect(validateScript).toContain("workflow_id: 'vrt.yml'");
    expect(validateScript).toContain("run.path !== expectedWorkflowPath");
    expect(validateScript).toContain("trustedWorkflow.id !== run.workflow_id");
    expect(validateScript).toContain("liveRun.path !== expectedWorkflowPath");
    expect(validateScript).toContain("listWorkflowRunsForWorkflow");
    expect(validateScript).toContain("latestSourceRun?.id !== run.id");
    expect(validateScript).toContain("['vrt-actual-1', 'vrt-actual-2', 'vrt-actual-3', 'vrt-actual-4']");
    expect(validateScript).toContain("200 * 1024 * 1024");
    expect(validateScript).toContain("totalBytes > 500 * 1024 * 1024");
    expect(publish.needs).toBe("validate-source");
    expect(publish.if).not.toContain("approve-pr-publication");
    expect(publish.environment).toBe("Report Publisher");
    expect(publicationComment.needs).toEqual(["comment-source-status", "validate-source", "publish"]);
    expect(approval.needs).toEqual(["validate-source", "publish", "comment-publication-result"]);
    expect(approval.if).toContain("needs.validate-source.outputs.pull_number != ''");
    expect(approval.if).toContain("needs.publish.outputs.report_deployed == 'true'");
    expect(approval.if).toContain("needs.publish.outputs.report_has_diff == 'true'");
    expect(approval.if).toContain("needs.comment-publication-result.result == 'success'");
    expect(approval.environment).toEqual({
      name: "vrt-approval",
      url: `${githubExpression("needs.validate-source.outputs.report_url")}?v=${githubExpression("github.run_id")}-${githubExpression("github.run_attempt")}`,
    });
    expect(approval.concurrency).toEqual({
      group: `vrt-approval-pr-${githubExpression("needs.validate-source.outputs.pull_number")}`,
      "cancel-in-progress": true,
    });
    expect(approval.permissions).toEqual({ actions: "read", contents: "read", "pull-requests": "read" });
    expect(getGithubScript(approvalStep)).toContain("workflow_id: 'vrt.yml'");
    expect(getGithubScript(approvalStep)).toContain("latestSourceRun?.id !== run.id");
    expect(approvedComment.needs).toEqual([
      "validate-source",
      "publish",
      "comment-publication-result",
      "approve-pr-publication",
    ]);
    expect(checkout.with).toMatchObject({
      ref: githubExpression("github.sha"),
      "persist-credentials": false,
    });
    expect(download.with).toMatchObject({
      pattern: "vrt-actual-*",
      path: "vrt-actual",
      "merge-multiple": true,
      "run-id": githubExpression("github.event.workflow_run.id"),
      "github-token": githubExpression("github.token"),
    });
    expect(screenshotSafety.run).toContain("--profile vrt-screenshots");
    expect(screenshotScan.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(getGithubScript(revalidate)).toContain("latestSourceRun?.id !== run.id");
    expect(getGithubScript(revalidate)).toContain("workflow_id: 'vrt.yml'");
    expect(getGithubScript(revalidate)).toContain("liveRun.path !== expectedWorkflowPath");
    expect(getGithubScript(revalidate)).toContain("actualNames.some");
    expect(JSON.stringify(steps.slice(0, credentialIndex))).not.toContain("HOSTING_PAGES_TOKEN");
    expect(clone.env?.HOSTING_PAGES_TOKEN).toBeUndefined();
    expect(clone.run).toBe(
      "git clone --depth 1 --single-branch https://github.com/yn1323/hosting-pages.git hosting-pages",
    );
    expect(buildReport.run).toContain("reg-suit compare -c regconfig.artifact.json");
    expect(readCounts.run).toContain("changed_count");
    expect(readCounts.run).toContain("passed_count");
    expect(reportSafety.run).toContain("--profile vrt-report");
    expect(reportScan.run).toContain("assertNoSensitiveArtifacts.mjs");
    expect(getGithubScript(revalidatePublish)).toContain("latestSourceRun?.id !== run.id");
    expect(getGithubScript(revalidatePublish)).toContain("workflow_id: 'vrt.yml'");
    expect(getGithubScript(revalidatePublish)).toContain("trustedWorkflow.id !== run.workflow_id");
    expect(publishStep.run).toContain(
      `hosting-pages/${interpolation("VRT_REPORT_DIR")}/${interpolation("REPORT_KEY")}`,
    );
    expect(publishStep.run).toContain("git add --");
    expect(publishStep.env?.HOSTING_PAGES_TOKEN).toBe(githubExpression("secrets.REPORT_PUBLISHER_HOSTING_PAGES_TOKEN"));
    expect(publishStep.run).toContain(`x-access-token:${interpolation("HOSTING_PAGES_TOKEN")}`);
    expect(publishStep.run).toContain("pushHostingPagesWithRetry.sh");
    expect(publishStep.run).toContain("deploy-marker-");
    expect(wait.run).toContain("deploy-marker-");
    expect(wait.run).toContain("curl -sf");
  });

  it("requires explicit vrt-approval only after the trusted diff report is published and commented", () => {
    const { workflow } = readWorkflow("publish-vrt-report.yml");
    const approve = getJob(workflow, "approve-pr-publication");

    expect(approve.needs).toEqual(["validate-source", "publish", "comment-publication-result"]);
    expect(approve.if).toContain("needs.publish.outputs.report_deployed == 'true'");
    expect(approve.if).toContain("needs.publish.outputs.report_has_diff == 'true'");
    expect(approve.if).toContain("needs.comment-publication-result.result == 'success'");
    expect(approve.environment).toEqual({
      name: "vrt-approval",
      url: `${githubExpression("needs.validate-source.outputs.report_url")}?v=${githubExpression("github.run_id")}-${githubExpression("github.run_attempt")}`,
    });
  });

  it("writes a separate VRT PR comment with counts, hosting URL, Actions, and approval status", () => {
    const { workflow } = readWorkflow("publish-vrt-report.yml");
    const sourceStatus = getJob(workflow, "comment-source-status");
    const sourceScript = getGithubScript(findStep(getSteps(sourceStatus), "Comment PR with VRT source status"));
    const finalComment = getJob(workflow, "comment-publication-result");
    const finalScript = getGithubScript(
      findStep(getSteps(finalComment), "Comment PR with trusted VRT publication result"),
    );
    const approvedComment = getJob(workflow, "comment-after-approval");
    const approvedScript = getGithubScript(
      findStep(getSteps(approvedComment), "Mark trusted VRT differences as approved"),
    );

    for (const job of [sourceStatus, finalComment, approvedComment]) {
      expect(job.permissions).toEqual({
        actions: "read",
        contents: "read",
        issues: "write",
        "pull-requests": "write",
        statuses: "write",
      });
      expect(job.concurrency).toEqual({
        group: `vrt-status-${githubExpression("github.event.workflow_run.workflow_id")}-${githubExpression("github.event.workflow_run.pull_requests[0].number")}`,
        "cancel-in-progress": false,
      });
    }
    expect(sourceScript).toContain("<!-- shiftori-vrt-report:v1 -->");
    expect(sourceScript).toContain("<!-- shiftori-playwright-report:v1 -->");
    expect(sourceScript).toContain("差分: Changed - / New - / Deleted -");
    expect(sourceScript).toContain("Passed: -");
    expect(sourceScript).toContain("実行中（capture / 比較）");
    expect(sourceScript).toContain("sha: run.head_sha");
    expect(sourceScript).toContain("state: sourceGateState");
    expect(sourceScript).toContain("context: 'shiftori/vrt-approval'");
    expect(sourceScript).toContain("gatePullRequest.head.sha !== run.head_sha");
    expect(sourceScript).toContain("!(await sourceRunIsCurrent())");
    expect(sourceScript).toContain("body.includes(reportUrl)");
    expect(finalScript).toContain("<!-- shiftori-vrt-report:v1 -->");
    expect(finalScript).toContain("<!-- shiftori-vrt-state:");
    expect(finalScript).toContain("<!-- shiftori-playwright-report:v1 -->");
    expect(finalScript).toContain("差分: Changed ${countValues.changed");
    expect(finalScript).toContain("Passed: ${countValues.passed");
    expect(finalScript).toContain("hosting-pagesで差分レポートを見る");
    expect(finalScript).toContain("差分あり（承認待ち）");
    expect(finalScript).toContain("VRT差分を確認・承認する");
    expect(finalScript).toContain("VRT実行: [source Actionsを見る]");
    expect(finalScript).toContain("Trusted publisher: [Actionsを見る]");
    expect(finalScript).toContain("yn1323/hosting-pages:main");
    expect(finalScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(finalScript).toContain("latestSourceRun?.id === run.id");
    expect(finalScript).toContain("!body.includes(otherMarker)");
    expect(finalScript).toContain("sha: expectedHeadSha");
    expect(finalScript).toContain("state: gateState");
    expect(finalScript).toContain("hasDiff ? 'pending' : 'success'");
    expect(finalScript).toContain("context: 'shiftori/vrt-approval'");
    expect(finalScript).toContain("gatePullRequest.head.sha !== expectedHeadSha");
    expect(finalScript).toContain("body.includes(plannedReportUrl)");
    expect(approvedScript).toContain("差分あり（承認済み）");
    expect(approvedScript).toContain("承認済みjobを見る");
    expect(approvedScript).toContain("workflow_id: 'vrt.yml'");
    expect(approvedScript).toContain("run.workflow_id === trustedWorkflow.id");
    expect(approvedScript).toContain("sha: expectedHeadSha");
    expect(approvedScript).toContain("state: 'success'");
    expect(approvedScript).toContain("context: 'shiftori/vrt-approval'");
  });

  it("retains both workflow_run report publishers and removes only obsolete preview publishers", () => {
    for (const filename of ["publish-playwright-report.yml", "publish-vrt-report.yml"]) {
      expect(existsSync(path.join(REPOSITORY_ROOT, ".github/workflows", filename))).toBe(true);
      expect(readWorkflow(filename).source).toContain("workflow_run");
    }
    for (const filename of ["pr-preview.yml", "publish-pr-preview.yml"]) {
      expect(existsSync(path.join(REPOSITORY_ROOT, ".github/workflows", filename))).toBe(false);
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
    expect(validate.with?.["github-token"]).toBe(githubExpression("github.token"));
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
