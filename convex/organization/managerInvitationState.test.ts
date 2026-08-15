import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { resolvePersonManagerInvitationState } from "./managerInvitationState";

const organizationId = "organization" as Id<"organizations">;
const actorMemberId = "actor-member" as Id<"organizationMembers">;
const targetPersonId = "target-person" as Id<"organizationPeople">;

const organization = { _id: organizationId } as Doc<"organizations">;
const actorMember = { _id: actorMemberId, status: "active" } as Doc<"organizationMembers">;
const person = {
  _id: targetPersonId,
  organizationId,
  status: "active",
  email: "target@example.com",
} as Doc<"organizationPeople">;
const billingState = {
  state: { kind: "active", plan: "free" },
} as Doc<"organizationBillingStates">;
const usage = {
  personCount: 2,
  reservedSeatCount: 0,
  projectedPersonCount: 2,
  activeManagerCount: 1,
  pendingManagerInvitationCount: 0,
  projectedActiveManagerCount: 1,
  activeShopCount: 1,
};
const unusedCtx = {} as Parameters<typeof resolvePersonManagerInvitationState>[0];

function resolve(activePendingInvitations: Doc<"organizationInvitations">[]) {
  return resolvePersonManagerInvitationState(unusedCtx, {
    organization,
    actorMember,
    person,
    personMembers: [],
    contactEmail: person.email,
    isOrganizationLinked: true,
    billingState,
    usage,
    activePendingInvitations,
  });
}

describe("resolvePersonManagerInvitationState", () => {
  beforeEach(() => vi.stubEnv("FEATURE_MANAGER_INVITATION", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("未リリースflagが閉じている場合は操作導線を隠す", async () => {
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "");
    await expect(resolve([])).resolves.toEqual({ kind: "hidden" });
  });

  it("Freeでも2人目を通常の管理者追加として招待できる", async () => {
    await expect(resolve([])).resolves.toEqual({
      kind: "available",
      mode: "addition",
      replacesStaleInvitation: false,
    });
  });

  it("既発行のFree管理者交代が残る間は別の追加を案内しない", async () => {
    const legacyExchange = {
      _id: "legacy-exchange" as Id<"organizationInvitations">,
      targetPersonId: "other-person" as Id<"organizationPeople">,
      emailNormalized: "other@example.com",
      purpose: "freeManagerExchange",
    } as Doc<"organizationInvitations">;

    await expect(resolve([legacyExchange])).resolves.toEqual({
      kind: "unavailable",
      reason:
        "以前に発行した管理者交代の招待が残っています。\n取り消すか有効期限が切れてから、管理者を追加してください。",
    });
  });

  it("対象本人の既発行Free管理者交代は旧方式の承認待ちとして表示する", async () => {
    const legacyExchange = {
      _id: "target-legacy-exchange" as Id<"organizationInvitations">,
      targetPersonId,
      emailNormalized: "target@example.com",
      purpose: "freeManagerExchange",
    } as Doc<"organizationInvitations">;

    await expect(resolve([legacyExchange])).resolves.toEqual({ kind: "pending", mode: "freeManagerExchange" });
  });
});
