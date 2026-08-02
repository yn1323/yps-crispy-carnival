import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { migrations } from "./index";
import {
  normalizeMigrationEmail,
  normalizeMigrationName,
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const EMAIL_MATCH_SCAN_LIMIT = 100;

const OWNED_CONFLICT_CODES = [
  "shop_without_organization",
  "missing_user",
  "ambiguous_user_person",
  "email_match_scan_limit_exceeded",
  "invalid_organization_person_link",
  "linked_person_user_mismatch",
  "ambiguous_email_person",
  "email_person_user_mismatch",
  "email_person_identity_mismatch",
  "linked_person_email_mismatch",
  "missing_email",
  "email_name_mismatch",
  "ambiguous_email_and_name",
  "narrow_prep_canonical_link_mismatch",
  "active_staff_matches_removed_person",
] as const;

async function resolveStaffMigrationConflicts(ctx: Pick<MutationCtx, "db">, staffId: Doc<"staffs">["_id"]) {
  await resolveOrganizationMigrationConflicts(ctx, {
    sourceType: "staff",
    sourceId: staffId,
    codes: OWNED_CONFLICT_CODES,
  });
}

async function recordStaffMigrationConflict(
  ctx: Pick<MutationCtx, "db">,
  staff: Doc<"staffs">,
  args: { organizationId?: Id<"organizations">; code: string },
) {
  // forward prepでは既存linkを消して旧形式へ戻さず、readinessとconflictに修復対象を残す。
  await recordOrganizationMigrationConflict(ctx, {
    organizationId: args.organizationId,
    sourceType: "staff",
    sourceId: staff._id,
    code: args.code,
  });
}

/**
 * 既存スタッフを事業者内の人物へ移行する。
 *
 * userId が一意ならその人物へ結び付ける。それ以外は、正規化済みメールアドレスと
 * 正規化済み氏名が両方一致する場合だけ既存人物へ統合する。
 */
export async function migrateStaffToOrganizationPerson(ctx: Pick<MutationCtx, "db">, staff: Doc<"staffs">) {
  const shop = await ctx.db.get(staff.shopId);
  if (!shop?.organizationId) {
    await recordStaffMigrationConflict(ctx, staff, {
      code: "shop_without_organization",
    });
    return;
  }
  const organizationId = shop.organizationId;
  const now = Date.now();

  let userPeople: Doc<"organizationPeople">[] = [];
  if (staff.userId) {
    const user = await ctx.db.get(staff.userId);
    if (!user) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "missing_user",
      });
      return;
    }
    userPeople = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", organizationId).eq("userId", staff.userId),
      )
      .take(2);
    if (userPeople.length > 1) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "ambiguous_user_person",
      });
      return;
    }
  }

  // 保存済み派生値がstaleでも別人物へ結び付けないよう、raw emailを正として再計算する。
  const emailNormalized = normalizeMigrationEmail(staff.email);
  const emailMatches =
    emailNormalized && (staff.userId !== undefined || staff.organizationPersonId === undefined)
      ? await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) =>
            q.eq("organizationId", organizationId).eq("emailNormalized", emailNormalized),
          )
          .take(EMAIL_MATCH_SCAN_LIMIT + 1)
      : [];
  if (emailMatches.length > EMAIL_MATCH_SCAN_LIMIT) {
    await recordStaffMigrationConflict(ctx, staff, {
      organizationId,
      code: "email_match_scan_limit_exceeded",
    });
    return;
  }
  const nameNormalized = normalizeMigrationName(staff.name);

  if (staff.organizationPersonId) {
    const linkedPerson = await ctx.db.get(staff.organizationPersonId);
    if (linkedPerson?.organizationId !== organizationId) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "invalid_organization_person_link",
      });
      return;
    }

    if (staff.userId) {
      if (linkedPerson.userId && linkedPerson.userId !== staff.userId) {
        await recordStaffMigrationConflict(ctx, staff, {
          organizationId,
          code: "linked_person_user_mismatch",
        });
        return;
      }
      if (userPeople[0] && userPeople[0]._id !== linkedPerson._id) {
        await recordStaffMigrationConflict(ctx, staff, {
          organizationId,
          code: "linked_person_user_mismatch",
        });
        return;
      }
      if (emailMatches.length > 1) {
        await recordStaffMigrationConflict(ctx, staff, {
          organizationId,
          code: "ambiguous_email_person",
        });
        return;
      }
      const emailPerson = emailMatches[0] ?? null;
      if (emailPerson && emailPerson._id !== linkedPerson._id) {
        await recordStaffMigrationConflict(ctx, staff, {
          organizationId,
          code:
            emailPerson.userId && emailPerson.userId !== staff.userId
              ? "email_person_user_mismatch"
              : "email_person_identity_mismatch",
        });
        return;
      }
      if (!linkedPerson.userId) {
        if (!emailNormalized || !emailPerson) {
          await recordStaffMigrationConflict(ctx, staff, {
            organizationId,
            code: emailNormalized ? "linked_person_email_mismatch" : "missing_email",
          });
          return;
        }
        if (normalizeMigrationName(linkedPerson.name) !== nameNormalized) {
          await recordStaffMigrationConflict(ctx, staff, {
            organizationId,
            code: "email_name_mismatch",
          });
          return;
        }
        await ctx.db.patch(linkedPerson._id, { userId: staff.userId, updatedAt: now });
      }
    }

    if (staff.organizationId !== organizationId) {
      await ctx.db.patch(staff._id, { organizationId });
    }
    // canonical person lifecycleは人物管理・課金workflowの正本。再実行では上書きしない。
    await resolveStaffMigrationConflicts(ctx, staff._id);
    return;
  }

  if (userPeople.length === 1) {
    if (emailMatches.length > 1) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "ambiguous_email_person",
      });
      return;
    }
    const emailPerson = emailMatches[0] ?? null;
    if (emailPerson && emailPerson._id !== userPeople[0]._id) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code:
          emailPerson.userId && emailPerson.userId !== staff.userId
            ? "email_person_user_mismatch"
            : "email_person_identity_mismatch",
      });
      return;
    }
    if (!staff.isDeleted && userPeople[0].status === "removed") {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "active_staff_matches_removed_person",
      });
      return;
    }
    await ctx.db.patch(staff._id, { organizationId, organizationPersonId: userPeople[0]._id });
    await resolveStaffMigrationConflicts(ctx, staff._id);
    return;
  }

  if (!emailNormalized) {
    await recordStaffMigrationConflict(ctx, staff, {
      organizationId,
      code: "missing_email",
    });
    return;
  }

  if (staff.userId) {
    if (emailMatches.length > 1) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "ambiguous_email_person",
      });
      return;
    }
    const emailPerson = emailMatches[0] ?? null;
    if (emailPerson?.userId && emailPerson.userId !== staff.userId) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "email_person_user_mismatch",
      });
      return;
    }
    if (emailPerson && normalizeMigrationName(emailPerson.name) !== nameNormalized) {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "email_name_mismatch",
      });
      return;
    }
    if (emailPerson) {
      if (!staff.isDeleted && emailPerson.status === "removed") {
        await recordStaffMigrationConflict(ctx, staff, {
          organizationId,
          code: "active_staff_matches_removed_person",
        });
        return;
      }
      if (!emailPerson.userId) await ctx.db.patch(emailPerson._id, { userId: staff.userId, updatedAt: now });
      await ctx.db.patch(staff._id, { organizationId, organizationPersonId: emailPerson._id });
      await resolveStaffMigrationConflicts(ctx, staff._id);
      return;
    }
  }

  // 既存の同一メール重複は氏名で推測して統合せず、canonical人物を先に修復してから再実行する。
  if (emailMatches.length > 1) {
    await recordStaffMigrationConflict(ctx, staff, {
      organizationId,
      code: "ambiguous_email_person",
    });
    return;
  }

  const matchingPeople = emailMatches.filter((person) => normalizeMigrationName(person.name) === nameNormalized);

  if (matchingPeople.length === 1) {
    const person = matchingPeople[0];
    if (!staff.isDeleted && person.status === "removed") {
      await recordStaffMigrationConflict(ctx, staff, {
        organizationId,
        code: "active_staff_matches_removed_person",
      });
      return;
    }
    await ctx.db.patch(staff._id, { organizationId, organizationPersonId: person._id });
    await resolveStaffMigrationConflicts(ctx, staff._id);
    return;
  }

  if (emailMatches.length > 0) {
    await recordStaffMigrationConflict(ctx, staff, {
      organizationId,
      code: matchingPeople.length > 1 ? "ambiguous_email_and_name" : "email_name_mismatch",
    });
    return;
  }

  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId: staff.userId,
    name: staff.name,
    email: staff.email,
    emailNormalized,
    status: staff.isDeleted ? "removed" : "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(staff._id, { organizationId, organizationPersonId: personId });
  await resolveStaffMigrationConflicts(ctx, staff._id);
}

