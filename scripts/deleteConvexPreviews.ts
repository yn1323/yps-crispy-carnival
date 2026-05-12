#!/usr/bin/env tsx

import process from "node:process";
import { fileURLToPath } from "node:url";

const API_BASE_URL = "https://api.convex.dev/v1";
const TARGET_NAME_PATTERN = /^pr-\d+-(deploy|e2e)$/;

type DeploymentRecord = Record<string, unknown>;
type ProjectRecord = Record<string, unknown>;
type TokenDetailsRecord = Record<string, unknown>;

type Options = {
  dryRun: boolean;
  names: string[];
  projectId?: string;
  projectSlug?: string;
  teamId?: string;
};

const isRecord = (value: unknown): value is DeploymentRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const splitNames = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);

const getStringProperty = (record: DeploymentRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const getStringLikeProperty = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
};

const addIdentifierVariants = (identifiers: Set<string>, rawValue: string) => {
  const value = rawValue.trim();

  if (!value) {
    return;
  }

  identifiers.add(value);

  if (value.startsWith("preview/")) {
    identifiers.add(value.slice("preview/".length));
  }

  if (value.includes("/")) {
    const parts = value.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1];

    if (lastPart) {
      identifiers.add(lastPart);
    }
  }
};

export const getDeploymentIdentifiers = (deployment: DeploymentRecord) => {
  const identifiers = new Set<string>();
  const identifierKeys = [
    "previewName",
    "preview_name",
    "previewIdentifier",
    "preview_identifier",
    "identifier",
    "reference",
    "ref",
    "deploymentReference",
    "deployment_reference",
    "name",
  ];

  for (const key of identifierKeys) {
    const value = deployment[key];

    if (typeof value === "string") {
      addIdentifierVariants(identifiers, value);
    }
  }

  return identifiers;
};

export const getDeploymentName = (deployment: DeploymentRecord) =>
  getStringProperty(deployment, ["deploymentName", "deployment_name", "slug", "name"]);

const getDeploymentType = (deployment: DeploymentRecord) =>
  getStringProperty(deployment, ["deploymentType", "deployment_type", "type", "kind"])?.toLowerCase();

const isSafeDeploymentName = (deploymentName: string) => {
  const normalizedName = deploymentName.toLowerCase();

  return !["prod", "production", "dev", "development"].includes(normalizedName);
};

const matchesTargetPreview = (deployment: DeploymentRecord, targetName: string) => {
  const identifiers = getDeploymentIdentifiers(deployment);

  if (!identifiers.has(targetName)) {
    return false;
  }

  const deploymentType = getDeploymentType(deployment);

  if (deploymentType && deploymentType !== "preview") {
    return false;
  }

  return true;
};

export const collectTargetPreviewMatches = (deployments: DeploymentRecord[], targetNames: string[]) => {
  const matchesByTarget = new Map<string, DeploymentRecord[]>();
  const missingTargetNames: string[] = [];

  for (const targetName of targetNames) {
    const matches = deployments.filter((deployment) => matchesTargetPreview(deployment, targetName));

    if (matches.length === 0) {
      missingTargetNames.push(targetName);
    } else {
      matchesByTarget.set(targetName, matches);
    }
  }

  return { matchesByTarget, missingTargetNames };
};

const parseArgs = (args: string[]): Options => {
  const options: Options = {
    dryRun: false,
    names: [],
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--names") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--names requires a value");
      }

      options.names.push(...splitNames(value));
      index++;
      continue;
    }

    if (arg.startsWith("--names=")) {
      options.names.push(...splitNames(arg.slice("--names=".length)));
      continue;
    }

    if (arg === "--project-id") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--project-id requires a value");
      }

      options.projectId = value.trim();
      index++;
      continue;
    }

    if (arg.startsWith("--project-id=")) {
      options.projectId = arg.slice("--project-id=".length).trim();
      continue;
    }

    if (arg === "--project-slug") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--project-slug requires a value");
      }

      options.projectSlug = value.trim();
      index++;
      continue;
    }

    if (arg.startsWith("--project-slug=")) {
      options.projectSlug = arg.slice("--project-slug=".length).trim();
      continue;
    }

    if (arg === "--team-id") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--team-id requires a value");
      }

      options.teamId = value.trim();
      index++;
      continue;
    }

    if (arg.startsWith("--team-id=")) {
      options.teamId = arg.slice("--team-id=".length).trim();
      continue;
    }

    if (arg === "--help") {
      console.log(
        "Usage: tsx scripts/deleteConvexPreviews.ts --project-slug dev-yps-crispy-carnival --names pr-123-deploy,pr-123-e2e [--dry-run]",
      );
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.names.push(...splitNames(arg));
  }

  return options;
};

export const getTargetNames = (names: string[]) => {
  const targetNames = [...new Set(names)];

  for (const name of targetNames) {
    if (!TARGET_NAME_PATTERN.test(name)) {
      throw new Error(`Refusing to delete unexpected Convex preview name: ${name}`);
    }
  }

  return targetNames;
};

