import { join } from "node:path";

const DEFAULT_E2E_CLERK_USER_EMAILS = [
  "e2e-user-1@test.com",
  "e2e-user-2@test.com",
  "e2e-user-3@test.com",
  "e2e-user-4@test.com",
  "e2e-user-5@test.com",
  "e2e-user-6@test.com",
];
const EXPECTED_E2E_USER_COUNT = 6;
const CORE_E2E_USER_COUNT = 3;
const E2E_WORKER_COUNT_ENV = "E2E_WORKERS";
const CURRENT_E2E_USER_INDEX_ENV = "E2E_CURRENT_USER_INDEX";
export type E2EClerkUser = {
  index: number;
  email: string;
  storageStatePath: string;
  metaPath: string;
};

export function parseE2EClerkUserEmails(raw = process.env.E2E_CLERK_USERS) {
  const trimmed = raw?.trim();
  const emails = (trimmed ? trimmed.split(",") : DEFAULT_E2E_CLERK_USER_EMAILS).map((email) => email.trim());

  if (emails.length !== EXPECTED_E2E_USER_COUNT) {
    throw new Error(`E2E_CLERK_USERS must contain exactly ${EXPECTED_E2E_USER_COUNT} comma-separated users.`);
  }
  if (emails.some((email) => email.length === 0)) {
    throw new Error("E2E_CLERK_USERS must not contain empty users.");
  }
  if (new Set(emails.map((email) => email.toLowerCase())).size !== emails.length) {
    throw new Error("E2E_CLERK_USERS must not contain duplicate users.");
  }
  if (emails.some((email) => email.toLowerCase().includes("testtest"))) {
    throw new Error("E2E_CLERK_USERS must not include the retired testtest user.");
  }

  return emails;
}

export function getE2EClerkUsers(): E2EClerkUser[] {
  return parseE2EClerkUserEmails().map((email, index) => ({
    index,
    email,
    storageStatePath: getE2EStorageStatePath(index),
    metaPath: getE2EStorageStateMetaPath(index),
  }));
}

export function getE2ECoreClerkUsers(): E2EClerkUser[] {
  return getE2EClerkUsers().slice(0, CORE_E2E_USER_COUNT);
}

export function getE2EReservedMultiActorClerkUsers(): E2EClerkUser[] {
  return getE2EClerkUsers().slice(CORE_E2E_USER_COUNT);
}

export function getE2EWorkerCount(raw = process.env[E2E_WORKER_COUNT_ENV]) {
  const normalized = raw?.trim();
  if (!normalized) return CORE_E2E_USER_COUNT;

  const workerCount = Number(normalized);
  if (!Number.isInteger(workerCount) || workerCount <= 0 || workerCount > CORE_E2E_USER_COUNT) {
    throw new Error(`${E2E_WORKER_COUNT_ENV} must be an integer between 1 and ${CORE_E2E_USER_COUNT}: ${raw}`);
  }
  return workerCount;
}

export function getE2EStorageStatePath(index: number) {
  return join("e2e", ".clerk", `user-${index}.json`);
}

export function getE2EStorageStateMetaPath(index: number) {
  return join("e2e", ".clerk", `user-${index}.meta.json`);
}

export function getE2EClerkUserForIndex(index: number): E2EClerkUser {
  const users = getE2EClerkUsers();
  const normalizedIndex = normalizeE2EUserIndex(index, users.length);
  return users[normalizedIndex];
}

export function getE2EClerkUserForWorker(parallelIndex: number, workerCount: number): E2EClerkUser {
  const users = getE2ECoreClerkUsers();
  return getE2EClerkUserForWorkerFromPool(users, parallelIndex, workerCount);
}

/**
 * logoutのようにsessionを失効させるE2Eへ、通常coreと重ならないactorを割り当てる。
 * parallelIndexだけで決まり、test順序・repeat・retryではrotateしない。
 */
export function getE2EReservedMultiActorClerkUserForWorker(parallelIndex: number, workerCount: number): E2EClerkUser {
  const users = getE2EReservedMultiActorClerkUsers();
  return getE2EClerkUserForWorkerFromPool(users, parallelIndex, workerCount);
}

function getE2EClerkUserForWorkerFromPool(
  users: E2EClerkUser[],
  parallelIndex: number,
  workerCount: number,
): E2EClerkUser {
  if (!Number.isInteger(workerCount) || workerCount <= 0 || workerCount > users.length) {
    throw new Error(`E2E worker count must be an integer between 1 and ${users.length}: ${workerCount}`);
  }
  if (!Number.isInteger(parallelIndex) || parallelIndex < 0 || parallelIndex >= workerCount) {
    throw new Error(`E2E parallel index must be an integer between 0 and ${workerCount - 1}: ${parallelIndex}`);
  }
  return users[parallelIndex];
}

export function setCurrentE2EClerkUserIndex(index: number) {
  process.env[CURRENT_E2E_USER_INDEX_ENV] = String(normalizeE2EUserIndex(index, getE2EClerkUsers().length));
}

export function getCurrentE2EClerkUserIndex() {
  const raw = process.env[CURRENT_E2E_USER_INDEX_ENV] ?? process.env.TEST_PARALLEL_INDEX ?? "0";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid E2E user index: ${raw}`);
  }
  return normalizeE2EUserIndex(parsed, getE2EClerkUsers().length);
}

export function getCurrentE2EClerkUser() {
  return getE2EClerkUserForIndex(getCurrentE2EClerkUserIndex());
}

function normalizeE2EUserIndex(index: number, userCount: number) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`E2E user index must be a non-negative integer: ${index}`);
  }
  return index % userCount;
}
