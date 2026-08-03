import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeEmail } from "../_lib/validation";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";

type OrganizationPersonProfileMutationCtx = MutationCtx;

export async function updateOrganizationPersonProfile(
  ctx: OrganizationPersonProfileMutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    actorUser: Doc<"users">;
    notificationShopId: Id<"shops">;
    name: string;
    email: string;
  },
) {
  const person = await ctx.db.get(args.personId);
  if (!person || person.organizationId !== args.organizationId || person.status !== "active") {
    throw new ConvexError("Not found");
  }

  const emailNormalized = normalizeEmail(args.email);
  const hasLinkedAccount = person.userId !== undefined;
  if (hasLinkedAccount && emailNormalized !== normalizeEmail(person.email)) {
    throw new ConvexError("アカウント連携済みユーザーのメールアドレスは、本人だけが変更できます。");
  }
  const matchingPeople = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_emailNormalized", (q) =>
      q.eq("organizationId", args.organizationId).eq("emailNormalized", emailNormalized),
    )
    .take(2);
  if (matchingPeople.some((candidate) => candidate._id !== person._id)) {
    throw new ConvexError("このメールアドレスは、グループ内の別のユーザーが使用しています。");
  }

  const linkedStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.organizationId).eq("organizationPersonId", person._id),
    )
    .collect();
  const activeStaffs = linkedStaffs.filter((staff) => !staff.isDeleted);
  const targetCountByShop = new Map<Id<"shops">, number>();
  for (const staff of activeStaffs) {
    const count = (targetCountByShop.get(staff.shopId) ?? 0) + 1;
    targetCountByShop.set(staff.shopId, count);
    if (count > 1) {
      throw new ConvexError(
        "スタッフの店舗所属を確認できません。\n画面を更新しても解消しない場合は、お問い合わせください。",
      );
    }

    const [normalizedMatches, legacyMatches] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
          q.eq("shopId", staff.shopId).eq("emailNormalized", emailNormalized).eq("isDeleted", false),
        )
        .take(2),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_email_isDeleted", (q) =>
          q.eq("shopId", staff.shopId).eq("email", emailNormalized).eq("isDeleted", false),
        )
        .take(2),
    ]);
    const hasIndexedConflict = [...normalizedMatches, ...legacyMatches].some(
      (candidate) => candidate.organizationPersonId !== person._id,
    );
    const hasLegacyConflict =
      !hasIndexedConflict &&
      (
        await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", staff.shopId).eq("isDeleted", false))
          .collect()
      ).some(
        (candidate) =>
          candidate.organizationPersonId !== person._id && normalizeEmail(candidate.email) === emailNormalized,
      );
    if (hasIndexedConflict || hasLegacyConflict) {
      throw new ConvexError("このメールアドレスはすでに使用されています。");
    }
  }

  const previousEmailNormalized = normalizeEmail(person.email);
  const emailChanged = !hasLinkedAccount && emailNormalized !== previousEmailNormalized;
  const shouldSyncActorUser = person.userId === args.actorUser._id;
  const changed =
    person.name !== args.name ||
    (!hasLinkedAccount && (person.email !== emailNormalized || person.emailNormalized !== emailNormalized)) ||
    activeStaffs.some(
      (staff) =>
        staff.name !== args.name ||
        (!hasLinkedAccount && (staff.email !== emailNormalized || staff.emailNormalized !== emailNormalized)),
    ) ||
    (shouldSyncActorUser && args.actorUser.name !== args.name);
  if (!changed) return { changed: false, emailChanged: false };

  const updatedAt = Date.now();
  for (const staff of activeStaffs) {
    await ctx.db.patch(
      staff._id,
      hasLinkedAccount ? { name: args.name } : { name: args.name, email: emailNormalized, emailNormalized },
    );
  }
  await ctx.db.patch(
    person._id,
    hasLinkedAccount
      ? { name: args.name, updatedAt }
      : { name: args.name, email: emailNormalized, emailNormalized, updatedAt },
  );
  if (shouldSyncActorUser) {
    // 管理者自身をスタッフとして持つ店舗では、スタッフ名と管理者名を同じ表示名として同期する。
    await ctx.db.patch(args.actorUser._id, { name: args.name });
  }

  if (emailChanged) {
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: args.notificationShopId });
    for (const staff of activeStaffs) {
      await ctx.scheduler.runAfter(
        0,
        internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange,
        {
          staffId: staff._id,
          expectedEmailNormalized: emailNormalized,
          emailChangedAt: updatedAt,
          ...notificationOrigin,
        },
      );
    }
  }

  return { changed: true, emailChanged };
}
