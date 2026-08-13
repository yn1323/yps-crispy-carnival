import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { resolveStaffLineRecipient } from "../line/service";
import { type NotificationLineRecipient, toNotificationLineRecipient } from "../notificationOutbox/types";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type ShopManagerRecipient = {
  userId: Id<"users">;
  name: string;
  email: string;
  lineUserId: string | undefined;
  lineFollowing: boolean | undefined;
  lineRecipient: NotificationLineRecipient | null;
};

export type ShopManagerUsers = {
  users: Doc<"users">[];
  candidateLimitExceeded: boolean;
};

type CanonicalShopManagerContact = {
  kind: "canonical";
  user: Doc<"users">;
  person: Doc<"organizationPeople">;
  organizationId: Id<"organizations">;
};

type LegacyShopManagerContact = {
  kind: "legacy";
  user: Doc<"users">;
};

export type ShopManagerContact = CanonicalShopManagerContact | LegacyShopManagerContact;

export type ShopManagerContacts = {
  contacts: ShopManagerContact[];
  candidateLimitExceeded: boolean;
};

async function loadCanonicalManagerContacts(
  ctx: DbCtx,
  organizationId: Id<"organizations">,
  managerLimit: number,
): Promise<ShopManagerContacts> {
  const candidates = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .take(managerLimit + 1);
  const contacts = await Promise.all(
    candidates.slice(0, managerLimit).map(async (member) => {
      const [person, user, userMemberships] = await Promise.all([
        ctx.db.get(member.personId),
        ctx.db.get(member.userId),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_userId_and_organizationId", (q) =>
            q.eq("userId", member.userId).eq("organizationId", organizationId),
          )
          .take(2),
      ]);
      if (
        userMemberships.length !== 1 ||
        userMemberships[0]._id !== member._id ||
        !person ||
        person.organizationId !== organizationId ||
        person.userId !== member.userId ||
        person.status !== "active" ||
        !user ||
        user.isDeleted ||
        user.accountDeletionRequestedAt !== undefined
      ) {
        return null;
      }
      return { kind: "canonical" as const, user, person, organizationId };
    }),
  );
  return {
    contacts: contacts.filter((contact): contact is CanonicalShopManagerContact => contact !== null),
    candidateLimitExceeded: candidates.length > managerLimit,
  };
}

/** 店舗の有効な管理者をcanonical所属優先で解決する。 */
export async function loadShopManagerContacts(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerContacts> {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return { contacts: [], candidateLimitExceeded: false };
  const organizationId = shop.organizationId;

  let canonical: ShopManagerContacts = { contacts: [], candidateLimitExceeded: false };
  if (organizationId) {
    const organization = await ctx.db.get(organizationId);
    if (!organization || organization.isDeleted) return canonical;
    canonical = await loadCanonicalManagerContacts(ctx, organization._id, managerLimit);
  }

  // TODO[narrow]: 全deploymentでm029が完走し、verifyLegacyShopMembersの全pageが0件になった後に削除する。
  // m009完了後/m010・m026完了前はuser単位で移行が混在するため、canonical所属がないuserだけを補う。
  // personだけ先に作成済みなら、旧users snapshotへ戻さずpersonの連絡先を使う。
  const candidates = await ctx.db
    .query("shopMembers")
    .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(managerLimit + 1);
  const legacyContacts = await Promise.all(
    candidates.slice(0, managerLimit).map(async (membership) => {
      const [user, activeMemberships, canonicalMemberships, canonicalPeople] = await Promise.all([
        ctx.db.get(membership.userId),
        ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
            q.eq("userId", membership.userId).eq("shopId", shopId).eq("isDeleted", false),
          )
          .take(2),
        organizationId
          ? ctx.db
              .query("organizationMembers")
              .withIndex("by_userId_and_organizationId", (q) =>
                q.eq("userId", membership.userId).eq("organizationId", organizationId),
              )
              .take(2)
          : Promise.resolve([]),
        organizationId
          ? ctx.db
              .query("organizationPeople")
              .withIndex("by_organizationId_and_userId", (q) =>
                q.eq("organizationId", organizationId).eq("userId", membership.userId),
              )
              .take(2)
          : Promise.resolve([]),
      ]);
      if (
        canonicalMemberships.length > 0 ||
        canonicalPeople.length > 1 ||
        activeMemberships.length !== 1 ||
        activeMemberships[0]._id !== membership._id ||
        !user ||
        user.isDeleted ||
        user.accountDeletionRequestedAt !== undefined
      ) {
        return null;
      }
      const person = canonicalPeople[0];
      if (person) {
        if (
          !organizationId ||
          person.organizationId !== organizationId ||
          person.userId !== membership.userId ||
          person.status !== "active"
        ) {
          return null;
        }
        return { kind: "canonical" as const, user, person, organizationId };
      }
      return { kind: "legacy" as const, user };
    }),
  );
  const contactsByUserId = new Map(canonical.contacts.map((contact) => [contact.user._id, contact]));
  for (const contact of legacyContacts) {
    if (contact) contactsByUserId.set(contact.user._id, contact);
  }
  const contacts = [...contactsByUserId.values()];
  return {
    contacts: contacts.slice(0, managerLimit),
    candidateLimitExceeded:
      canonical.candidateLimitExceeded || candidates.length > managerLimit || contacts.length > managerLimit,
  };
}

