import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexRunJson } from "./convex";
import { type E2EActorPool, getCurrentE2EClerkUser, getE2EStorageStatePath } from "./e2eUsers";
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

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

export function getE2EManagerAuthTokenIdentifier(userIndex = getCurrentE2EClerkUser().index) {
  const cached = cachedManagerAuthTokenIdentifiers.get(userIndex);
  if (cached) return cached;

  const storagePath = join(process.cwd(), getE2EStorageStatePath(userIndex));
  const state = JSON.parse(readFileSync(storagePath, "utf-8")) as ClerkStorageState;
  // Clerk の cookie 名・domain はローカル/CIで揺れることがある。
  // Convex の認証キーは issuer|subject なので、保存済み storageState からJWTを読む。
  const sessionCookie =
    state.cookies.find((cookie) => cookie.name === "__session" && cookie.domain === "localhost") ??
    state.cookies.find((cookie) => cookie.name.startsWith("__session"));

  if (!sessionCookie) {
    throw new Error(`Clerk session cookie was not found in ${storagePath}`);
  }

  const [, payload] = sessionCookie.value.split(".");
  if (!payload) {
    throw new Error("Clerk session cookie is not a JWT");
  }

  const decoded = JSON.parse(decodeBase64Url(payload)) as ClerkSessionPayload;
  if (!decoded.iss || !decoded.sub) {
    throw new Error("Clerk session JWT does not include iss/sub");
  }

  const authTokenIdentifier = `${decoded.iss}|${decoded.sub}`;
  cachedManagerAuthTokenIdentifiers.set(userIndex, authTokenIdentifier);
  return authTokenIdentifier;
}

export function seedManagerScenario<T>(fn: string, args: Record<string, unknown> = {}) {
  const user = getCurrentE2EClerkUser();
  // dry-run 判定は managerEmail 経由で行うため、seed でも本番コードと同じ manager 情報を渡す。
  const result = convexRunJson<T>(fn, {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(user.index),
    managerEmail: user.email,
    ...args,
  });
  const shopId = result && typeof result === "object" && "shopId" in result ? result.shopId : undefined;
  if (typeof shopId === "string") assertNotificationDeliverySuppressed(shopId);
  return result;
}

export function resetCurrentManagerScenarioData() {
  return convexRunJson("testing:resetManagerScenarioData", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(),
  });
}

export function forceResetManagerScenarioData(userIndex: number) {
  return convexRunJson("testing:forceResetManagerScenarioData", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(userIndex),
  });
}

export function getCurrentManagerShopId() {
  const result = convexRunJson<{ shopId: string | null }>("testing:getManagerShopProbe", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(),
  });
  if (!result.shopId) throw new Error("E2E manager shop was not found");
  return result.shopId;
}

export function seedPendingStaffRegistrationRequest(args: { shopId: string; name: string; email: string }) {
  return convexRunJson<{ requestId: string }>("testing:seedPendingStaffRegistrationRequestScenario", args);
}

export type MultiShopOrganizationScenarioArgs = {
  organizationName?: string;
  primaryShopName?: string;
  secondaryShopName?: string;
  primaryMarkerPersonName?: string;
  primaryMarkerPersonEmail?: string;
  secondaryMarkerPersonName?: string;
  secondaryMarkerPersonEmail?: string;
};

export type MultiShopOrganizationScenarioSeed = {
  organizationId: string;
  primaryOrganizationId: string;
  shopId: string;
  primaryShopId: string;
  secondaryShopId: string;
  userId: string;
  ownerPersonId: string;
  managerStaffId: string;
  primaryMarkerPersonId: string;
  primaryMarkerStaffId: string;
  secondaryMarkerPersonId: string;
  secondaryMarkerStaffId: string;
  organizationName: string;
  primaryShopName: string;
  secondaryShopName: string;
  primaryMarkerPersonName: string;
  primaryMarkerPersonEmail: string;
  secondaryMarkerPersonName: string;
  secondaryMarkerPersonEmail: string;
};

export function seedMultiShopOrganizationScenario(
  args: MultiShopOrganizationScenarioArgs = {},
): MultiShopOrganizationScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const result = convexRunJson<MultiShopOrganizationScenarioSeed>("testing:seedMultiShopOrganizationScenario", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
    managerEmail: owner.email,
    ...args,
  });
  assertNotificationDeliverySuppressed(result.primaryShopId);
  assertNotificationDeliverySuppressed(result.secondaryShopId);
  return result;
}

