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

export type ShopManagerRecipientResolution = {
  recipients: ShopManagerRecipient[];
  staffIds: Set<Id<"staffs">>;
};

export type ShopManagerUsers = {
  users: Doc<"users">[];
  candidateLimitExceeded: boolean;
};

export type ShopManagerContact = {
  kind: "canonical";
  user: Doc<"users">;
  person: Doc<"organizationPeople">;
  organizationId: Id<"organizations">;
};

export type ShopManagerContacts = {
  contacts: ShopManagerContact[];
  candidateLimitExceeded: boolean;
};

type ShopManagerNotificationContact = {
  contact: ShopManagerContact;
  staff: Doc<"staffs">;
};

type ShopManagerNotificationContacts = {
  contacts: ShopManagerNotificationContact[];
  scanComplete: boolean;
};

export type ShopManagerNotificationRecipientStatus = {
  activeRecipientCount: number;
  scanComplete: boolean;
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
    contacts: contacts.filter((contact): contact is ShopManagerContact => contact !== null),
    candidateLimitExceeded: candidates.length > managerLimit,
  };
}

/** 店舗の有効な管理者をcanonical所属から解決する。 */
export async function loadShopManagerContacts(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerContacts> {
  const shop = await ctx.db.get(shopId);
  if (!shop || shop.isDeleted) return { contacts: [], candidateLimitExceeded: false };
  const organization = await ctx.db.get(shop.organizationId);
  if (!organization || organization.isDeleted) return { contacts: [], candidateLimitExceeded: false };
  return await loadCanonicalManagerContacts(ctx, organization._id, managerLimit);
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

/** 配送直前にも同じ整合条件で店舗所属staffを一意に解決する。 */
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

async function loadShopManagerNotificationContacts(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerNotificationContacts> {
  const [managers, staffCandidates] = await Promise.all([
    loadShopManagerContacts(ctx, shopId, managerLimit),
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT + 1),
  ]);
  const staffScanComplete = staffCandidates.length <= SHIFT_BOARD_STAFF_LIMIT;
  const activeStaffs = staffCandidates.slice(0, SHIFT_BOARD_STAFF_LIMIT);

  if (!staffScanComplete) {
    return { contacts: [], scanComplete: false };
  }

  const contacts = managers.contacts.flatMap((contact) => {
    const staff = resolveManagerStaff(contact, activeStaffs, true);
    return staff ? [{ contact, staff }] : [];
  });
  return {
    contacts,
    scanComplete: !managers.candidateLimitExceeded,
  };
}

/**
 * 店舗通知を受け取れる active manager × active staff の状態をPIIなしで返す。
 * scanComplete=false は上限超過により0人と断定できない状態を表す。
 */
export async function loadShopManagerNotificationRecipientStatus(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerNotificationRecipientStatus> {
  const result = await loadShopManagerNotificationContacts(ctx, shopId, managerLimit);
  return {
    activeRecipientCount: result.contacts.filter(({ contact }) => {
      return contact.person.email.length > 0;
    }).length,
    scanComplete: result.scanComplete,
  };
}

/** dry-run判定に使う、店舗通知の有効な管理者連絡先を返す。 */
export async function loadShopManagerNotificationRecipientContacts(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<{ contacts: ShopManagerContact[]; scanComplete: boolean }> {
  const result = await loadShopManagerNotificationContacts(ctx, shopId, managerLimit);
  return {
    contacts: result.contacts
      .map(({ contact }) => contact)
      .filter((contact) => contact.person.email.length > 0),
    scanComplete: result.scanComplete,
  };
}

/**
 * 店舗のcanonicalな管理者所属を優先して通知受信者を組み立てる。
 * 対象店舗に有効なstaff所属がない管理者と、メール未設定の管理者は除外する。
 * 管理者本人がスタッフとして
 * LINE連携済みなら lineUserId / lineFollowing を付与する。
 * マネージャー宛の日次ダイジェスト系通知（承認依頼・失敗リマインダー等）で共有する。
 */
export async function loadShopManagerRecipientResolution(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerRecipientResolution> {
  const { contacts } = await loadShopManagerNotificationContacts(ctx, shopId, managerLimit);

  const entries = await Promise.all(
    contacts.map(async ({ contact, staff }) => {
      const { user } = contact;
      const name = contact.person.name;
      const email = contact.person.email;
      if (!email) return null;

      const lineRecipient = await resolveStaffLineRecipient(ctx, { staffId: staff._id, shopId });

      return {
        recipient: {
          userId: user._id,
          name,
          email,
          lineUserId: lineRecipient?.lineUserId,
          lineFollowing: lineRecipient?.following,
          lineRecipient: toNotificationLineRecipient(lineRecipient),
        },
        staffId: staff._id,
      };
    }),
  );

  const resolvedEntries = entries.filter(
    (entry): entry is { recipient: ShopManagerRecipient; staffId: Id<"staffs"> } => entry !== null,
  );
  return {
    recipients: resolvedEntries.map(({ recipient }) => recipient),
    staffIds: new Set(resolvedEntries.map(({ staffId }) => staffId)),
  };
}

export async function loadShopManagerRecipients(
  ctx: DbCtx,
  shopId: Id<"shops">,
  managerLimit: number,
): Promise<ShopManagerRecipient[]> {
  return (await loadShopManagerRecipientResolution(ctx, shopId, managerLimit)).recipients;
}
