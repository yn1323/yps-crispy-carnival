import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireShopMembershipAdditionEnabled } from "../_lib/config";
import { normalizeEmail } from "../_lib/validation";
import { SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT } from "../constants";
import { MANAGER_PERSON_REMOVAL_DISABLED_REASON } from "../organization/personCapabilities";
import {
  createOrganizationShopStaffMembershipFingerprint,
  ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT,
  organizationShopOperatingStatus,
} from "../organization/shopMembershipChange";
import { requireOrganizationCapacity } from "../organizationBilling/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export const LEGACY_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON =
  "移行中のスタッフは、この画面では所属を変更できません。";
export const LEGACY_EMAIL_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON =
  "移行中のスタッフと同じメールアドレスのため、所属を変更できません。";
export const PENDING_REGISTRATION_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON =
  "スタッフ登録の承認待ちのため、所属を変更できません。";
export const ACTIVE_STAFF_EMAIL_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON =
  "同じメールアドレスのスタッフがこの店舗に所属しているため、変更できません。";

export type OrganizationShopStaffMembershipSnapshotPerson = {
  person: Doc<"organizationPeople">;
  isManager: boolean;
  otherShopNames: string[];
  currentStaff: Doc<"staffs"> | null;
  canChange: boolean;
  changeDisabledReason: string | null;
  addsPersonToUsageOnAddition: boolean;
};

export type OrganizationShopStaffMembershipSnapshot = {
  shop: Doc<"shops">;
  membershipFingerprint: string;
  people: OrganizationShopStaffMembershipSnapshotPerson[];
  preservedStaffs: Array<{
    staff: Doc<"staffs">;
    changeDisabledReason: string;
  }>;
};

function isWithinOrganizationShopStaffMembershipLimit(items: readonly unknown[]) {
  return items.length <= ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT;
}

/**
 * 店舗軸の所属変更で表示・更新に使うsnapshotを収集する。
 * 旧rowは明示的に保持し、canonicalな紐付けが壊れている場合は部分結果を返さない。
 */
