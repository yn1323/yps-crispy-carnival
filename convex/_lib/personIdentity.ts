import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { ORGANIZATION_PERSON_EMAIL_HISTORY_SCAN_LIMIT } from "../constants";
import { getEffectiveRestrictedBillingState } from "../organizationBilling/policy";
import { normalizeEmail } from "./validation";

type OrganizationPersonIdentityCtx = {
  db: GenericDatabaseReader<DataModel>;
};

type OrganizationPersonEmailResolution =
  | {
      kind: "active" | "removed";
      person: Doc<"organizationPeople">;
    }
  | { kind: "new" }
  | { kind: "conflict" };

async function isRemovedOrganizationPersonDetached(
  ctx: OrganizationPersonIdentityCtx,
  args: { organizationId: Id<"organizations">; person: Doc<"organizationPeople"> },
) {
  const [activeStaff, members, activeLineLinks] = await Promise.all([
    ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
        q.eq("organizationId", args.organizationId).eq("organizationPersonId", args.person._id).eq("isDeleted", false),
      )
      .first(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_personId", (q) =>
        q.eq("organizationId", args.organizationId).eq("personId", args.person._id),
      )
      .take(2),
    ctx.db
      .query("organizationPersonLineLinks")
      .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
        q.eq("organizationPersonId", args.person._id).eq("isDeleted", false),
      )
      .take(1),
  ]);
  if (members.length > 1) return false;
  if (members[0] && (!args.person.userId || members[0].userId !== args.person.userId)) return false;
  const activeInvitationsIssuedByMember = members[0]
    ? (
        await Promise.all(
          (["issued", "pending"] as const).map(
            async (status) =>
              await ctx.db
                .query("organizationInvitations")
                .withIndex("by_inviterMemberId_and_status", (q) =>
                  q.eq("inviterMemberId", members[0]._id).eq("status", status),
                )
                .take(1),
          ),
        )
      ).flat()
    : [];
  return (
    !activeStaff &&
    members.every((member) => member.status === "removed") &&
    activeLineLinks.length === 0 &&
    activeInvitationsIssuedByMember.length === 0
  );
}

/**
 * 同じメールの現役人物または通常削除された再利用候補を一意に解決する。
 * アカウント削除済みuserに紐づくremoved人物は履歴として残し、再利用候補から除外する。
 */
export async function resolveOrganizationPersonEmail(
  ctx: OrganizationPersonIdentityCtx,
  args: { organizationId: Id<"organizations">; emailNormalized: string },
): Promise<OrganizationPersonEmailResolution> {
  const emailNormalized = normalizeEmail(args.emailNormalized);
  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_emailNormalized", (q) =>
      q.eq("organizationId", args.organizationId).eq("emailNormalized", emailNormalized),
    )
    .take(ORGANIZATION_PERSON_EMAIL_HISTORY_SCAN_LIMIT + 1);
  if (
    people.length > ORGANIZATION_PERSON_EMAIL_HISTORY_SCAN_LIMIT ||
    people.some(
      (person) => person.emailNormalized !== emailNormalized || normalizeEmail(person.email) !== emailNormalized,
    )
  ) {
    return { kind: "conflict" };
  }

  const linkedUsers = await Promise.all(
    people.map(async (person) => (person.userId ? await ctx.db.get(person.userId) : null)),
  );
  const activePeople: Doc<"organizationPeople">[] = [];
  const reusableRemovedPeople: Doc<"organizationPeople">[] = [];
  for (const [index, person] of people.entries()) {
    const linkedUser = linkedUsers[index];
    if (person.userId && !linkedUser) return { kind: "conflict" };

    const accountWasDeleted = Boolean(
      linkedUser && (linkedUser.isDeleted || linkedUser.accountDeletionRequestedAt !== undefined),
    );
    if (person.status === "active") {
      if (accountWasDeleted) return { kind: "conflict" };
      activePeople.push(person);
    } else {
      // terminalなremoved人物は返さない。旧関連は旧IDに残るため、新しい人物へ復元・付替えされない。
      if (accountWasDeleted) continue;
      reusableRemovedPeople.push(person);
    }
  }

  if (reusableRemovedPeople[0]) {
    const billingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(2);
    if (billingStates.length > 1) return { kind: "conflict" };
    const billingState = billingStates[0];
    const recoveryManagerPersonIds = billingState
      ? (getEffectiveRestrictedBillingState(billingState.state)?.recoveryManagerPersonIds ?? [])
      : [];
    if (
      billingState?.freeManagerPersonId === reusableRemovedPeople[0]._id ||
      recoveryManagerPersonIds.includes(reusableRemovedPeople[0]._id)
    ) {
      return { kind: "conflict" };
    }
  }

  if (
    activePeople.length > 1 ||
    reusableRemovedPeople.length > 1 ||
    (activePeople.length === 1 && reusableRemovedPeople.length === 1)
  ) {
    return { kind: "conflict" };
  }
  if (activePeople[0]) return { kind: "active", person: activePeople[0] };
  if (reusableRemovedPeople[0]) {
    return { kind: "removed", person: reusableRemovedPeople[0] };
  }
  return { kind: "new" };
}

/** 管理者招待では、通常削除人物に終了済みでない所属・権限・LINE連携・発行済み招待が残っていないことも確認する。 */
export async function resolveOrganizationPersonEmailForManagerAddition(
  ctx: OrganizationPersonIdentityCtx,
  args: { organizationId: Id<"organizations">; emailNormalized: string },
): Promise<OrganizationPersonEmailResolution> {
  const resolution = await resolveOrganizationPersonEmail(ctx, args);
  if (
    resolution.kind === "removed" &&
    !(await isRemovedOrganizationPersonDetached(ctx, {
      organizationId: args.organizationId,
      person: resolution.person,
    }))
  ) {
    return { kind: "conflict" };
  }
  return resolution;
}
