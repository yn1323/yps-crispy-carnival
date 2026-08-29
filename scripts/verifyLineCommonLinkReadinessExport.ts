#!/usr/bin/env tsx

import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX,
  LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT,
} from "../convex/constants";

type ExportRow = Record<string, unknown>;

export type LineCommonLinkVerificationInput = {
  organizations: ExportRow[];
  shops: ExportRow[];
  people: ExportRow[];
  staffs: ExportRow[];
  legacyAccounts: ExportRow[];
  providerUsers: ExportRow[];
  personLinks: ExportRow[];
  lineLinkTokens: ExportRow[];
  notificationOutbox: ExportRow[];
  fanoutJobs: ExportRow[];
};

export type LineCommonLinkReadinessReport = {
  ok: boolean;
  source: "convex_export";
  rolloutPath: "blocked" | "zero" | "staged";
  scheduledCallerCheck: "required_from_deployment";
  counts: {
    activeOrganizations: number;
    shops: number;
    activePeople: number;
    activeStaffs: number;
    activeLegacyAccounts: number;
    activeProviderUsers: number;
    activePersonLinks: number;
    oldUnusedTokens: number;
    activeLineOutboxWithoutGeneration: number;
    actionRequiredFanoutJobs: number;
  };
  anomalies: {
    organizationsWithMultipleShops: number;
    peopleWithMultipleActiveStaffs: number;
    personStaffHistoryOverLimit: number;
    activeStaffCanonicalReference: number;
    activeStaffTenantMismatch: number;
    activeLegacyDanglingStaff: number;
    legacyPeopleWithMultipleLineUsers: number;
    legacyOrganizationLineOwnershipConflict: number;
    legacyFriendshipConflict: number;
    legacyLineUsersOverLimit: number;
    legacyWithoutCanonicalCounterpart: number;
    canonicalPersonLinkDuplicate: number;
    canonicalProviderUserDuplicate: number;
    canonicalOrganizationLineOwnershipConflict: number;
    canonicalDanglingReference: number;
    canonicalTenantMismatch: number;
    canonicalGenerationMismatch: number;
    canonicalProviderWithoutLink: number;
    activeCanonicalLinkWithoutExactLegacyProjection: number;
    incompleteUnusedTokenSnapshots: number;
    incompleteActiveLineOutboxSnapshots: number;
    actionRequiredFanoutJobs: number;
  };
};

const execFile = promisify(execFileCallback);

