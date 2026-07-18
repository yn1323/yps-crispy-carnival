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
const CURRENT_E2E_USER_INDEX_ENV = "E2E_CURRENT_USER_INDEX";
const E2E_ACTOR_USER_OFFSET = {
  A: 0,
  B: 1,
  C: 2,
} as const;
const E2E_ACTOR_COUNT = Object.keys(E2E_ACTOR_USER_OFFSET).length;

export type E2EActor = keyof typeof E2E_ACTOR_USER_OFFSET;

export type E2EClerkUser = {
  index: number;
  email: string;
  storageStatePath: string;
  metaPath: string;
};

export type E2EActorPool = {
  index: number;
  A: E2EClerkUser;
  B: E2EClerkUser;
  C: E2EClerkUser;
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

export function getE2EWorkerCount() {
  return getE2EClerkUsers().length;
}

export function getE2EMultiActorWorkerCount() {
  return getE2EClerkUsers().length / E2E_ACTOR_COUNT;
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

export function getE2EActorPool(poolIndex: number): E2EActorPool {
  const users = getE2EClerkUsers();
  const poolCount = users.length / E2E_ACTOR_COUNT;
  assertE2EActorPoolIndex(poolIndex, poolCount);

  const firstUserIndex = poolIndex * E2E_ACTOR_COUNT;
  return {
    index: poolIndex,
    A: users[firstUserIndex + E2E_ACTOR_USER_OFFSET.A],
    B: users[firstUserIndex + E2E_ACTOR_USER_OFFSET.B],
    C: users[firstUserIndex + E2E_ACTOR_USER_OFFSET.C],
  };
}

export function getE2EClerkUserForActor(actor: E2EActor, poolIndex: number): E2EClerkUser {
  return getE2EActorPool(poolIndex)[actor];
}

export function setCurrentE2EClerkUserIndex(index: number) {
  process.env[CURRENT_E2E_USER_INDEX_ENV] = String(normalizeE2EUserIndex(index, getE2EWorkerCount()));
}

export function getCurrentE2EClerkUserIndex() {
  const raw = process.env[CURRENT_E2E_USER_INDEX_ENV] ?? process.env.TEST_PARALLEL_INDEX ?? "0";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid E2E user index: ${raw}`);
  }
  return normalizeE2EUserIndex(parsed, getE2EWorkerCount());
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

function assertE2EActorPoolIndex(poolIndex: number, poolCount: number) {
  if (!Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex >= poolCount) {
    throw new Error(`E2E actor pool index must be an integer between 0 and ${poolCount - 1}: ${poolIndex}`);
  }
}
