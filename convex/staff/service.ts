import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireOrganizationCapacity } from "../organizationBilling/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * シフト対象スタッフかどうか（論理削除されておらず、シフト対象外でもない）。
 * シフトボード表示・募集/催促/確定などシフト関連通知の対象判定に使う。
 */
export function isShiftTargetStaff(staff: { isDeleted: boolean; excludedFromShift?: boolean }) {
  return !staff.isDeleted && !staff.excludedFromShift;
}

export async function getActiveStaffInShop(ctx: DbCtx, shopId: Id<"shops">, staffId: Id<"staffs">) {
  const staff = await ctx.db.get(staffId);
  return staff && staff.shopId === shopId && !staff.isDeleted ? staff : null;
}

export async function findActiveStaffByEmail(
  ctx: { db: MutationCtx["db"] },
  shopId: Id<"shops">,
  emailNormalized: string,
) {
  const byNormalized = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("emailNormalized", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byNormalized) return byNormalized;

  const byExactEmail = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_email_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("email", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byExactEmail) return byExactEmail;

  const shopStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .collect();
  return shopStaffs.find((staff) => normalizeEmail(staff.email) === emailNormalized) ?? null;
}

export type PreparedOrganizationStaffEntry = {
  name: string;
  email: string;
  registeredEmail: string;
  existingPersonId: Id<"organizationPeople"> | null;
  personState: "new" | "active" | "removed";
  addsPersonToUsage: boolean;
};

/**
 * manager招待が予約した利用人数枠を、同じメールのstaff人物へ付け替える。
 * 初回の再有効化previewでは呼ばず、実際に人物・staffを保存するtransaction内だけで実行する。
 */
export async function releasePendingInvitationReservationsForStaffAddition(
  ctx: { db: MutationCtx["db"] },
  organizationId: Id<"organizations">,
  entries: ReadonlyArray<Pick<PreparedOrganizationStaffEntry, "email">>,
) {
  const now = Date.now();
  const issuedInvitations = await collectIssuedInvitationsByOrganization(ctx, organizationId);
  for (const entry of entries) {
    const pendingInvitations = issuedInvitations.filter(
      (invitation) =>
        invitation.emailNormalized === entry.email && invitation.reservedSeat && invitation.expiresAt > now,
    );
    if (pendingInvitations.length > 1) {
      throw new ConvexError("このメールアドレスの管理者招待を一意に確認できません");
    }
    const invitation = pendingInvitations[0];
    if (invitation) await ctx.db.patch(invitation._id, { reservedSeat: false, updatedAt: now });
  }
}

/**
 * 事業者配下のスタッフ追加を、人物再利用・同一店舗重複・プラン上限まで一括で事前検証する。
 * ここで参照したindexは、同じmutation内のinsertとOCCで競合するため、並行追加でも再検証される。
 */
