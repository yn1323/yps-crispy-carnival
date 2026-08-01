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

async function recordStaffMigrationConflict(
  ctx: Pick<MutationCtx, "db">,
  staff: Doc<"staffs">,
  args: { organizationId?: Id<"organizations">; code: string },
) {
  // Widen期間中は両IDが未設定のstaffだけ旧session導線へfallbackできる。
  // 人物を一意に解決できない行を部分移行状態にせず、過去の失敗実行も再実行で修復する。
  if (staff.organizationId !== undefined || staff.organizationPersonId !== undefined) {
    await ctx.db.patch(staff._id, { organizationId: undefined, organizationPersonId: undefined });
  }
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
export const migration = migrations.define({
  table: "staffs",
  migrateOne: async (ctx, staff) => {
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

    const emailNormalized = normalizeMigrationEmail(staff.emailNormalized ?? staff.email);
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
      await resolveOrganizationMigrationConflicts(ctx, { sourceType: "staff", sourceId: staff._id });
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
      await ctx.db.patch(staff._id, { organizationId, organizationPersonId: userPeople[0]._id });
      if (!staff.isDeleted && userPeople[0].status === "removed") {
        await ctx.db.patch(userPeople[0]._id, { status: "active", updatedAt: now });
      }
      await resolveOrganizationMigrationConflicts(ctx, { sourceType: "staff", sourceId: staff._id });
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
        if (!emailPerson.userId) await ctx.db.patch(emailPerson._id, { userId: staff.userId, updatedAt: now });
        await ctx.db.patch(staff._id, { organizationId, organizationPersonId: emailPerson._id });
        if (!staff.isDeleted && emailPerson.status === "removed") {
          await ctx.db.patch(emailPerson._id, { status: "active", updatedAt: now });
        }
        await resolveOrganizationMigrationConflicts(ctx, { sourceType: "staff", sourceId: staff._id });
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
      await ctx.db.patch(staff._id, { organizationId, organizationPersonId: person._id });
      if (!staff.isDeleted && person.status === "removed") {
        await ctx.db.patch(person._id, { status: "active", updatedAt: now });
      }
      await resolveOrganizationMigrationConflicts(ctx, { sourceType: "staff", sourceId: staff._id });
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
    await resolveOrganizationMigrationConflicts(ctx, { sourceType: "staff", sourceId: staff._id });
  },
});
