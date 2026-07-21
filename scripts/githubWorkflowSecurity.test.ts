import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type WorkflowStep = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type WorkflowConcurrency = {
  group?: string;
  "cancel-in-progress"?: boolean;
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
  pullRequest?: Record<string, unknown>;
  branch?: Record<string, unknown>;
  artifacts?: Array<{ expired: boolean; name: string; size_in_bytes: number }>;
};

async function executePublisherSourceGate(scenario: PublisherSourceGateScenario) {
  const { workflow } = readWorkflow(scenario.workflowFilename);
  const gate = findStep(getSteps(getJob(workflow, "publish")), scenario.stepName);
  const failures: string[] = [];
  const github = {
    paginate: vi.fn(async () => scenario.artifacts ?? []),
    rest: {
      actions: { listWorkflowRunArtifacts: vi.fn() },
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

    expect(workflow.on?.pull_request).toBeUndefined();
    expect(workflow.on?.push).toMatchObject({ branches: ["develop"] });
    expect(checkout?.with?.ref).toBe(githubExpression("github.sha"));
    expect(source).toContain(githubExpression("secrets.CONVEX_DEPLOY_KEY"));
    expect(source).not.toContain("github.event.pull_request");
  });

  it.each(["pr-preview.yml", "test-ui.yml", "vrt.yml"])(
    "keeps PR producer %s free of secrets and write tokens",
    (filename) => {
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
    },
  );

  it("builds PR preview data from the exact head using public variables only", () => {
    const { source, workflow } = readWorkflow("pr-preview.yml");
    const job = getJob(workflow, "build-preview-artifact");
    const steps = getSteps(job);
    const checkout = steps.find((step) => step.uses === CHECKOUT_ACTION);
    const upload = steps.find((step) => step.uses === UPLOAD_ARTIFACT_ACTION);

    expect(job.environment).toBeUndefined();
    expect(checkout?.with?.ref).toBe(githubExpression("github.event.pull_request.head.sha"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(upload?.with).toMatchObject({ name: "pr-preview-dist", path: "dist/" });
    expect(source).toContain("vars.VITE_CONVEX_URL");
    expect(source).toContain("vars.VITE_CLERK_PUBLISHABLE_KEY");
    expect(source).not.toContain("CONVEX_DEPLOY_KEY");
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

    expect(workflow.on?.workflow_run).toMatchObject({ workflows: ["PR Preview Artifact"], types: ["completed"] });
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
    const comment = findStep(steps, "Comment PR with trusted VRT result");
    const artifactGateIndex = steps.findIndex((step) => step.name === "Validate VRT screenshot data");
    const privacyGateIndex = steps.findIndex((step) => step.name === "Scan VRT screenshot data");
    const credentialSourceGateIndex = steps.indexOf(credentialSourceGate);
    const publicationSourceGateIndex = steps.indexOf(publicationSourceGate);
    const publicationIndex = steps.indexOf(publication);
    const firstSecretIndex = steps.findIndex((step) => JSON.stringify(step).includes("${{ secrets."));

    expect(workflow.on?.workflow_run).toMatchObject({ workflows: ["VRT Artifact"], types: ["completed"] });
    expect(sourceScript).toContain("run.name !== 'VRT Artifact'");
    expect(sourceScript).toContain("pullRequest.head.sha !== run.head_sha");
    expect(sourceScript).toContain("branch.commit.sha !== run.head_sha");
    for (const name of ["vrt-actual-1", "vrt-actual-2", "vrt-actual-3", "vrt-actual-4"]) {
      expect(sourceScript).toContain(name);
    }
    expect(sourceScript).toContain("artifact.size_in_bytes <= 0");
    expect(sourceScript).toContain("artifact.size_in_bytes > 200 * 1024 * 1024");
    expect(sourceScript).toContain("totalBytes > 500 * 1024 * 1024");
    expect(sourceGate.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(checkout.with?.ref).toBe(githubExpression("github.sha"));
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(download.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(publish.concurrency).toEqual({
      group: `vrt-publication-${githubExpression(
        "needs.validate-source.outputs.pull_number != '' && format('pr-{0}', needs.validate-source.outputs.pull_number) || format('branch-{0}', needs.validate-source.outputs.baseline_ref)",
      )}`,
      "cancel-in-progress": false,
    });
    expect(credentialSourceGate.env).toMatchObject({
      EXPECTED_BASELINE_REF: githubExpression("needs.validate-source.outputs.baseline_ref"),
      EXPECTED_HEAD_SHA: githubExpression("needs.validate-source.outputs.head_sha"),
      EXPECTED_PULL_NUMBER: githubExpression("needs.validate-source.outputs.pull_number"),
      EXPECTED_REPORT_KEY: githubExpression("needs.validate-source.outputs.report_key"),
    });
    expect(credentialSourceScript).toContain("run.head_sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("pullRequest.state !== 'open'");
    expect(credentialSourceScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("branch.commit.sha !== expectedHeadSha");
    expect(credentialSourceScript).toContain("actualNames.some((name, index) => name !== expectedNames[index])");
    expect(publicationSourceScript).toContain("run.head_sha !== expectedHeadSha");
    expect(publicationSourceScript).toContain("pullRequest.state !== 'open'");
    expect(publicationSourceScript).toContain("pullRequest.head.sha !== expectedHeadSha");
    expect(publicationSourceScript).toContain("branch.commit.sha !== expectedHeadSha");
    expect(comment.with?.["github-token"]).toBe(githubExpression("github.token"));
    expect(getGithubScript(comment)).toContain("Trusted publication approved; differences published");
    expect(getGithubScript(comment)).not.toContain("Differences approved and published");
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
        },
        workflowRun: {
          id: 200,
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
      },
      workflowRun: {
        id: 200,
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

    expect(producerApproval.needs).toEqual(["prepare", "compare"]);
    expect(producerApproval.environment).toBe("vrt-approval");
    expect(producerApproval.if).toContain("needs.compare.outputs.has_diff == 'true'");
    expect(approval.needs).toBe("validate-source");
    expect(approval.environment).toBe("vrt-approval");
    expect(approval.if).toContain("needs.validate-source.outputs.should_publish == 'true'");
    expect(approval.if).toContain("needs.validate-source.outputs.pull_number != ''");
    expect(publish.needs).toEqual(["validate-source", "approve-pr-publication"]);
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
      version: "1.26.0",
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
