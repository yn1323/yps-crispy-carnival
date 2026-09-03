import type { WithoutSystemFields } from "convex/server";
import type { TestConvex } from "convex-test";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { schema } from "./setup.test-helper";

type CurrentShopInsert = WithoutSystemFields<Doc<"shops">>;

export async function getTestOrganizationId(t: TestConvex<typeof schema>, shopId: Id<"shops">) {
  return await t.run(async (ctx) => {
    const shop = await ctx.db.get(shopId);
    if (!shop) throw new Error("test shop not found");
    return shop.organizationId;
  });
}

export function testAuthTokenIdentifier(subject: string) {
  return `https://convex.test|${subject}`;
}

export async function seedUser(ctx: MutationCtx, subject: string, email = `${subject}@example.com`) {
  const emailNormalized = email.trim().toLowerCase();
  return await ctx.db.insert("users", {
    authTokenIdentifier: testAuthTokenIdentifier(subject),
    name: "管理者",
    email,
    emailNormalized,
    role: "manager",
    isDeleted: false,
  });
}

export async function seedShop(ctx: MutationCtx, name = "テスト店舗") {
  const now = Date.now();
  const billingEmail = `fixture-${crypto.randomUUID()}@example.com`;
  const organizationId = await ctx.db.insert("organizations", {
    name: `${name}事業者`,
    billingEmail,
    billingEmailNormalized: billingEmail,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.insert("shops", {
    organizationId,
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

/** Migration履歴・rolling互換だけで使う、organization未設定の旧店舗fixture。 */
export async function seedLegacyShop(ctx: MutationCtx, name = "テスト店舗") {
  return await ctx.db.insert("shops", {
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  } as unknown as CurrentShopInsert);
}

export async function seedOrganizationMembership(
  ctx: MutationCtx,
  args: { userId: Id<"users">; shopId: Id<"shops">; role?: "manager"; isDeleted?: boolean },
) {
  const [shop, user] = await Promise.all([ctx.db.get(args.shopId), ctx.db.get(args.userId)]);
  if (!shop?.organizationId) {
    throw new Error("seedOrganizationMembership requires a canonical shop");
  }
  const organizationId = shop.organizationId;
  if (!user) throw new Error("seedOrganizationMembership user not found");

  const existingMembership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", args.userId).eq("organizationId", organizationId))
    .unique();
  if (existingMembership) {
    const status = args.isDeleted ? "removed" : "active";
    if (existingMembership.status !== status) {
      await ctx.db.patch(existingMembership._id, { status, updatedAt: Date.now() });
    }
    return existingMembership._id;
  }

  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", args.userId))
    .take(2);
  if (people.length > 1) throw new Error("seedOrganizationMembership found ambiguous organization people");

  const now = Date.now();
  const emailNormalized = user.email.trim().toLowerCase();
  const personId =
    people[0]?._id ??
    (await ctx.db.insert("organizationPeople", {
      organizationId,
      userId: args.userId,
      name: user.name,
      email: user.email,
      emailNormalized,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }));

  return await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId: args.userId,
    status: args.isDeleted ? "removed" : "active",
    createdAt: now,
    updatedAt: now,
  });
}

/** Migration履歴・rolling互換だけで使う旧shopMembers fixture。 */
export async function seedLegacyShopMembership(
  ctx: MutationCtx,
  args: { userId: Id<"users">; shopId: Id<"shops">; role?: "manager"; isDeleted?: boolean },
) {
  return await ctx.db.insert("shopMembers", {
    userId: args.userId,
    shopId: args.shopId,
    role: args.role ?? "manager",
    isDeleted: args.isDeleted ?? false,
  });
}

export async function seedManagerShop(
  ctx: MutationCtx,
  args: {
    subject: string;
    email?: string;
    shopName?: string;
    shopDeleted?: boolean;
    membershipDeleted?: boolean;
  },
) {
  return await seedOrganizationManagerShop(ctx, { ...args, complimentary: true });
}

/** Migration履歴・rolling互換だけで使う旧店舗・旧管理者所属fixture。 */
export async function seedLegacyManagerShop(
  ctx: MutationCtx,
  args: {
    subject: string;
    email?: string;
    shopName?: string;
    shopDeleted?: boolean;
    membershipDeleted?: boolean;
  },
) {
  const userId = await seedUser(ctx, args.subject, args.email);
  const shopId = await seedLegacyShop(ctx, args.shopName);
  if (args.shopDeleted) {
    await ctx.db.patch(shopId, { isDeleted: true });
  }
  await seedLegacyShopMembership(ctx, {
    userId,
    shopId,
    role: "manager",
    isDeleted: args.membershipDeleted ?? false,
  });
  return { userId, shopId };
}

export async function seedOrganizationManagerShop(
  ctx: MutationCtx,
  args: {
    subject: string;
    email?: string;
    shopName?: string;
    plan?: "free" | "standard" | "pro";
    complimentary?: boolean;
    shopDeleted?: boolean;
    membershipDeleted?: boolean;
  },
) {
  const plan = args.plan ?? "free";
  const email = (args.email ?? `${args.subject}@example.com`).trim().toLowerCase();
  const userId = await seedUser(ctx, args.subject, email);
  const now = Date.now();
  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: userId,
    name: `${args.shopName ?? "テスト店舗"}事業者`,
    billingEmail: email,
    billingEmailNormalized: email,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: "管理者",
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: args.membershipDeleted ? "removed" : "active",
    createdAt: now,
    updatedAt: now,
  });
  const shopId = await ctx.db.insert("shops", {
    organizationId,
    name: args.shopName ?? "テスト店舗",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: args.shopDeleted ?? false,
  });
  await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: args.complimentary ? { kind: "complimentary", plan: "pro" } : { kind: "active", plan },
    ...(args.complimentary ? {} : { freeManagerPersonId: personId, freeShopId: shopId }),
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return { userId, organizationId, personId, memberId, shopId };
}

export async function seedStaffLineAccount(
  ctx: MutationCtx,
  args: { staffId: Id<"staffs">; shopId: Id<"shops">; lineUserId: string; following?: boolean },
) {
  return await ctx.db.insert("staffLineAccounts", {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: args.lineUserId,
    linkedAt: Date.now(),
    following: args.following ?? true,
    isDeleted: false,
  });
}

/** organization person単位のLINE正本を作るfixture。legacy行は明示的に別helperで作る。 */
export async function seedOrganizationPersonLineLink(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    lineUserId: string;
    following?: boolean;
    generation?: number;
  },
) {
  const person = await ctx.db.get(args.organizationPersonId);
  if (!person || person.organizationId !== args.organizationId) {
    throw new Error("seedOrganizationPersonLineLink requires a person in the organization");
  }
  const now = Date.now();
  const generation = args.generation ?? 1;
  await ctx.db.patch(person._id, { lineLinkGeneration: generation, updatedAt: now });
  const lineProviderUserId = await ctx.db.insert("lineProviderUsers", {
    lineUserId: args.lineUserId,
    following: args.following ?? true,
    stateVersion: 1,
    friendshipObservedAt: now,
    friendshipObservationSource: "oauth",
    isDeleted: false,
  });
  const organizationPersonLineLinkId = await ctx.db.insert("organizationPersonLineLinks", {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    lineProviderUserId,
    generation,
    linkedAt: now,
    isDeleted: false,
  });
  return { lineProviderUserId, organizationPersonLineLinkId, generation };
}

/** canonical staff recipientを組み立てるfixture。legacy staff projectionは作らない。 */
export async function seedCanonicalStaffLineRecipient(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    lineUserId: string;
    following?: boolean;
    generation?: number;
  },
) {
  const staff = await ctx.db.get(args.staffId);
  if (!staff || staff.isDeleted || !staff.organizationId || !staff.organizationPersonId) {
    throw new Error("seedCanonicalStaffLineRecipient requires an active canonical staff");
  }
  const shop = await ctx.db.get(staff.shopId);
  if (!shop?.organizationId || shop.isDeleted || staff.organizationId !== shop.organizationId) {
    throw new Error("seedCanonicalStaffLineRecipient requires a non-deleted canonical shop");
  }
  const organizationPersonId = staff.organizationPersonId;
  const recipient = await seedOrganizationPersonLineLink(ctx, {
    organizationId: shop.organizationId,
    organizationPersonId,
    lineUserId: args.lineUserId,
    following: args.following,
    generation: args.generation,
  });
  return { organizationId: shop.organizationId, organizationPersonId, ...recipient };
}