export async function prepareOrganizationPeopleForStaffAddition(
  ctx: { db: MutationCtx["db"] },
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    entries: ReadonlyArray<{ name: string; email: string }>;
    allowRemovedPeople?: boolean;
    deferCapacityCheck?: boolean;
  },
): Promise<PreparedOrganizationStaffEntry[]> {
  const prepared: PreparedOrganizationStaffEntry[] = [];
  const inputEmails = new Set<string>();
  let additionalPeople = 0;

  for (const entry of args.entries) {
    const email = normalizeEmail(entry.email);
    if (inputEmails.has(email)) {
      throw new ConvexError("同じメールアドレスが入力されています");
    }
    inputEmails.add(email);

    const matchingPeople = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", args.organizationId).eq("emailNormalized", email),
      )
      .take(2);
    if (matchingPeople.length > 1) {
      throw new ConvexError("このメールアドレスの人物情報を確認できません。人物管理で登録内容を確認してください");
    }

    const person = matchingPeople[0] ?? null;
    if (person?.status === "removed" && !args.allowRemovedPeople) {
      throw new ConvexError("削除済みの人物です。人物管理から再有効化してから追加してください");
    }

    let addsPersonToUsage = false;
    if (person) {
      const [staffRows, managerMemberships] = await Promise.all([
        ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", args.organizationId).eq("organizationPersonId", person._id),
          )
          .collect(),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", args.organizationId).eq("personId", person._id),
          )
          .collect(),
      ]);
      if (person.status === "removed") {
        if (managerMemberships.some((membership) => membership.status !== "removed")) {
          throw new ConvexError("削除済み人物の管理者権限を確認できません。人物管理で登録内容を確認してください");
        }
      }
      const activeStaffRows = staffRows.filter((staff) => !staff.isDeleted);
      const existingStaffInShop = activeStaffRows.find((staff) => staff.shopId === args.shopId);
      if (existingStaffInShop) {
        throw new ConvexError("この人物はすでに店舗へ登録されています");
      }
      // removed人物をactiveへ戻した瞬間に、過去の別店舗staffが暗黙復元されないことを保証する。
      if (person.status === "removed" && activeStaffRows.length > 0) {
        throw new ConvexError("削除済み人物の店舗所属を確認できません。人物管理で登録内容を確認してください");
      }
      addsPersonToUsage =
        person.status === "removed" ||
        (staffRows.length === 0 && !managerMemberships.some((membership) => membership.status === "active"));
    } else {
      addsPersonToUsage = true;
    }
    if (addsPersonToUsage) additionalPeople += 1;

    // 既存人物では事業者に登録済みの名前を正とし、店舗追加時の入力で上書きしない。
    prepared.push({
      name: person?.name ?? entry.name,
      email: person ? normalizeEmail(person.email) : email,
      registeredEmail: person?.email ?? email,
      existingPersonId: person?._id ?? null,
      personState: person?.status ?? "new",
      addsPersonToUsage,
    });
  }

  // active managerまたはstaff履歴を持つ既存人物を別店舗へ紐づけるだけなら利用人数は増えない。
  // 明示確認が必要な呼び出しでは、確認後のmutationで同じread setから上限を再検証する。
  if (additionalPeople > 0 && !args.deferCapacityCheck) {
    await requireOrganizationCapacity(ctx, {
      organizationId: args.organizationId,
      additionalPeople,
    });
  }

  return prepared;
}

/** 保存前検証済みの新規人物だけを作成し、全entryの人物IDを確定する。 */
export async function materializeOrganizationPeopleForStaffAddition(
  ctx: { db: MutationCtx["db"] },
  organizationId: Id<"organizations">,
  prepared: ReadonlyArray<PreparedOrganizationStaffEntry>,
): Promise<Array<PreparedOrganizationStaffEntry & { personId: Id<"organizationPeople">; reactivated: boolean }>> {
  const now = Date.now();
  const materialized: Array<
    PreparedOrganizationStaffEntry & { personId: Id<"organizationPeople">; reactivated: boolean }
  > = [];

  for (const entry of prepared) {
    let personId = entry.existingPersonId;
    let reactivated = false;
    if (personId && entry.personState === "removed") {
      const person = await ctx.db.get(personId);
      if (
        !person ||
        person.organizationId !== organizationId ||
        person.status !== "removed" ||
        normalizeEmail(person.email) !== entry.email
      ) {
        throw new ConvexError("確認した人物情報が変わりました。もう一度追加内容を確認してください");
      }
      if (person.userId) {
        const user = await ctx.db.get(person.userId);
        if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
          throw new ConvexError("この人物は再追加できません");
        }
      }
      await ctx.db.patch(personId, { status: "active", updatedAt: now });
      reactivated = true;
    }
    personId ??= await ctx.db.insert("organizationPeople", {
      organizationId,
      name: entry.name,
      email: entry.email,
      emailNormalized: entry.email,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    materialized.push({ ...entry, personId, reactivated });
  }

  return materialized;
}
