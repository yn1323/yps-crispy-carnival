import { resetCurrentManagerScenarioData, seedManagerScenario } from "./scenarioSeeds";

const SAFE_TEST_EMAIL_DOMAIN = "example.test";

export type StaffLifecycleScenarioSeed = {
  organizationId: string;
  shopId: string;
  shopName: string;
  organizationName: string;
  staffName: string;
  staffEmail: string;
};

export function seedStaffLifecycleScenario(): StaffLifecycleScenarioSeed {
  const result = seedManagerScenario<StaffLifecycleScenarioSeed>("testing:seedStaffLifecycleScenario");
  // seedManagerScenarioが、このstaffへ送る通知を含む店舗単位の配送抑制を先に確認する。
  assertSafeStaffLifecycleRecipient(result.staffEmail);
  return result;
}

export function createUpdatedStaffLifecycleEmail(email: string) {
  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex <= 0 || email.slice(separatorIndex + 1) !== SAFE_TEST_EMAIL_DOMAIN) {
    throw new Error("Staff lifecycle E2E requires an example.test recipient");
  }

  const updatedEmail = `${email.slice(0, separatorIndex)}+updated@${SAFE_TEST_EMAIL_DOMAIN}`;
  assertSafeStaffLifecycleRecipient(updatedEmail);
  return updatedEmail;
}

export async function resetStaffLifecycleScenario() {
  return await resetCurrentManagerScenarioData();
}

function assertSafeStaffLifecycleRecipient(email: string) {
  if (!email.endsWith(`@${SAFE_TEST_EMAIL_DOMAIN}`)) {
    throw new Error("Staff lifecycle E2E requires an example.test recipient");
  }
}
