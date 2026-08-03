import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeEmail } from "../_lib/validation";
import {
  ACCOUNT_EMAIL_PERSON_SCAN_LIMIT,
  ACCOUNT_EMAIL_SHOP_STAFF_SCAN_LIMIT,
  ACCOUNT_EMAIL_STAFF_SCAN_LIMIT,
} from "../constants";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";

type AccountEmailTargets = {
  people: Doc<"organizationPeople">[];
  staffs: Doc<"staffs">[];
};

export async function assertAccountEmailAvailable(
  ctx: MutationCtx,
  userId: Id<"users">,
  emailNormalized: string,
): Promise<AccountEmailTargets> {
  const targets = await collectAccountEmailTargets(ctx, userId);
  const personIds = new Set(targets.people.map((person) => person._id));
  const staffIds = new Set(targets.staffs.map((staff) => staff._id));

  for (const person of targets.people) {
    const conflicts = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", person.organizationId).eq("emailNormalized", emailNormalized),
      )
      .take(2);
    if (conflicts.some((candidate) => !personIds.has(candidate._id))) {
      throw new ConvexError("このメールアドレスは、グループ内の別のユーザーが使用しています。");
    }
  }

  const staffsByShop = new Map<Id<"shops">, Doc<"staffs">[]>();
  for (const target of targets.staffs) {
    let activeStaffs = staffsByShop.get(target.shopId);
    if (!activeStaffs) {
      activeStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", target.shopId).eq("isDeleted", false))
        .take(ACCOUNT_EMAIL_SHOP_STAFF_SCAN_LIMIT + 1);
      if (activeStaffs.length > ACCOUNT_EMAIL_SHOP_STAFF_SCAN_LIMIT) {
        throw new ConvexError("メールアドレスを安全に確認できません。お問い合わせください。");
      }
      staffsByShop.set(target.shopId, activeStaffs);
    }
    if (
      activeStaffs.some(
        (candidate) => !staffIds.has(candidate._id) && normalizeEmail(candidate.email) === emailNormalized,
      )
    ) {
      throw new ConvexError("このメールアドレスはすでに使用されています。");
    }
  }

  return targets;
}

export async function syncAccountEmail(
  ctx: MutationCtx,
  args: {
    user: Doc<"users">;
    emailNormalized: string;
    requestKey: string;
  },
) {
  const targets = await assertAccountEmailAvailable(ctx, args.user._id, args.emailNormalized);
  const changedPeople = targets.people.filter(
    (person) => person.email !== args.emailNormalized || person.emailNormalized !== args.emailNormalized,
  );
  const changedStaffs = targets.staffs.filter(
    (staff) => staff.email !== args.emailNormalized || staff.emailNormalized !== args.emailNormalized,
  );
  const userChanged = args.user.email !== args.emailNormalized || args.user.emailNormalized !== args.emailNormalized;
  if (!userChanged && changedPeople.length === 0 && changedStaffs.length === 0) {
    return { changed: false };
  }

  const peopleByOrganization = new Map<Id<"organizations">, Doc<"organizationPeople">>();
  for (const person of targets.people) {
    if (peopleByOrganization.has(person.organizationId)) {
      throw new ConvexError("メールアドレスの同期対象を一意に確認できません。お問い合わせください。");
    }
    peopleByOrganization.set(person.organizationId, person);
  }
  for (const [organizationId, person] of peopleByOrganization) {
    const correlationId = `${organizationId}:account-email:${args.user._id}:${args.requestKey}`;
    const prior = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .take(2);
    if (prior.length > 0) {
      throw new ConvexError("以前の操作結果を確認できません。画面を更新してください。");
    }
    if (person.userId !== args.user._id) {
      throw new ConvexError("メールアドレスの同期対象を確認できません。");
    }
  }

  const notificationOrigins = new Map<Id<"shops">, Awaited<ReturnType<typeof getBusinessNotificationOrigin>>>();
  for (const staff of changedStaffs) {
    if (normalizeEmail(staff.email) === args.emailNormalized || notificationOrigins.has(staff.shopId)) continue;
    notificationOrigins.set(staff.shopId, await getBusinessNotificationOrigin(ctx, { shopId: staff.shopId }));
  }

  const updatedAt = Date.now();
  await ctx.db.patch(args.user._id, {
    email: args.emailNormalized,
    emailNormalized: args.emailNormalized,
  });
  for (const person of changedPeople) {
    await ctx.db.patch(person._id, {
      email: args.emailNormalized,
      emailNormalized: args.emailNormalized,
      updatedAt,
    });
  }
  for (const staff of changedStaffs) {
    await ctx.db.patch(staff._id, {
      email: args.emailNormalized,
      emailNormalized: args.emailNormalized,
    });
  }

  for (const [organizationId, person] of peopleByOrganization) {
    const changedInOrganization =
      changedPeople.some((candidate) => candidate.organizationId === organizationId) ||
      changedStaffs.some((staff) => staff.organizationId === organizationId);
    if (!changedInOrganization) continue;
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      actorUserId: args.user._id,
      actorPersonId: person._id,
      action: "organization.account_email_synced",
      targetKind: "person",
      targetId: person._id,
      toState: "synced",
      correlationId: `${organizationId}:account-email:${args.user._id}:${args.requestKey}`,
      occurredAt: updatedAt,
      suppressAnalyticsEvent: true,
    });
  }

  for (const staff of changedStaffs) {
    if (normalizeEmail(staff.email) === args.emailNormalized) continue;
    await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange,
      {
        staffId: staff._id,
        expectedEmailNormalized: args.emailNormalized,
        emailChangedAt: updatedAt,
        ...(notificationOrigins.get(staff.shopId) ?? {}),
      },
    );
  }

  return { changed: true };
}