export type TrialEndingNoticeScenarioArgs = {
  trialEndsAt: number;
  organizationName?: string;
  primaryShopName?: string;
  secondaryShopName?: string;
};

export type TrialEndingNoticeScenarioSeed = {
  organizationId: string;
  shopId: string;
  primaryShopId: string;
  secondaryShopId: string;
  organizationName: string;
  primaryShopName: string;
  secondaryShopName: string;
  trialEndsAt: number;
};

export function seedTrialEndingNoticeScenario(args: TrialEndingNoticeScenarioArgs): TrialEndingNoticeScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const result = convexRunJson<TrialEndingNoticeScenarioSeed>("testing:seedTrialEndingNoticeScenario", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
    managerEmail: owner.email,
    ...args,
  });
  assertNotificationDeliverySuppressed(result.primaryShopId);
  assertNotificationDeliverySuppressed(result.secondaryShopId);
  return result;
}

export type ActiveProOrganizationDeletionScenarioArgs = {
  organizationName?: string;
  shopName?: string;
};

export type ActiveProOrganizationDeletionScenarioSeed = {
  organizationId: string;
  shopId: string;
  organizationName: string;
  shopName: string;
};

export function seedActiveProOrganizationDeletionScenario(
  args: ActiveProOrganizationDeletionScenarioArgs = {},
): ActiveProOrganizationDeletionScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const result = convexRunJson<ActiveProOrganizationDeletionScenarioSeed>(
    "testing:seedActiveProOrganizationDeletionScenario",
    {
      managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
      managerEmail: owner.email,
      ...args,
    },
  );
  assertNotificationDeliverySuppressed(result.shopId);
  return result;
}

export type OrganizationBillingPlanChangeScenarioArgs = {
  complimentaryOrganizationName?: string;
  complimentaryShopName?: string;
  restrictedOrganizationName?: string;
  restrictedShopName?: string;
  removablePersonName?: string;
};

export type OrganizationBillingPlanChangeScenarioSeed = {
  complimentaryOrganizationId: string;
  complimentaryShopId: string;
  complimentaryOrganizationName: string;
  restrictedOrganizationId: string;
  restrictedShopId: string;
  restrictedOrganizationName: string;
  removablePersonId: string;
  removablePersonName: string;
  expectedRestrictedPeople: number;
  expectedProLimit: number;
};

export function seedOrganizationBillingPlanChangeScenario(
  args: OrganizationBillingPlanChangeScenarioArgs = {},
): OrganizationBillingPlanChangeScenarioSeed {
  const result = seedManagerScenario<OrganizationBillingPlanChangeScenarioSeed>(
    "testing:seedOrganizationBillingPlanChangeScenario",
    args,
  );
  assertNotificationDeliverySuppressed(result.complimentaryShopId);
  assertNotificationDeliverySuppressed(result.restrictedShopId);
  return result;
}

export type MultiActorOrganizationScenarioArgs = {
  organizationName?: string;
  primaryShopName?: string;
  secondaryShopName?: string;
  actorBName?: string;
  actorCName?: string;
  alternateOrganizationName?: string;
  alternateShopName?: string;
  personRemovalAssignments?: {
    today: string;
    future: string;
  };
};

export type MultiActorOrganizationScenarioSeed = {
  ownerUserId: string;
  actorBUserId: string;
  actorCUserId: string;
  primaryOrganizationId: string;
  ownerPersonId: string;
  ownerMemberId: string;
  primaryShopId: string;
  secondaryShopId: string;
  actorBPersonId: string;
  actorBPrimaryStaffId: string;
  alternateOrganizationId: string;
  alternateShopId: string;
  actorBAlternatePersonId: string;
  actorBAlternateMemberId: string;
  personRemovalRecruitmentId?: string;
  personRemovalAssignmentCount?: number;
  organizationName: string;
  primaryShopName: string;
  secondaryShopName: string;
  actorBName: string;
  actorCName: string;
  alternateOrganizationName: string;
  alternateShopName: string;
};

function getMultiActorSeedIdentity(pool: E2EActorPool) {
  const owner = pool.A;
  const actorB = pool.B;
  const actorC = pool.C;
  return {
    owner,
    actorB,
    actorC,
    ownerManagerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
    actorBManagerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(actorB.index),
    actorCManagerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(actorC.index),
  };
}

