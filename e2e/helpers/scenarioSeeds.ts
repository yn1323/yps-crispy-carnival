import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexRunJson, E2EConvexCommandError } from "./convex";
import { getCurrentE2EClerkUser, getE2EStorageStatePath } from "./e2eUsers";
import { recordE2EMetric } from "./metrics";
import { assertNotificationDeliverySuppressed } from "./notificationProbe";

type ClerkStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
  }>;
};

type ClerkSessionPayload = {
  iss?: string;
  sub?: string;
};

const cachedManagerAuthTokenIdentifiers = new Map<number, string>();
const RESET_OCC_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000] as const;

function isOptimisticConcurrencyControlFailure(error: unknown) {
  return error instanceof E2EConvexCommandError && error.kind === "occ";
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getE2EManagerAuthTokenIdentifier(userIndex = getCurrentE2EClerkUser().index) {
  const cached = cachedManagerAuthTokenIdentifiers.get(userIndex);
  if (cached) return cached;

  const storagePath = join(process.cwd(), getE2EStorageStatePath(userIndex));
  const state = JSON.parse(readFileSync(storagePath, "utf-8")) as ClerkStorageState;
  const sessionCookie =
    state.cookies.find((cookie) => cookie.name === "__session" && cookie.domain === "localhost") ??
    state.cookies.find((cookie) => cookie.name.startsWith("__session"));

  if (!sessionCookie) throw new Error("Clerk session cookie was not found for the E2E user");
  const [, payload] = sessionCookie.value.split(".");
  if (!payload) throw new Error("Clerk session cookie is not a JWT");

  const decoded = JSON.parse(decodeBase64Url(payload)) as ClerkSessionPayload;
  if (!decoded.iss || !decoded.sub) throw new Error("Clerk session JWT does not include iss/sub");

  const authTokenIdentifier = `${decoded.iss}|${decoded.sub}`;
  cachedManagerAuthTokenIdentifiers.set(userIndex, authTokenIdentifier);
  return authTokenIdentifier;
}

export function seedManagerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  const user = getCurrentE2EClerkUser();
  const result = convexRunJson<T>(fn, {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(user.index),
    managerEmail: user.email,
    ...args,
  });
  const shopId = result && typeof result === "object" && "shopId" in result ? result.shopId : undefined;
  if (typeof shopId === "string") assertNotificationDeliverySuppressed(shopId);
  return result;
}

export async function resetCurrentManagerScenarioData() {
  const args = { managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier() };

  for (let attempt = 0; ; attempt += 1) {
    try {
      return convexRunJson("testing:resetManagerScenarioData", args);
    } catch (error) {
      const delayMs = RESET_OCC_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined || !isOptimisticConcurrencyControlFailure(error)) throw error;
      recordE2EMetric("occRetries");
      await wait(delayMs);
    }
  }
}

export function forceResetManagerScenarioData(userIndex: number) {
  return convexRunJson("testing:forceResetManagerScenarioData", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(userIndex),
  });
}

export type SingleActorMultiOrganizationScenarioArgs = {
  targetOrganizationName?: string;
  targetShopName?: string;
  actorBName?: string;
  alternateOrganizationName?: string;
  alternateShopName?: string;
};

export type SingleActorMultiOrganizationScenarioSeed = {
  actorAName: string;
  targetOrganizationName: string;
  targetShopId: string;
  targetShopName: string;
  actorBName: string;
  alternateOrganizationName: string;
  alternateShopId: string;
  alternateShopName: string;
};

export function seedSingleActorMultiOrganizationScenario(
  args: SingleActorMultiOrganizationScenarioArgs = {},
): SingleActorMultiOrganizationScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const suffix = `worker-${owner.index}`;
  const result = convexRunJson<SingleActorMultiOrganizationScenarioSeed>(
    "testing:seedFreeManagerMultiOrganizationScenario",
    {
      actorAManagerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
      actorAManagerEmail: owner.email,
      // B/CはClerkで操作しない前提データ。別workerの実在ユーザーをseedへ渡さない。
      actorBManagerAuthTokenIdentifier: `e2e-tenant-marker-b-${suffix}`,
      actorBManagerEmail: `tenant-marker-b-${suffix}@example.test`,
      actorCManagerAuthTokenIdentifier: `e2e-tenant-marker-c-${suffix}`,
      ...args,
    },
  );
  assertNotificationDeliverySuppressed(result.targetShopId);
  assertNotificationDeliverySuppressed(result.alternateShopId);
  return result;
}
