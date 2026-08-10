import { convexRunJson } from "./convex";
import { getCurrentE2EClerkUser } from "./e2eUsers";
import { assertNotificationDeliverySuppressed } from "./notificationProbe";
import { getE2EManagerAuthTokenIdentifier, resetCurrentManagerScenarioData } from "./scenarioSeeds";

export type ShopStaffMembershipScenarioSeed = {
  organizationId: string;
  contextShopId: string;
  targetShopId: string;
  targetShopName: string;
  additionCandidateName: string;
  existingTargetName: string;
};

export function seedShopStaffMembershipScenario(): ShopStaffMembershipScenarioSeed {
  const owner = getCurrentE2EClerkUser();
  const result = convexRunJson<ShopStaffMembershipScenarioSeed>("testing:seedShopStaffMembershipScenario", {
    managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(owner.index),
    managerEmail: owner.email,
  });
  assertNotificationDeliverySuppressed(result.contextShopId);
  assertNotificationDeliverySuppressed(result.targetShopId);
  return result;
}

export async function resetShopStaffMembershipScenario() {
  return await resetCurrentManagerScenarioData();
}