export async function collectOrganizationShopStaffMembershipSnapshot(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; shopId: Id<"shops"> },
): Promise<OrganizationShopStaffMembershipSnapshot | null> {
  const shop = await ctx.db.get(args.shopId);
  if (!shop || shop.isDeleted || shop.organizationId !== args.organizationId) return null;

  const [people, activeMembers, readOnlyMembers, shops, pendingRegistrations, targetShopStaffs, organizationStaffRows] =
    await Promise.all([
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "active"),
        )
        .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "active"),
        )
        .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "readOnly"),
        )
        .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1),
      ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", args.organizationId).eq("isDeleted", false),
        )
        .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1),
      ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", args.shopId).eq("status", "pending"))
        .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", args.shopId).eq("isDeleted", false))
        .take(SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .take(SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT + 1),
    ]);
  if (
    !isWithinOrganizationShopStaffMembershipLimit(people) ||
    !isWithinOrganizationShopStaffMembershipLimit(activeMembers) ||
    !isWithinOrganizationShopStaffMembershipLimit(readOnlyMembers) ||
    !isWithinOrganizationShopStaffMembershipLimit([...activeMembers, ...readOnlyMembers]) ||
    !isWithinOrganizationShopStaffMembershipLimit(shops) ||
    !isWithinOrganizationShopStaffMembershipLimit(pendingRegistrations) ||
    targetShopStaffs.length > SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT ||
    organizationStaffRows.length > SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT
  ) {
    return null;
  }
  if (people.some((person) => normalizeEmail(person.email) !== person.emailNormalized)) return null;
  const personIdsByEmail = new Map<string, Id<"organizationPeople">[]>();
  for (const person of people) {
    const personIds = personIdsByEmail.get(person.emailNormalized) ?? [];
    personIds.push(person._id);
    personIdsByEmail.set(person.emailNormalized, personIds);
  }
  if ([...personIdsByEmail.values()].some((personIds) => personIds.length > 1)) return null;
  if (
    pendingRegistrations.some((registration) => normalizeEmail(registration.email) !== registration.emailNormalized)
  ) {
    return null;
  }

  const peopleById = new Map(people.map((person) => [person._id, person]));
  const currentStaffByPersonId = new Map<Id<"organizationPeople">, Doc<"staffs">>();
  const preservedStaffs: Doc<"staffs">[] = [];
  for (const staff of targetShopStaffs) {
    const hasOrganizationId = staff.organizationId !== undefined;
    const hasOrganizationPersonId = staff.organizationPersonId !== undefined;
    if (!hasOrganizationId && !hasOrganizationPersonId) {
      preservedStaffs.push(staff);
      continue;
    }
    if (!hasOrganizationId || !hasOrganizationPersonId || !staff.organizationPersonId) return null;
    if (staff.organizationId !== args.organizationId) return null;
    const person = peopleById.get(staff.organizationPersonId);
    if (!person || person.organizationId !== args.organizationId || person.status !== "active") return null;
    if (currentStaffByPersonId.has(person._id)) return null;
    currentStaffByPersonId.set(person._id, staff);
  }

  const activeOtherShopsById = new Map(
    shops
      .filter(
        (candidate) =>
          candidate._id !== args.shopId && organizationShopOperatingStatus(candidate.operatingStatus) === "active",
      )
      .map((candidate) => [candidate._id, candidate]),
  );
  const otherShopNamesByPersonId = new Map<Id<"organizationPeople">, Set<string>>();
  for (const staff of organizationStaffRows) {
    if (staff.isDeleted || !staff.organizationPersonId || !peopleById.has(staff.organizationPersonId)) continue;
    const otherShop = activeOtherShopsById.get(staff.shopId);
    if (!otherShop) continue;
    const names = otherShopNamesByPersonId.get(staff.organizationPersonId) ?? new Set<string>();
    names.add(otherShop.name);
    otherShopNamesByPersonId.set(staff.organizationPersonId, names);
  }

  const managerMemberships = [...activeMembers, ...readOnlyMembers];
  const activeManagerPersonIds = new Set(activeMembers.map((membership) => membership.personId));
  const personIdsWithStaffHistory = new Set(
    organizationStaffRows.flatMap((staff) => (staff.organizationPersonId ? [staff.organizationPersonId] : [])),
  );
  const legacyEmails = new Set(preservedStaffs.map((staff) => normalizeEmail(staff.email)));
  const canonicalStaffOwnerIdsByEmail = new Map<string, Set<Id<"organizationPeople">>>();
  for (const staff of targetShopStaffs) {
    if (!staff.organizationPersonId) continue;
    const email = normalizeEmail(staff.email);
    const ownerIds = canonicalStaffOwnerIdsByEmail.get(email) ?? new Set<Id<"organizationPeople">>();
    ownerIds.add(staff.organizationPersonId);
    canonicalStaffOwnerIdsByEmail.set(email, ownerIds);
  }
  const pendingEmails = new Set(pendingRegistrations.map((registration) => registration.emailNormalized));
  const snapshotPeople = people
    .map((person): OrganizationShopStaffMembershipSnapshotPerson => {
      const currentStaff = currentStaffByPersonId.get(person._id) ?? null;
      // UI capabilityもmutation guardと同じpersonId基準でfail closedにする。
      // user linkが壊れている場合でもactive/readOnly roleの解除表示を許可しない。
      const isManager = managerMemberships.some((membership) => membership.personId === person._id);
      const hasLegacyEmailConflict = legacyEmails.has(person.emailNormalized);
      const hasActiveStaffEmailConflict =
        !currentStaff &&
        [...(canonicalStaffOwnerIdsByEmail.get(person.emailNormalized) ?? [])].some(
          (ownerPersonId) => ownerPersonId !== person._id,
        );
      const hasPendingRegistrationConflict = !currentStaff && pendingEmails.has(person.emailNormalized);
      const changeDisabledReason =
        currentStaff && isManager
          ? MANAGER_PERSON_REMOVAL_DISABLED_REASON
          : hasLegacyEmailConflict
            ? LEGACY_EMAIL_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON
            : hasActiveStaffEmailConflict
              ? ACTIVE_STAFF_EMAIL_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON
              : hasPendingRegistrationConflict
                ? PENDING_REGISTRATION_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON
                : null;
      return {
        person,
        isManager,
        otherShopNames: [...(otherShopNamesByPersonId.get(person._id) ?? [])].sort((left, right) =>
          left.localeCompare(right, "ja"),
        ),
        currentStaff,
        canChange: changeDisabledReason === null,
        changeDisabledReason,
        addsPersonToUsageOnAddition:
          !activeManagerPersonIds.has(person._id) && !personIdsWithStaffHistory.has(person._id),
      };
    })
    .sort(
      (left, right) =>
        Number(Boolean(right.currentStaff)) - Number(Boolean(left.currentStaff)) ||
        Number(right.isManager) - Number(left.isManager) ||
        left.person.name.localeCompare(right.person.name, "ja") ||
        left.person.email.localeCompare(right.person.email) ||
        left.person._id.localeCompare(right.person._id),
    );

  const sortedPreservedStaffs = preservedStaffs.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "ja") ||
      left.email.localeCompare(right.email) ||
      left._id.localeCompare(right._id),
  );
  const membershipFingerprint = await createOrganizationShopStaffMembershipFingerprint({
    shopId: shop._id,
    shopStatus: organizationShopOperatingStatus(shop.operatingStatus),
    people: snapshotPeople.map(({ person, currentStaff }) => ({
      personId: person._id,
      name: person.name,
      emailNormalized: person.emailNormalized,
      staffId: currentStaff?._id ?? null,
    })),
    activeStaffs: targetShopStaffs.map((staff) => ({
      staffId: staff._id,
      organizationId: staff.organizationId ?? null,
      organizationPersonId: staff.organizationPersonId ?? null,
      name: staff.name,
      emailNormalized: normalizeEmail(staff.email),
    })),
    pendingRegistrations: pendingRegistrations.map((registration) => ({
      requestId: registration._id,
      emailNormalized: registration.emailNormalized,
    })),
  });

  return {
    shop,
    membershipFingerprint,
    people: snapshotPeople,
    preservedStaffs: sortedPreservedStaffs.map((staff) => ({
      staff,
      changeDisabledReason: LEGACY_SHOP_STAFF_MEMBERSHIP_CHANGE_DISABLED_REASON,
    })),
  };
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