const isRecord = (value: unknown): value is ExportRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireString(row: ExportRow, field: string, table: string) {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${table}.${field} must be a string`);
  return value;
}

function optionalString(row: ExportRow, field: string) {
  const value = row[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function active(row: ExportRow) {
  return row.isDeleted === false;
}

function groupValues(rows: ExportRow[], key: (row: ExportRow) => string | undefined) {
  const grouped = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function countDistinctGroupsWithMultipleValues(groups: Map<string, Set<string>>) {
  return [...groups.values()].filter((values) => values.size > 1).length;
}

/**
 * Export内の識別子は照合にだけ使い、reportには件数と有限状態だけを返す。
 * scheduled functionは通常のexport対象外なので、deployment上のbounded queryを別途必須とする。
 */
export function verifyLineCommonLinkReadiness(
  input: LineCommonLinkVerificationInput,
  now: number,
): LineCommonLinkReadinessReport {
  if (!Number.isFinite(now)) throw new Error("now must be a finite Unix timestamp");

  const organizations = new Map(
    input.organizations.map((row) => [requireString(row, "_id", "organizations"), row] as const),
  );
  const shops = new Map(input.shops.map((row) => [requireString(row, "_id", "shops"), row] as const));
  const people = new Map(input.people.map((row) => [requireString(row, "_id", "organizationPeople"), row] as const));
  const staffs = new Map(input.staffs.map((row) => [requireString(row, "_id", "staffs"), row] as const));
  const providers = new Map(
    input.providerUsers.map((row) => [requireString(row, "_id", "lineProviderUsers"), row] as const),
  );

  const activeOrganizations = input.organizations.filter(active);
  const availableShops = input.shops.filter(
    (row) => active(row) && (row.operatingStatus === undefined || row.operatingStatus === "active"),
  );
  const activePeople = input.people.filter((row) => row.status === "active");
  const activeStaffs = input.staffs.filter(active);
  const shopIds = new Set(availableShops.map((shop) => requireString(shop, "_id", "shops")));
  const shopStaffs = activeStaffs.filter((staff) => {
    const shopId = optionalString(staff, "shopId");
    return shopId !== undefined && shopIds.has(shopId);
  });
  const activeLegacyAccounts = input.legacyAccounts.filter(active);
  const activeProviderUsers = input.providerUsers.filter(active);
  const activePersonLinks = input.personLinks.filter(active);

  const shopsByOrganization = groupValues(availableShops, (row) => optionalString(row, "organizationId"));
  const activeStaffsByPerson = groupValues(shopStaffs, (row) => optionalString(row, "organizationPersonId"));
  const staffHistoryByPerson = groupValues(activeStaffs, (row) => optionalString(row, "organizationPersonId"));
  const organizationsWithMultipleShops = activeOrganizations.filter(
    (organization) => (shopsByOrganization.get(requireString(organization, "_id", "organizations"))?.length ?? 0) > 1,
  ).length;
  const peopleWithMultipleActiveStaffs = activePeople.filter(
    (person) => (activeStaffsByPerson.get(requireString(person, "_id", "organizationPeople"))?.length ?? 0) > 1,
  ).length;
  const personStaffHistoryOverLimit = activePeople.filter(
    (person) =>
      (staffHistoryByPerson.get(requireString(person, "_id", "organizationPeople"))?.length ?? 0) >
      LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT,
  ).length;

  let activeStaffCanonicalReference = 0;
  let activeStaffTenantMismatch = 0;
  for (const staff of activeStaffs) {
    const organizationId = optionalString(staff, "organizationId");
    const personId = optionalString(staff, "organizationPersonId");
    const shopId = optionalString(staff, "shopId");
    const organization = organizationId ? organizations.get(organizationId) : undefined;
    const person = personId ? people.get(personId) : undefined;
    const shop = shopId ? shops.get(shopId) : undefined;
    if (!organization || !active(organization) || !person || person.status !== "active" || !shop || !active(shop)) {
      activeStaffCanonicalReference += 1;
      continue;
    }
    if (person.organizationId !== organizationId || shop.organizationId !== organizationId) {
      activeStaffTenantMismatch += 1;
    }
  }

  const legacyLineUsersByPerson = new Map<string, Set<string>>();
  const legacyOwnersByOrganizationLine = new Map<string, Set<string>>();
  const legacyFollowingByLine = new Map<string, Set<string>>();
  const legacyCountByLine = new Map<string, number>();
  const activeLinksByPerson = groupValues(activePersonLinks, (row) => optionalString(row, "organizationPersonId"));
  let activeLegacyDanglingStaff = 0;
  let legacyWithoutCanonicalCounterpart = 0;

  for (const account of activeLegacyAccounts) {
    const staffId = optionalString(account, "staffId");
    const lineUserId = optionalString(account, "lineUserId");
    const staff = staffId ? staffs.get(staffId) : undefined;
    const organizationId = staff && active(staff) ? optionalString(staff, "organizationId") : undefined;
    const personId = staff && active(staff) ? optionalString(staff, "organizationPersonId") : undefined;
    if (!staff || !active(staff) || !organizationId || !personId || !lineUserId) {
      activeLegacyDanglingStaff += 1;
      legacyWithoutCanonicalCounterpart += 1;
      continue;
    }

    const personLines = legacyLineUsersByPerson.get(personId) ?? new Set<string>();
    personLines.add(lineUserId);
    legacyLineUsersByPerson.set(personId, personLines);
    const ownerKey = `${organizationId}\u0000${lineUserId}`;
    const owners = legacyOwnersByOrganizationLine.get(ownerKey) ?? new Set<string>();
    owners.add(personId);
    legacyOwnersByOrganizationLine.set(ownerKey, owners);
    const followingStates = legacyFollowingByLine.get(lineUserId) ?? new Set<string>();
    followingStates.add(String(account.following));
    legacyFollowingByLine.set(lineUserId, followingStates);
    legacyCountByLine.set(lineUserId, (legacyCountByLine.get(lineUserId) ?? 0) + 1);

    const links = activeLinksByPerson.get(personId) ?? [];
    const link = links.length === 1 ? links[0] : undefined;
    const providerId = link ? optionalString(link, "lineProviderUserId") : undefined;
    const provider = providerId ? providers.get(providerId) : undefined;
    if (
      !link ||
      link.organizationId !== organizationId ||
      !provider ||
      !active(provider) ||
      provider.lineUserId !== lineUserId ||
      provider.following !== account.following
    ) {
      legacyWithoutCanonicalCounterpart += 1;
    }
  }

  const canonicalOwnersByOrganizationLine = new Map<string, Set<string>>();
  let canonicalDanglingReference = 0;
  let canonicalTenantMismatch = 0;
  let canonicalGenerationMismatch = 0;
  for (const link of activePersonLinks) {
    const organizationId = optionalString(link, "organizationId");
    const personId = optionalString(link, "organizationPersonId");
    const providerId = optionalString(link, "lineProviderUserId");
    const organization = organizationId ? organizations.get(organizationId) : undefined;
    const person = personId ? people.get(personId) : undefined;
    const provider = providerId ? providers.get(providerId) : undefined;
    if (
      !organization ||
      !active(organization) ||
      !person ||
      person.status !== "active" ||
      !provider ||
      !active(provider)
    ) {
      canonicalDanglingReference += 1;
      continue;
    }
    if (person.organizationId !== organizationId) canonicalTenantMismatch += 1;
    if ((person.lineLinkGeneration ?? 0) !== link.generation) canonicalGenerationMismatch += 1;
    const lineUserId = optionalString(provider, "lineUserId");
    if (lineUserId && organizationId && personId) {
      const key = `${organizationId}\u0000${lineUserId}`;
      const owners = canonicalOwnersByOrganizationLine.get(key) ?? new Set<string>();
      owners.add(personId);
      canonicalOwnersByOrganizationLine.set(key, owners);
    }
  }

  const activeLinksByProvider = groupValues(activePersonLinks, (row) => optionalString(row, "lineProviderUserId"));
  const activeProvidersByLineUser = groupValues(activeProviderUsers, (row) => optionalString(row, "lineUserId"));
  const activeLegacyAccountsByStaff = groupValues(activeLegacyAccounts, (row) => optionalString(row, "staffId"));
  let activeCanonicalLinkWithoutExactLegacyProjection = 0;
  for (const person of activePeople) {
    const personId = requireString(person, "_id", "organizationPeople");
    const personStaffs = activeStaffsByPerson.get(personId) ?? [];
    if (personStaffs.length === 0) continue;
    const links = activeLinksByPerson.get(personId) ?? [];
    if (links.length !== 1) continue;
    const link = links[0];
    const providerId = optionalString(link, "lineProviderUserId");
    const provider = providerId ? providers.get(providerId) : undefined;
    if (
      link.organizationId !== person.organizationId ||
      link.generation !== (person.lineLinkGeneration ?? 0) ||
      !provider ||
      !active(provider)
    ) {
      continue;
    }
    const hasExactProjectionForEveryActiveStaff = personStaffs.every((staff) => {
      const staffId = requireString(staff, "_id", "staffs");
      const accounts = activeLegacyAccountsByStaff.get(staffId) ?? [];
      return (
        accounts.length === 1 &&
        accounts[0]?.shopId === staff.shopId &&
        accounts[0]?.lineUserId === provider.lineUserId &&
        accounts[0]?.following === provider.following
      );
    });
    if (!hasExactProjectionForEveryActiveStaff) {
      activeCanonicalLinkWithoutExactLegacyProjection += 1;
    }
  }
  const canonicalProviderUserDuplicate = [...activeProvidersByLineUser.values()].filter(
    (providerRows) => providerRows.length > 1,
  ).length;
  const canonicalProviderWithoutLink = activeProviderUsers.filter(
    (provider) => (activeLinksByProvider.get(requireString(provider, "_id", "lineProviderUsers"))?.length ?? 0) === 0,
  ).length;

  const oldUnusedTokens = input.lineLinkTokens.filter(
    (token) =>
      typeof token.expiresAt === "number" &&
      token.expiresAt > now &&
      token.usedAt === undefined &&
      token.revokedAt === undefined &&
      (token.organizationId === undefined ||
        token.organizationPersonId === undefined ||
        token.lineLinkGenerationAtIssue === undefined),
  ).length;
  const incompleteUnusedTokenSnapshots = input.lineLinkTokens.filter((token) => {
    if (
      typeof token.expiresAt !== "number" ||
      token.expiresAt <= now ||
      token.usedAt !== undefined ||
      token.revokedAt !== undefined
    ) {
      return false;
    }
    const snapshotCount = [token.organizationId, token.organizationPersonId, token.lineLinkGenerationAtIssue].filter(
      (value) => value !== undefined,
    ).length;
    return snapshotCount > 0 && snapshotCount < 3;
  }).length;
  const activeLineOutboxWithoutGeneration = input.notificationOutbox.filter(
    (job) =>
      job.channel === "line" &&
      (job.status === "pending" || job.status === "processing") &&
      (job.organizationPersonLineLinkId === undefined || job.organizationPersonLineGenerationAtEnqueue === undefined),
  ).length;
  const incompleteActiveLineOutboxSnapshots = input.notificationOutbox.filter((job) => {
    if (job.channel !== "line" || (job.status !== "pending" && job.status !== "processing")) return false;
    return (
      (job.organizationPersonLineLinkId === undefined) !== (job.organizationPersonLineGenerationAtEnqueue === undefined)
    );
  }).length;
  const actionRequiredFanoutJobs = input.fanoutJobs.filter((job) => job.status === "actionRequired").length;

  const anomalies = {
    organizationsWithMultipleShops,
    peopleWithMultipleActiveStaffs,
    personStaffHistoryOverLimit,
    activeStaffCanonicalReference,
    activeStaffTenantMismatch,
    activeLegacyDanglingStaff,
    legacyPeopleWithMultipleLineUsers: countDistinctGroupsWithMultipleValues(legacyLineUsersByPerson),
    legacyOrganizationLineOwnershipConflict: countDistinctGroupsWithMultipleValues(legacyOwnersByOrganizationLine),
    legacyFriendshipConflict: countDistinctGroupsWithMultipleValues(legacyFollowingByLine),
    legacyLineUsersOverLimit: [...legacyCountByLine.values()].filter(
      (count) => count > LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX,
    ).length,
    legacyWithoutCanonicalCounterpart,
    canonicalPersonLinkDuplicate: [...activeLinksByPerson.values()].filter((links) => links.length > 1).length,
    canonicalProviderUserDuplicate,
    canonicalOrganizationLineOwnershipConflict: countDistinctGroupsWithMultipleValues(
      canonicalOwnersByOrganizationLine,
    ),
    canonicalDanglingReference,
    canonicalTenantMismatch,
    canonicalGenerationMismatch,
    canonicalProviderWithoutLink,
    activeCanonicalLinkWithoutExactLegacyProjection,
    incompleteUnusedTokenSnapshots,
    incompleteActiveLineOutboxSnapshots,
    actionRequiredFanoutJobs,
  };
  // canonical未作成のlegacy rowはbackfill対象であり、構造異常ではない。
  // 件数は観測しつつ、readinessをblockedにはしない。
  const blockingAnomalyCount = Object.entries(anomalies).reduce(
    (total, [name, count]) => total + (name === "legacyWithoutCanonicalCounterpart" ? 0 : count),
    0,
  );
  const compatibilityCount = activeLegacyAccounts.length + oldUnusedTokens + activeLineOutboxWithoutGeneration;
  const rolloutPath = blockingAnomalyCount > 0 ? "blocked" : compatibilityCount > 0 ? "staged" : "zero";

  return {
    ok: blockingAnomalyCount === 0,
    source: "convex_export",
    rolloutPath,
    scheduledCallerCheck: "required_from_deployment",
    counts: {
      activeOrganizations: activeOrganizations.length,
      shops: availableShops.length,
      activePeople: activePeople.length,
      activeStaffs: activeStaffs.length,
      activeLegacyAccounts: activeLegacyAccounts.length,
      activeProviderUsers: activeProviderUsers.length,
      activePersonLinks: activePersonLinks.length,
      oldUnusedTokens,
      activeLineOutboxWithoutGeneration,
      actionRequiredFanoutJobs,
    },
    anomalies,
  };
}

function parseJsonLines(source: string, table: string): ExportRow[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${table}/documents.jsonl:${index + 1} is not valid JSON`);
      }
      if (!isRecord(value)) throw new Error(`${table}/documents.jsonl:${index + 1} must contain an object`);
      return value;
    });
}