async function collectAccountEmailTargets(ctx: MutationCtx, userId: Id<"users">): Promise<AccountEmailTargets> {
  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .take(ACCOUNT_EMAIL_PERSON_SCAN_LIMIT + 1);
  if (people.length > ACCOUNT_EMAIL_PERSON_SCAN_LIMIT) {
    throw new ConvexError("メールアドレスの同期対象が多すぎます。お問い合わせください。");
  }

  const organizationIds = new Set<Id<"organizations">>();
  for (const person of people) {
    if (organizationIds.has(person.organizationId)) {
      throw new ConvexError("メールアドレスの同期対象を一意に確認できません。お問い合わせください。");
    }
    const organization = await ctx.db.get(person.organizationId);
    if (!organization || organization.isDeleted) {
      throw new ConvexError("メールアドレスの同期対象を確認できません。お問い合わせください。");
    }
    organizationIds.add(person.organizationId);
  }

  const byUserId = await ctx.db
    .query("staffs")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .take(ACCOUNT_EMAIL_STAFF_SCAN_LIMIT + 1);
  if (byUserId.length > ACCOUNT_EMAIL_STAFF_SCAN_LIMIT) {
    throw new ConvexError("メールアドレスの同期対象が多すぎます。お問い合わせください。");
  }

  const staffsById = new Map(byUserId.map((staff) => [staff._id, staff]));
  for (const person of people) {
    const linked = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", person.organizationId).eq("organizationPersonId", person._id),
      )
      .take(ACCOUNT_EMAIL_STAFF_SCAN_LIMIT + 1);
    for (const staff of linked) {
      if (staff.isDeleted) continue;
      if (staff.userId !== undefined && staff.userId !== userId) {
        throw new ConvexError("メールアドレスの同期対象を確認できません。お問い合わせください。");
      }
      staffsById.set(staff._id, staff);
      if (staffsById.size > ACCOUNT_EMAIL_STAFF_SCAN_LIMIT) {
        throw new ConvexError("メールアドレスの同期対象が多すぎます。お問い合わせください。");
      }
    }
  }

  const shops = new Set<Id<"shops">>();
  for (const staff of staffsById.values()) {
    if (shops.has(staff.shopId)) {
      throw new ConvexError("店舗ごとのメールアドレス同期対象を一意に確認できません。お問い合わせください。");
    }
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) {
      throw new ConvexError("メールアドレスの同期対象を確認できません。お問い合わせください。");
    }
    shops.add(staff.shopId);
  }

  return { people, staffs: [...staffsById.values()] };
}
