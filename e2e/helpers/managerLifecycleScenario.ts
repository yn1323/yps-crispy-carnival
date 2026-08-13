import { convexRunJson } from "./convex";
import { assertNotificationRecipientSuppressed } from "./notificationProbe";
import { pollUntil } from "./poll";
import { type E2EManagerScenarioActor, resetCurrentManagerScenarioData, seedManagerScenario } from "./scenarioSeeds";

const CAPABILITY_POLL_DEADLINE_MS = 10_000;
const CAPABILITY_POLL_INTERVAL_MS = 500;

export type ManagerLifecycleScenarioSeed = {
  shopId: string;
  shopName: string;
  organizationId: string;
  organizationName: string;
  candidatePersonId: string;
  candidateName: string;
  candidateEmail: string;
};

type ManagerInvitationCapability = {
  token: string | null;
};

type IssuedManagerInvitationCapability = {
  token: string;
};

export function seedManagerLifecycleScenario(invitee: E2EManagerScenarioActor): ManagerLifecycleScenarioSeed {
  const seed = seedManagerScenario<ManagerLifecycleScenarioSeed>("testing:seedManagerLifecycleScenario", {
    inviteeAuthTokenIdentifier: invitee.authTokenIdentifier,
    inviteeEmail: invitee.email,
  });
  assertNotificationRecipientSuppressed(seed.candidateEmail);
  return seed;
}

export async function waitForManagerInvitationCapability(
  seed: Pick<ManagerLifecycleScenarioSeed, "organizationId" | "candidatePersonId">,
): Promise<IssuedManagerInvitationCapability> {
  try {
    const result = await pollUntil({
      deadlineMs: CAPABILITY_POLL_DEADLINE_MS,
      commandTimeoutMs: 8_000,
      intervalMs: CAPABILITY_POLL_INTERVAL_MS,
      errorCode: "manager-invitation-capability-unavailable",
      probe: ({ commandTimeoutMs }) =>
        convexRunJson<ManagerInvitationCapability>(
          "testing:getManagerInvitationCapability",
          {
            organizationId: seed.organizationId,
            targetPersonId: seed.candidatePersonId,
          },
          { timeoutMs: commandTimeoutMs },
        ),
      accept: (candidate) => Boolean(candidate.token),
    });
    return result as IssuedManagerInvitationCapability;
  } catch (error) {
    if (error instanceof Error && error.name === "E2EPollDeadlineError") {
      throw new Error("E2E capability was not issued: manager-invitation");
    }
    throw error;
  }
}

export async function resetManagerLifecycleScenario() {
  return await resetCurrentManagerScenarioData();
}