/** canonical切替前は、既存人物へ二つ目のactive店舗所属を作らせない。 */
export async function requireAdditionalShopMembershipEnabled(
  ctx: { db: MutationCtx["db"] },
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    targetShopId: Id<"shops">;
  },
) {
  const staffRows = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("isDeleted", false),
    )
    .take(ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT + 1);
  if (staffRows.length > ORGANIZATION_SHOP_STAFF_MEMBERSHIP_DESIRED_LIMIT) {
    throw new ConvexError("ユーザーの店舗所属を確認できません。\n画面を更新して、もう一度お試しください。");
  }
  const otherActiveMemberships = staffRows.filter((staff) => staff.shopId !== args.targetShopId);
  const otherShops = await Promise.all(otherActiveMemberships.map(async (staff) => await ctx.db.get(staff.shopId)));
  if (
    otherShops.some(
      (shop) =>
        shop !== null &&
        !shop.isDeleted &&
        shop.organizationId === args.organizationId &&
        organizationShopOperatingStatus(shop.operatingStatus) === "active",
    )
  ) {
    requireShopMembershipAdditionEnabled();
  }
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

  // TODO[narrow]: 全deploymentでm032が完走し、verifyStaffsのemail残件が全pageで0になった後、
  //   email indexと全staff走査による旧emailNormalized fallbackを削除する。
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
  options?: { scanLimit?: number },
) {
  const now = Date.now();
  if (options?.scanLimit === undefined) {
    const invitations = await collectIssuedInvitationsByOrganization(ctx, organizationId);
    await releaseMatchingInvitationReservations(ctx, invitations, entries, now);
    return;
  }
  if (!Number.isSafeInteger(options.scanLimit) || options.scanLimit < 1) {
    throw new Error("Invitation reservation scan limit must be a positive integer");
  }
  const issuedInvitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "issued"))
    .take(options.scanLimit + 1);
  if (issuedInvitations.length > options.scanLimit) {
    throw new ConvexError("管理者招待が多いため、スタッフを追加できません。\n組織設定で招待状況を確認してください。");
  }
  const pendingInvitations = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "pending"))
    .take(options.scanLimit - issuedInvitations.length + 1);
  if (issuedInvitations.length + pendingInvitations.length > options.scanLimit) {
    throw new ConvexError("管理者招待が多いため、スタッフを追加できません。\n組織設定で招待状況を確認してください。");
  }
  const invitations = [...issuedInvitations, ...pendingInvitations];
  await releaseMatchingInvitationReservations(ctx, invitations, entries, now);
}

