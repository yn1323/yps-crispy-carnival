#!/usr/bin/env tsx

import process from "node:process";

const API_BASE_URL = "https://api.convex.dev/v1";
const TARGET_NAME_PATTERN = /^pr-\d+-(deploy|e2e)$/;

type DeploymentRecord = Record<string, unknown>;

type Options = {
  dryRun: boolean;
  names: string[];
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

const getDeploymentIdentifiers = (deployment: DeploymentRecord) => {
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

const getDeploymentName = (deployment: DeploymentRecord) =>
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

    if (arg === "--help") {
      console.log("Usage: tsx scripts/deleteConvexPreviews.ts --names pr-123-deploy,pr-123-e2e [--dry-run]");
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.names.push(...splitNames(arg));
  }

  return options;
};

const getTargetNames = (names: string[]) => {
  const targetNames = [...new Set(names)];

  for (const name of targetNames) {
    if (!TARGET_NAME_PATTERN.test(name)) {
      throw new Error(`Refusing to delete unexpected Convex preview name: ${name}`);
    }
  }

  return targetNames;
};

const convexRequest = async <T>(method: "GET" | "POST", path: string, token: string) => {
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

const extractDeployments = (response: unknown) => {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (!isRecord(response)) {
    return [];
  }

  for (const key of ["deployments", "data", "result"]) {
    const value = response[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const targetNames = getTargetNames(options.names);
  const token = process.env.CONVEX_MANAGEMENT_TOKEN?.trim();
  const projectId = process.env.CONVEX_PROJECT_ID?.trim();

  if (targetNames.length === 0) {
    throw new Error("No Convex preview names were provided");
  }

  if (!token) {
    throw new Error("CONVEX_MANAGEMENT_TOKEN is required");
  }

  if (!projectId) {
    throw new Error("CONVEX_PROJECT_ID is required");
  }

  const deploymentsResponse = await convexRequest<unknown>(
    "GET",
    `/projects/${encodeURIComponent(projectId)}/list_deployments`,
    token,
  );
  const deployments = extractDeployments(deploymentsResponse);
  const deletedDeploymentNames = new Set<string>();

  for (const targetName of targetNames) {
    const matches = deployments.filter((deployment) => matchesTargetPreview(deployment, targetName));

    if (matches.length === 0) {
      console.log(`Convex preview not found: ${targetName}`);
      continue;
    }

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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
