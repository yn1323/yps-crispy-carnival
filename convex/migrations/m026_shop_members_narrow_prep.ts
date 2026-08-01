import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { migrations } from "./index";
import {
  normalizeMigrationEmail,
  normalizeMigrationName,
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const OWNED_CONFLICT_CODES = [
  "shop_without_organization",
  "missing_user",
  "ambiguous_user_organization_member",
  "invalid_member_person_link",
  "member_person_user_mismatch",
  "ambiguous_user_person",
  "member_person_identity_mismatch",
  "missing_user_email",
  "ambiguous_email_person",
  "member_person_email_mismatch",
  "email_name_mismatch",
  "email_person_user_mismatch",
  "email_person_identity_mismatch",
  "ambiguous_legacy_shop_membership",
  "ambiguous_organization_member",
  "member_user_mismatch",
  "ambiguous_manager_staff",
  "manager_staff_link_mismatch",
] as const;

/** 既存の店舗管理者を、店舗の事業者に属する人物と管理者所属へ移行する。 */
export async function migrateShopMemberToOrganizationMember(
  ctx: Pick<MutationCtx, "db">,
  shopMember: Doc<"shopMembers">,
) {
  const shop = await ctx.db.get(shopMember.shopId);
  if (!shop?.organizationId) {
    await recordOrganizationMigrationConflict(ctx, {
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "shop_without_organization",
    });
    return;
  }
  const organizationId = shop.organizationId;

  const user = await ctx.db.get(shopMember.userId);
  if (!user) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "missing_user",
    });
    return;
  }

  const userMembers = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id).eq("organizationId", organizationId))
    .take(2);
  if (userMembers.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_user_organization_member",
    });
    return;
  }
  const userMember = userMembers[0] ?? null;
  const memberPerson = userMember ? await ctx.db.get(userMember.personId) : null;
  if (userMember && memberPerson?.organizationId !== organizationId) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "invalid_member_person_link",
    });
    return;
  }
  if (memberPerson?.userId && memberPerson.userId !== user._id) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "member_person_user_mismatch",
    });
    return;
  }

  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", user._id))
    .take(2);
  if (people.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_user_person",
    });
    return;
  }

  if (memberPerson && people[0] && people[0]._id !== memberPerson._id) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "member_person_identity_mismatch",
    });
    return;
  }

  let existingPerson = memberPerson ?? people[0] ?? null;
  // 保存済み派生値がstaleでも別人物へ結び付けないよう、raw emailを正として再計算する。
  const emailNormalized = normalizeMigrationEmail(user.email);
  if (!emailNormalized && !existingPerson) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "missing_user_email",
    });
    return;
  }

  const emailPeople = emailNormalized
    ? await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", organizationId).eq("emailNormalized", emailNormalized),
        )
        .take(2)
    : [];
  if (emailPeople.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_email_person",
    });
    return;
  }
  const emailPerson = emailPeople[0] ?? null;

  if (memberPerson && !memberPerson.userId) {
    if (!emailNormalized || !emailPerson) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: emailNormalized ? "member_person_email_mismatch" : "missing_user_email",
      });
      return;
    }
    if (normalizeMigrationName(memberPerson.name) !== normalizeMigrationName(user.name)) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: "email_name_mismatch",
      });
      return;
    }
  }

  if (existingPerson && emailPerson && emailPerson._id !== existingPerson._id) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code:
        emailPerson.userId && emailPerson.userId !== user._id
          ? "email_person_user_mismatch"
          : "email_person_identity_mismatch",
    });
    return;
  }

  if (!existingPerson) {
    if (emailPerson?.userId && emailPerson.userId !== user._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: "email_person_user_mismatch",
      });
      return;
    }
    if (emailPerson && normalizeMigrationName(emailPerson.name) !== normalizeMigrationName(user.name)) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId,
        sourceType: "shopMember",
        sourceId: shopMember._id,
        code: "email_name_mismatch",
      });
      return;
    }
    if (emailPerson) {
      existingPerson = emailPerson;
    }
  }

  const activeLegacyMemberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
      q.eq("userId", user._id).eq("shopId", shop._id).eq("isDeleted", false),
    )
    .take(2);
  if (activeLegacyMemberships.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_legacy_shop_membership",
    });
    return;
  }
  const now = Date.now();
  const hasActiveMembership = Boolean(activeLegacyMemberships[0]) && !user.isDeleted;
  const members = existingPerson
    ? await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", organizationId).eq("personId", existingPerson._id),
        )
        .take(2)
    : [];
  if (members.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_organization_member",
    });
    return;
  }
  if (members[0] && members[0].userId !== user._id) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "member_user_mismatch",
    });
    return;
  }
  if (userMember && members[0]?._id !== userMember._id) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "member_person_identity_mismatch",
    });
    return;
  }

  const managerStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_userId_and_shopId", (q) => q.eq("userId", user._id).eq("shopId", shop._id))
    .take(2);
  if (managerStaffs.length > 1) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "ambiguous_manager_staff",
    });
    return;
  }
  const managerStaff = managerStaffs[0] ?? null;
  const expectedPersonId = existingPerson?._id;
  const hasConflictingCanonicalLink =
    managerStaff !== null &&
    ((managerStaff.organizationId !== undefined && managerStaff.organizationId !== organizationId) ||
      (managerStaff.organizationPersonId !== undefined && managerStaff.organizationPersonId !== expectedPersonId));
  if (hasConflictingCanonicalLink) {
    await recordOrganizationMigrationConflict(ctx, {
      organizationId,
      sourceType: "shopMember",
      sourceId: shopMember._id,
      code: "manager_staff_link_mismatch",
    });
    return;
  }

  // 以降はcanonical候補をすべて検証済み。競合returnより前に部分書込を残さない。
  if (existingPerson && !existingPerson.userId) {
    await ctx.db.patch(existingPerson._id, { userId: user._id, updatedAt: now });
  }
  const personStatus = hasActiveMembership ? ("active" as const) : ("removed" as const);
  const personId =
    existingPerson?._id ??
    (await ctx.db.insert("organizationPeople", {
      organizationId,
      userId: user._id,
      name: user.name,
      email: user.email,
      emailNormalized,
      status: personStatus,
      createdAt: now,
      updatedAt: now,
    }));

  // 既存人物のremovedはcanonical lifecycleとして保全し、新規memberだけ安全側で作る。
  const memberStatus =
    existingPerson?.status === "removed"
      ? ("removed" as const)
      : hasActiveMembership
        ? ("active" as const)
        : ("removed" as const);
  if (!members[0]) {
    await ctx.db.insert("organizationMembers", {
      organizationId,
      personId,
      userId: user._id,
      status: memberStatus,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (managerStaff && (managerStaff.organizationId === undefined || managerStaff.organizationPersonId === undefined)) {
    await ctx.db.patch(managerStaff._id, { organizationId, organizationPersonId: personId });
  }

  // m014以降も同じsource keyへ別目的のconflictを記録するため、m010/m026所有分だけ解消する。
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "shopMember",
    sourceId: shopMember._id,
    codes: OWNED_CONFLICT_CODES,
  });
}

export const migration = migrations.define({
  table: "shopMembers",
  migrateOne: migrateShopMemberToOrganizationMember,
});