async function readZipEntries(zipPath: string) {
  const { stdout } = await execFile("/usr/bin/unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return new Set(
    String(stdout)
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

async function readExportTable(exportPath: string, table: string, zipEntries?: ReadonlySet<string>) {
  const entry = `${table}/documents.jsonl`;
  if (!zipEntries) return parseJsonLines(await readFile(path.join(exportPath, entry), "utf8"), table);
  if (!zipEntries.has(entry)) throw new Error(`${entry} is missing from the Convex export ZIP`);
  const { stdout } = await execFile("/usr/bin/unzip", ["-p", exportPath, entry], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseJsonLines(String(stdout), table);
}

export async function verifyLineCommonLinkReadinessExport(exportPath: string, now: number) {
  const exportStat = await stat(exportPath);
  const zipEntries = exportStat.isDirectory() ? undefined : await readZipEntries(exportPath);
  const metadata = await readExportTable(exportPath, "_tables", zipEntries);
  const names = new Set(metadata.map((row) => requireString(row, "name", "_tables")));
  const required = [
    "organizations",
    "shops",
    "organizationPeople",
    "staffs",
    "staffLineAccounts",
    "lineLinkTokens",
    "notificationOutbox",
  ];
  for (const table of required) {
    if (!names.has(table)) throw new Error(`${table} is not listed in _tables/documents.jsonl`);
  }
  const read = async (table: string) => (names.has(table) ? await readExportTable(exportPath, table, zipEntries) : []);
  return verifyLineCommonLinkReadiness(
    {
      organizations: await read("organizations"),
      shops: await read("shops"),
      people: await read("organizationPeople"),
      staffs: await read("staffs"),
      legacyAccounts: await read("staffLineAccounts"),
      providerUsers: await read("lineProviderUsers"),
      personLinks: await read("organizationPersonLineLinks"),
      lineLinkTokens: await read("lineLinkTokens"),
      notificationOutbox: await read("notificationOutbox"),
      fanoutJobs: await read("lineFriendshipFanoutJobs"),
    },
    now,
  );
}

function parseArgs(args: string[]) {
  let exportPath: string | undefined;
  let now = Date.now();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--path") {
      exportPath = args[index + 1];
      if (!exportPath) throw new Error("--path requires a Convex export ZIP or extracted directory");
      index += 1;
      continue;
    }
    if (arg === "--now") {
      now = Number(args[index + 1]);
      if (!Number.isFinite(now)) throw new Error("--now requires a finite Unix timestamp");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!exportPath) throw new Error("--path is required");
  return { exportPath: path.resolve(exportPath), now };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await verifyLineCommonLinkReadinessExport(args.exportPath, args.now);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`LINE common link readiness verification failed: ${message}\n`);
    process.exitCode = 1;
  });
}