export const convexRequest = async <T>(method: "GET" | "POST", path: string, token: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Convex Management API ${method} ${path} failed with ${response.status}: ${body}`);
  }

  const body = await response.text();

  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
};

const extractRecords = <T extends Record<string, unknown>>(response: unknown, keys: string[]) => {
  if (Array.isArray(response)) {
    return response.filter(isRecord) as T[];
  }

  if (!isRecord(response)) {
    return [];
  }

  for (const key of keys) {
    const value = response[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord) as T[];
    }
  }

  return [];
};

const extractDeployments = (response: unknown) =>
  extractRecords<DeploymentRecord>(response, ["deployments", "data", "result"]);

const extractProjects = (response: unknown) => extractRecords<ProjectRecord>(response, ["projects", "data", "result"]);

const getTeamIdFromToken = async (token: string) => {
  const tokenDetails = await convexRequest<TokenDetailsRecord>("GET", "/token_details", token);
  const teamId = getStringLikeProperty(tokenDetails, ["teamId", "team_id"]);

  if (!teamId) {
    throw new Error("CONVEX_TEAM_ID is required when CONVEX_PROJECT_SLUG is used with a token that has no teamId");
  }

  return teamId;
};

const resolveProjectId = async ({
  token,
  projectId,
  projectSlug,
  teamId,
}: {
  token: string;
  projectId?: string;
  projectSlug?: string;
  teamId?: string;
}) => {
  if (!projectSlug) {
    if (!projectId) {
      throw new Error("CONVEX_PROJECT_ID or CONVEX_PROJECT_SLUG is required");
    }

    return { projectId, projectLabel: projectId };
  }

  const resolvedTeamId = teamId ?? (await getTeamIdFromToken(token));
  const projectsResponse = await convexRequest<unknown>(
    "GET",
    `/teams/${encodeURIComponent(resolvedTeamId)}/list_projects`,
    token,
  );
  const projects = extractProjects(projectsResponse);
  const project = projects.find((candidate) => {
    const candidateSlug = getStringLikeProperty(candidate, ["slug"]);
    const candidateName = getStringLikeProperty(candidate, ["name"]);

    return candidateSlug === projectSlug || candidateName === projectSlug;
  });

  if (!project) {
    throw new Error(`Convex project not found for slug: ${projectSlug}`);
  }

  const resolvedProjectId = getStringLikeProperty(project, ["id", "projectId", "project_id"]);

  if (!resolvedProjectId) {
    throw new Error(`Convex project ${projectSlug} did not include a project id`);
  }

  if (projectId && projectId !== resolvedProjectId) {
    throw new Error(
      `CONVEX_PROJECT_ID (${projectId}) does not match CONVEX_PROJECT_SLUG ${projectSlug} (${resolvedProjectId})`,
    );
  }

  return { projectId: resolvedProjectId, projectLabel: `${projectSlug} (${resolvedProjectId})` };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const targetNames = getTargetNames(options.names);
  const token = process.env.CONVEX_MANAGEMENT_TOKEN?.trim();
  const projectId = options.projectId ?? process.env.CONVEX_PROJECT_ID?.trim();
  const projectSlug = options.projectSlug ?? process.env.CONVEX_PROJECT_SLUG?.trim();
  const teamId = options.teamId ?? process.env.CONVEX_TEAM_ID?.trim();

  if (targetNames.length === 0) {
    throw new Error("No Convex preview names were provided");
  }

  if (!token) {
    throw new Error("CONVEX_MANAGEMENT_TOKEN is required");
  }

  const resolvedProject = await resolveProjectId({ token, projectId, projectSlug, teamId });
  console.log(`Looking for Convex previews in project ${resolvedProject.projectLabel}`);

  const deploymentsResponse = await convexRequest<unknown>(
    "GET",
    `/projects/${encodeURIComponent(resolvedProject.projectId)}/list_deployments?deploymentType=preview`,
    token,
  );
  const deployments = extractDeployments(deploymentsResponse);
  const deletedDeploymentNames = new Set<string>();
  const { matchesByTarget, missingTargetNames } = collectTargetPreviewMatches(deployments, targetNames);

  if (missingTargetNames.length > 0) {
    throw new Error(
      `Convex preview not found: ${missingTargetNames.join(", ")}. Checked project ${resolvedProject.projectLabel}.`,
    );
  }

  for (const [targetName, matches] of matchesByTarget) {
    for (const deployment of matches) {
      const deploymentName = getDeploymentName(deployment);

      if (!deploymentName) {
        console.log(`Convex preview matched ${targetName}, but deployment name was not found. Skipping.`);
        continue;
      }

      if (!isSafeDeploymentName(deploymentName)) {
        throw new Error(`Refusing to delete protected Convex deployment: ${deploymentName}`);
      }

      if (deletedDeploymentNames.has(deploymentName)) {
        continue;
      }

      if (options.dryRun) {
        console.log(`[dry-run] Would delete Convex preview ${targetName}: ${deploymentName}`);
      } else {
        await convexRequest<unknown>("POST", `/deployments/${encodeURIComponent(deploymentName)}/delete`, token);
        console.log(`Deleted Convex preview ${targetName}: ${deploymentName}`);
      }

      deletedDeploymentNames.add(deploymentName);
    }
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
