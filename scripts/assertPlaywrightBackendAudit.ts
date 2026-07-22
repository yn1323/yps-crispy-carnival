#!/usr/bin/env tsx

import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPECTED_MANAGER_EMAIL_COUNT = 6;
const COUNT_FIELDS = [
  "requestedManagerEmailCount",
  "matchedManagerEmailCount",
  "missingManagerEmailCount",
  "managerEmailWithoutShopCount",
  "auditedShopCount",
  "auditedOrganizationCount",
  "unexpectedUnresolvedFailureInboxCount",
  "duplicateActiveDedupeKeyCount",
] as const;

type CountField = (typeof COUNT_FIELDS)[number];

export type PlaywrightBackendAudit = Record<CountField, number> & {
  notificationContexts: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parsePlaywrightBackendAudit = (value: unknown): PlaywrightBackendAudit => {
  if (!isRecord(value)) {
    throw new Error("Full Regression backend audit must be an object");
  }

  const counts = {} as Record<CountField, number>;
  for (const field of COUNT_FIELDS) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw new Error(`Full Regression backend audit field ${field} must be a non-negative integer`);
    }
    counts[field] = count as number;
  }

  if (
    !Array.isArray(value.notificationContexts) ||
    !value.notificationContexts.every((item) => typeof item === "string")
  ) {
    throw new Error("Full Regression backend audit field notificationContexts must be a string array");
  }

  return {
    ...counts,
    notificationContexts: value.notificationContexts,
  };
};

export const getPlaywrightBackendAuditFailures = (audit: PlaywrightBackendAudit): string[] => {
  const failures: string[] = [];

  if (audit.requestedManagerEmailCount !== EXPECTED_MANAGER_EMAIL_COUNT) {
    failures.push(`requestedManagerEmailCount must be ${EXPECTED_MANAGER_EMAIL_COUNT}`);
  }
  if (audit.matchedManagerEmailCount + audit.missingManagerEmailCount !== audit.requestedManagerEmailCount) {
    failures.push("matchedManagerEmailCount plus missingManagerEmailCount must equal requestedManagerEmailCount");
  }
  if (audit.managerEmailWithoutShopCount > audit.matchedManagerEmailCount) {
    failures.push("managerEmailWithoutShopCount must not exceed matchedManagerEmailCount");
  }
  if (audit.auditedShopCount <= 0) {
    failures.push("auditedShopCount must be greater than zero");
  }
  if (audit.auditedOrganizationCount <= 0) {
    failures.push("auditedOrganizationCount must be greater than zero");
  }
  if (audit.unexpectedUnresolvedFailureInboxCount !== 0) {
    failures.push("unexpectedUnresolvedFailureInboxCount must be zero");
  }
  if (audit.duplicateActiveDedupeKeyCount !== 0) {
    failures.push("duplicateActiveDedupeKeyCount must be zero");
  }

  const normalizedNotificationContexts = [...new Set(audit.notificationContexts)].sort();
  if (
    normalizedNotificationContexts.length !== audit.notificationContexts.length ||
    normalizedNotificationContexts.some((context, index) => context !== audit.notificationContexts[index])
  ) {
    failures.push("notificationContexts must contain unique values in sorted order");
  }
  const notificationContextCount = audit.notificationContexts.length;
  const hasUnexpectedFailures = audit.unexpectedUnresolvedFailureInboxCount > 0;
  if (
    (hasUnexpectedFailures &&
      (notificationContextCount === 0 || notificationContextCount > audit.unexpectedUnresolvedFailureInboxCount)) ||
    (!hasUnexpectedFailures && notificationContextCount !== 0)
  ) {
    failures.push("notificationContexts must correspond to unexpectedUnresolvedFailureInboxCount");
  }

  return failures;
};

export const assertPlaywrightBackendAudit = (value: unknown): PlaywrightBackendAudit => {
  const audit = parsePlaywrightBackendAudit(value);
  const failures = getPlaywrightBackendAuditFailures(audit);

  if (failures.length > 0) {
    throw new Error(`Full Regression backend audit failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  }

  return audit;
};

const main = () => {
  const [rawAudit, ...unexpectedArguments] = process.argv.slice(2);
  if (!rawAudit || unexpectedArguments.length > 0) {
    throw new Error("Usage: tsx scripts/assertPlaywrightBackendAudit.ts '<audit-json>'");
  }

  let parsedAudit: unknown;
  try {
    parsedAudit = JSON.parse(rawAudit);
  } catch {
    throw new Error("Full Regression backend audit is not valid JSON");
  }

  const audit = assertPlaywrightBackendAudit(parsedAudit);
  console.log(
    [
      "Full Regression backend audit passed:",
      `requestedManagers=${audit.requestedManagerEmailCount}`,
      `missingManagers=${audit.missingManagerEmailCount}`,
      `managersWithoutShop=${audit.managerEmailWithoutShopCount}`,
      `shops=${audit.auditedShopCount}`,
      `organizations=${audit.auditedOrganizationCount}`,
    ].join(" "),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