export async function loadShopManagerUsers(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerUsers> {
  const managers = await loadShopManagerContacts(ctx, shopId, managerLimit);
  return {
    users: managers.contacts.map((contact) => contact.user),
    candidateLimitExceeded: managers.candidateLimitExceeded,
  };
}

function resolveManagerStaff(contact: ShopManagerContact, activeStaffs: Doc<"staffs">[], staffScanComplete: boolean) {
  if (!staffScanComplete) return null;

  if (contact.kind === "canonical") {
    const candidates = activeStaffs.filter(
      (staff) => staff.organizationPersonId === contact.person._id || staff.userId === contact.user._id,
    );
    if (candidates.length !== 1) return null;

    const [staff] = candidates;
    if (
      staff.organizationId !== contact.organizationId ||
      staff.organizationPersonId !== contact.person._id ||
      (staff.userId !== undefined && staff.userId !== contact.user._id)
    ) {
      return null;
    }
    return staff;
  }

  const candidates = activeStaffs.filter((staff) => staff.userId === contact.user._id);
  if (candidates.length !== 1) return null;
  const [staff] = candidates;
  // canonical情報が一部だけ入ったstaffは誤紐付けを避け、person所属が確定するまでメールへ倒す。
  if (staff.organizationId !== undefined || staff.organizationPersonId !== undefined) return null;
  return staff;
}

/** 配送直前にも同じ整合条件でLINE用staffを一意に解決する。 */
export async function loadShopManagerStaffForContact(ctx: DbCtx, shopId: Id<"shops">, contact: ShopManagerContact) {
  const staffCandidates = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(SHIFT_BOARD_STAFF_LIMIT + 1);
  return resolveManagerStaff(
    contact,
    staffCandidates.slice(0, SHIFT_BOARD_STAFF_LIMIT),
    staffCandidates.length <= SHIFT_BOARD_STAFF_LIMIT,
  );
}

/**
 * 店舗のcanonicalな管理者所属を優先して通知受信者を組み立てる。
 * 論理削除・メール未設定のユーザーは除外し、マネージャー本人がスタッフとして
 * LINE連携済みなら lineUserId / lineFollowing を付与する。
 * マネージャー宛の日次ダイジェスト系通知（承認依頼・失敗リマインダー等）で共有する。
 */
export async function loadShopManagerRecipients(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerRecipient[]> {
  const [{ contacts }, staffCandidates] = await Promise.all([
    loadShopManagerContacts(ctx, shopId, managerLimit),
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT + 1),
  ]);
  const staffScanComplete = staffCandidates.length <= SHIFT_BOARD_STAFF_LIMIT;
  const activeStaffs = staffCandidates.slice(0, SHIFT_BOARD_STAFF_LIMIT);

  const recipients = await Promise.all(
    contacts.map(async (contact) => {
      const { user } = contact;
      const name = contact.kind === "canonical" ? contact.person.name : user.name;
      const email = contact.kind === "canonical" ? contact.person.email : user.email;
      if (!email) return null;

      const managerStaff = resolveManagerStaff(contact, activeStaffs, staffScanComplete);
      const lineRecipient = managerStaff
        ? await resolveStaffLineRecipient(ctx, { staffId: managerStaff._id, shopId })
        : null;

      return {
        userId: user._id,
        name,
        email,
        lineUserId: lineRecipient?.lineUserId,
        lineFollowing: lineRecipient?.following,
        lineRecipient: toNotificationLineRecipient(lineRecipient),
      };
    }),
  );

  return recipients.filter((recipient): recipient is ShopManagerRecipient => recipient !== null);
}