export function seedMultiActorOrganizationScenario(
  pool: E2EActorPool,
  args: MultiActorOrganizationScenarioArgs = {},
): MultiActorOrganizationScenarioSeed {
  const identity = getMultiActorSeedIdentity(pool);
  const result = convexRunJson<MultiActorOrganizationScenarioSeed>("testing:seedMultiActorOrganizationScenario", {
    ownerManagerAuthTokenIdentifier: identity.ownerManagerAuthTokenIdentifier,
    ownerManagerEmail: identity.owner.email,
    actorBManagerAuthTokenIdentifier: identity.actorBManagerAuthTokenIdentifier,
    actorBManagerEmail: identity.actorB.email,
    actorCManagerAuthTokenIdentifier: identity.actorCManagerAuthTokenIdentifier,
    actorCManagerEmail: identity.actorC.email,
    ...args,
  });
  assertNotificationDeliverySuppressed(result.primaryShopId);
  assertNotificationDeliverySuppressed(result.secondaryShopId);
  assertNotificationDeliverySuppressed(result.alternateShopId);
  return result;
}

export type FreeManagerMultiOrganizationScenarioArgs = {
  targetOrganizationName?: string;
  targetShopName?: string;
  actorBName?: string;
  alternateOrganizationName?: string;
  alternateShopName?: string;
};

export type FreeManagerMultiOrganizationScenarioSeed = {
  actorAUserId: string;
  actorAName: string;
  targetOrganizationId: string;
  targetOrganizationName: string;
  targetShopId: string;
  targetShopName: string;
  actorATargetPersonId: string;
  actorATargetMemberId: string;
  actorATargetStaffId: string;
  actorBTargetPersonId: string;
  actorBTargetStaffId: string;
  actorBName: string;
  alternateOrganizationId: string;
  alternateOrganizationName: string;
  alternateShopId: string;
  alternateShopName: string;
  actorAAlternatePersonId: string;
  actorAAlternateMemberId: string;
  actorAAlternateStaffId: string;
};

export function seedFreeManagerMultiOrganizationScenario(
  pool: E2EActorPool,
  args: FreeManagerMultiOrganizationScenarioArgs = {},
): FreeManagerMultiOrganizationScenarioSeed {
  const identity = getMultiActorSeedIdentity(pool);
  const result = convexRunJson<FreeManagerMultiOrganizationScenarioSeed>(
    "testing:seedFreeManagerMultiOrganizationScenario",
    {
      actorAManagerAuthTokenIdentifier: identity.ownerManagerAuthTokenIdentifier,
      actorAManagerEmail: identity.owner.email,
      actorBManagerAuthTokenIdentifier: identity.actorBManagerAuthTokenIdentifier,
      actorBManagerEmail: identity.actorB.email,
      actorCManagerAuthTokenIdentifier: identity.actorCManagerAuthTokenIdentifier,
      ...args,
    },
  );
  assertNotificationDeliverySuppressed(result.targetShopId);
  assertNotificationDeliverySuppressed(result.alternateShopId);
  return result;
}

/** 通常E2E workerのClerkユーザーを、削除可能なFreeグループ2件の唯一の管理者としてseedする。 */
export function seedOrganizationDeletionScenario(
  args: FreeManagerMultiOrganizationScenarioArgs = {},
): FreeManagerMultiOrganizationScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const suffix = `worker-${owner.index}`;
  const result = convexRunJson<FreeManagerMultiOrganizationScenarioSeed>(
    "testing:seedFreeManagerMultiOrganizationScenario",
    {
      actorAManagerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
      actorAManagerEmail: owner.email,
      // B/CはClerkで操作しない前提データ。実在E2Eユーザーを指定すると並列workerのseedと競合する。
      actorBManagerAuthTokenIdentifier: `e2e-organization-deletion-b-${suffix}`,
      actorBManagerEmail: `organization-deletion-b-${suffix}@example.test`,
      actorCManagerAuthTokenIdentifier: `e2e-organization-deletion-c-${suffix}`,
      ...args,
    },
  );
  assertNotificationDeliverySuppressed(result.targetShopId);
  assertNotificationDeliverySuppressed(result.alternateShopId);
  return result;
}

export function resetMultiActorOrganizationScenarioData(pool: E2EActorPool) {
  const identity = getMultiActorSeedIdentity(pool);
  return convexRunJson("testing:resetMultiActorOrganizationScenarioData", {
    ownerManagerAuthTokenIdentifier: identity.ownerManagerAuthTokenIdentifier,
    actorBManagerAuthTokenIdentifier: identity.actorBManagerAuthTokenIdentifier,
    actorCManagerAuthTokenIdentifier: identity.actorCManagerAuthTokenIdentifier,
  });
}