async function repairLateLegacyStaff(ctx: MutationCtx, staff: Doc<"staffs">) {
  if (staff.excludedFromShift === undefined) {
    await ctx.db.patch(staff._id, { excludedFromShift: false });
  }

  if (staff.organizationPersonId !== undefined) {
    const [shop, person, user] = await Promise.all([
      ctx.db.get(staff.shopId),
      ctx.db.get(staff.organizationPersonId),
      staff.userId !== undefined ? ctx.db.get(staff.userId) : null,
    ]);
    const organizationId = staff.organizationId ?? shop?.organizationId;
    const hasValidScope = Boolean(
      organizationId && shop?.organizationId === organizationId && person?.organizationId === organizationId,
    );
    if (hasValidScope && staff.userId !== undefined && (!user || person?.userId !== staff.userId)) {
      // dangling userとperson.userIdの欠損も成功扱いせず、raw emailと氏名を含む既存の本人確認経路へ戻す。
      await migrateStaffToOrganizationPerson(ctx, staff);
      return;
    }
    if (hasValidScope) {
      if (staff.organizationId === undefined) await ctx.db.patch(staff._id, { organizationId });
      await resolveStaffMigrationConflicts(ctx, staff._id);
      return;
    }

    await recordOrganizationMigrationConflict(ctx, {
      organizationId: staff.organizationId ?? shop?.organizationId,
      sourceType: "staff",
      sourceId: staff._id,
      code: "narrow_prep_canonical_link_mismatch",
    });
    return;
  }

  if (staff.organizationId === undefined) {
    await migrateStaffToOrganizationPerson(ctx, staff);
    return;
  }

  // organizationIdだけのpartial rowは人物解決を試すが、失敗しても上のforward用conflict helperがIDを保持する。
  await migrateStaffToOrganizationPerson(ctx, staff);
}

export const migration = migrations.define({
  table: "staffs",
  migrateOne: repairLateLegacyStaff,
});
