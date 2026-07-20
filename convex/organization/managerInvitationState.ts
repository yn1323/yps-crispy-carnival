import type { GenericDatabaseReader } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc } from "../_generated/dataModel";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import { getOrganizationInvitationPurpose } from "../organizationInvitation/purpose";
import { resolveFreeManagerExchangeEligibility } from "../organizationInvitation/service";
import { normalizeEmail } from "../staff/service";
import type { OrganizationUsageSnapshot } from "./service";

export const managerInvitationStateValidator = v.union(
  v.object({
    kind: v.literal("available"),
    mode: v.union(v.literal("addition"), v.literal("freeManagerExchange")),
    replacesStaleInvitation: v.boolean(),
  }),
  v.object({
    kind: v.literal("pending"),
    mode: v.union(v.literal("addition"), v.literal("freeManagerExchange")),
  }),
  v.object({ kind: v.literal("unavailable"), reason: v.string() }),
);

export type ManagerInvitationState =
  | { kind: "available"; mode: "addition" | "freeManagerExchange"; replacesStaleInvitation: boolean }
  | { kind: "pending"; mode: "addition" | "freeManagerExchange" }
  | { kind: "unavailable"; reason: string };

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export async function resolvePersonManagerInvitationState(
  ctx: DbCtx,
  args: {
    organization: Doc<"organizations"> | null;
    actorMember: Doc<"organizationMembers"> | null;
    person: Doc<"organizationPeople"> | null;
    personMembers: readonly Doc<"organizationMembers">[];
    contactEmail: string;
    isOrganizationLinked: boolean;
    billingState: Doc<"organizationBillingStates"> | null;
    usage: OrganizationUsageSnapshot | null;
    activePendingInvitations: readonly Doc<"organizationInvitations">[];
  },
): Promise<ManagerInvitationState> {
  const { organization, actorMember, person, personMembers, usage } = args;
  if (
    !organization ||
    !actorMember ||
    !usage ||
    !args.isOrganizationLinked ||
    !person ||
    person.organizationId !== organization._id ||
    person.status !== "active"
  ) {
    return {
      kind: "unavailable",
      reason: "グループ単位の設定を移行しています。完了後にもう一度お試しください。",
    };
  }

  if (personMembers.length > 1 || (personMembers[0] && person.userId && personMembers[0].userId !== person.userId)) {
    return {
      kind: "unavailable",
      reason: "このユーザーの管理者権限を確認できません。グループ設定を確認してください。",
    };
  }
  if (personMembers.length === 1 && personMembers[0].status === "active") {
    return { kind: "unavailable", reason: "このユーザーはすでに管理者です。" };
  }

  const emailNormalized = normalizeEmail(person.email);
  if (!emailNormalized || normalizeEmail(args.contactEmail) !== emailNormalized) {
    return {
      kind: "unavailable",
      reason: "ユーザー情報のメールアドレスを確認してください。",
    };
  }

  const targetInvitations = args.activePendingInvitations.filter(
    (invitation) => invitation.targetPersonId === person._id,
  );
  const currentEmailInvitations = args.activePendingInvitations.filter(
    (invitation) => invitation.emailNormalized === emailNormalized,
  );
  const staleTargetInvitations = targetInvitations.filter(
    (invitation) => invitation.emailNormalized !== emailNormalized,
  );
  const applicableInvitationIds = new Set(
    [...targetInvitations, ...currentEmailInvitations].map((invitation) => invitation._id),
  );
  if (
    applicableInvitationIds.size > 1 ||
    (currentEmailInvitations[0]?.targetPersonId !== undefined &&
      currentEmailInvitations[0].targetPersonId !== person._id)
  ) {
    return {
      kind: "unavailable",
      reason: "このユーザーへの招待状態を確認できません。グループ設定を確認してください。",
    };
  }
  if (currentEmailInvitations[0]) {
    return {
      kind: "pending",
      mode:
        getOrganizationInvitationPurpose(currentEmailInvitations[0]) === "freeManagerExchange"
          ? "freeManagerExchange"
          : "addition",
    };
  }
  if (actorMember.status !== "active") {
    return { kind: "unavailable", reason: "閲覧のみの管理者は、管理者招待を送れません。" };
  }

  const policy = args.billingState ? deriveOrganizationBillingPolicy(args.billingState.state) : null;
  if (!args.billingState || !policy) {
    return {
      kind: "unavailable",
      reason: "グループのプラン設定を移行しています。完了後にもう一度お試しください。",
    };
  }
  if (!policy.canWriteBusinessData) {
    return { kind: "unavailable", reason: "現在の契約状態では、管理者招待を送れません。" };
  }
  if (policy.entitlementPlan === "free") {
    const exchange = await resolveFreeManagerExchangeEligibility(ctx, {
      organizationId: organization._id,
      inviterMemberId: actorMember._id,
      emailNormalized,
      targetPersonId: person._id,
    });
    const staleInvitationId = staleTargetInvitations[0]?._id;
    const hasOtherFreeExchange = args.activePendingInvitations.some(
      (invitation) =>
        invitation._id !== staleInvitationId && getOrganizationInvitationPurpose(invitation) === "freeManagerExchange",
    );
    return exchange && !hasOtherFreeExchange
      ? {
          kind: "available",
          mode: "freeManagerExchange",
          replacesStaleInvitation: staleTargetInvitations.length === 1,
        }
      : {
          kind: "unavailable",
          reason: hasOtherFreeExchange
            ? "次の管理者のログインを待っています。切り替わるまでは現在の管理者が引き続き利用できます。"
            : "無料では、グループ内の既存スタッフとの管理者交代だけを利用できます。",
        };
  }
  if (!policy.canUsePaidFeatures || !policy.limits) {
    return { kind: "unavailable", reason: "現在のプランでは管理者を追加できません。" };
  }

  const staleManagerReservation = staleTargetInvitations.some(
    (invitation) => getOrganizationInvitationPurpose(invitation) === "managerAddition",
  )
    ? 1
    : 0;
  const projectedAfterInvitation = usage.projectedActiveManagerCount - staleManagerReservation + 1;
  return projectedAfterInvitation <= policy.limits.maxActiveManagers
    ? {
        kind: "available",
        mode: "addition",
        replacesStaleInvitation: staleTargetInvitations.length === 1,
      }
    : {
        kind: "unavailable",
        reason:
          "管理者と招待中の管理者は、グループ全体で5名までです。管理者権限を外すか、招待を取り消してからもう一度お試しください。",
      };
}
