import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { convexRunJson, E2EConvexCommandError } from "./convex";
import { type E2EClerkUser, getCurrentE2EClerkUser, getE2EStorageStatePath } from "./e2eUsers";
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
const SESSION_IDENTITY_ERROR = "Clerk session identity could not be derived for the E2E actor";

export type E2EManagerScenarioActor = {
  userIndex: number;
  email: string;
  authTokenIdentifier: string;
};

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

export function getE2EManagerAuthTokenIdentifierFromStorageState(state: ClerkStorageState) {
  const sessionCookie =
    state.cookies.find((cookie) => cookie.name === "__session" && cookie.domain === "localhost") ??
    state.cookies.find((cookie) => cookie.name.startsWith("__session"));

  if (!sessionCookie) throw new Error(SESSION_IDENTITY_ERROR);
  const [, payload] = sessionCookie.value.split(".");
  if (!payload) throw new Error(SESSION_IDENTITY_ERROR);

  try {
    const decoded = JSON.parse(decodeBase64Url(payload)) as ClerkSessionPayload;
    if (typeof decoded.iss !== "string" || !decoded.iss || typeof decoded.sub !== "string" || !decoded.sub) {
      throw new Error(SESSION_IDENTITY_ERROR);
    }
    return `${decoded.iss}|${decoded.sub}`;
  } catch {
    // cookie値やJWT payloadをerrorへ含めず、公開artifactへsession情報を残さない。
    throw new Error(SESSION_IDENTITY_ERROR);
  }
}

export async function getE2EManagerScenarioActorFromContext(
  context: BrowserContext,
  user: E2EClerkUser,
): Promise<E2EManagerScenarioActor> {
  const state = (await context.storageState()) as ClerkStorageState;
  return {
    userIndex: user.index,
    email: user.email,
    authTokenIdentifier: getE2EManagerAuthTokenIdentifierFromStorageState(state),
  };
}

export function getE2EManagerAuthTokenIdentifier(userIndex = getCurrentE2EClerkUser().index) {
  const cached = cachedManagerAuthTokenIdentifiers.get(userIndex);
  if (cached) return cached;

  const storagePath = join(process.cwd(), getE2EStorageStatePath(userIndex));
  const state = JSON.parse(readFileSync(storagePath, "utf-8")) as ClerkStorageState;
  const authTokenIdentifier = getE2EManagerAuthTokenIdentifierFromStorageState(state);
  cachedManagerAuthTokenIdentifiers.set(userIndex, authTokenIdentifier);
  return authTokenIdentifier;
}

export function seedManagerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  const user = getCurrentE2EClerkUser();
  return seedManagerScenarioForActor<T>(
    {
      userIndex: user.index,
      email: user.email,
      authTokenIdentifier: getE2EManagerAuthTokenIdentifier(user.index),
    },
    fn,
    args,
  );
}

export function seedManagerScenarioForActor<T>(
  actor: E2EManagerScenarioActor,
  fn: string,
  args: Record<string, unknown> = {},
) {
  const result = convexRunJson<T>(fn, {
    ...args,
    // identityは呼出し側argsで上書きさせず、fresh Clerk sessionから導いたactorへ固定する。
    managerAuthTokenIdentifier: actor.authTokenIdentifier,
    managerEmail: actor.email,
  });
  const shopId = result && typeof result === "object" && "shopId" in result ? result.shopId : undefined;
  if (typeof shopId === "string") assertNotificationDeliverySuppressed(shopId);
  return result;
}

export async function resetCurrentManagerScenarioData() {
  return await resetManagerScenarioDataForAuthTokenIdentifier(getE2EManagerAuthTokenIdentifier());
}

export async function resetManagerScenarioDataForActor(actor: E2EManagerScenarioActor) {
  return await resetManagerScenarioDataForAuthTokenIdentifier(actor.authTokenIdentifier);
}

async function resetManagerScenarioDataForAuthTokenIdentifier(managerAuthTokenIdentifier: string) {
  const args = { managerAuthTokenIdentifier };

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