async function releaseMatchingInvitationReservations(
  ctx: { db: MutationCtx["db"] },
  invitations: readonly Doc<"organizationInvitations">[],
  entries: ReadonlyArray<Pick<PreparedOrganizationStaffEntry, "email">>,
  now: number,
) {
  for (const entry of entries) {
    const pendingForEntry = invitations.filter(
      (invitation) =>
        invitation.emailNormalized === entry.email && invitation.reservedSeat && invitation.expiresAt > now,
    );
    if (pendingForEntry.length > 1) {
      throw new ConvexError(
        "このメールアドレスへの管理者招待を確認できません。\n組織設定で招待状況を確認してください。",
      );
    }
    const invitation = pendingForEntry[0];
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
      throw new ConvexError("同じメールアドレスが複数入力されています。");
    }
    inputEmails.add(email);

    const matchingPeople = await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) =>
        q.eq("organizationId", args.organizationId).eq("emailNormalized", email),
      )
      .take(2);
    if (matchingPeople.length > 1) {
      throw new ConvexError(
        "このメールアドレスのユーザー情報を確認できません。\nユーザー画面で登録内容を確認してください。",
      );
    }

    const person = matchingPeople[0] ?? null;
    if (person?.status === "removed" && !args.allowRemovedPeople) {
      throw new ConvexError("削除済みのユーザーです。\nユーザー画面で再追加したうえで、店舗に追加してください。");
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
          throw new ConvexError(
            "削除済みユーザーの管理者権限を確認できません。\nユーザー画面で登録内容を確認してください。",
          );
        }
      }
      const activeStaffRows = staffRows.filter((staff) => !staff.isDeleted);
      const existingStaffInShop = activeStaffRows.find((staff) => staff.shopId === args.shopId);
      if (existingStaffInShop) {
        throw new ConvexError("このユーザーはすでに店舗へ登録されています。");
      }
      // removed人物をactiveへ戻した瞬間に、過去の別店舗staffが暗黙復元されないことを保証する。
      if (person.status === "removed" && activeStaffRows.length > 0) {
        throw new ConvexError(
          "削除済みユーザーの店舗所属を確認できません。\nユーザー画面で登録内容を確認してください。",
        );
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
        throw new ConvexError("確認したユーザー情報が変わりました。\n追加内容をもう一度確認してください。");
      }
      if (person.userId) {
        const user = await ctx.db.get(person.userId);
        if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
          throw new ConvexError("このユーザーは再追加できません。");
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
