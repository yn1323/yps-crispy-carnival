import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type OrganizationActor = {
  organization: Doc<"organizations">;
  shop: Doc<"shops">;
  person: Doc<"organizationPeople">;
  member: Doc<"organizationMembers">;
};

export type OrganizationReadActor = Omit<OrganizationActor, "shop">;

/**
 * 店舗を認可anchorにせず、canonicalな組織所属だけから通常read actorを解決する。
 * 移行互換のshopMembersは組織authorityとして扱わない。
 */
export async function resolveOrganizationReadActor(
  ctx: DbCtx,
  args: {
    user: Doc<"users"> | null;
    organizationId: Id<"organizations">;
  },
): Promise<OrganizationReadActor | null> {
  if (!args.user || args.user.isDeleted) return null;
  const user = args.user;

  const [organization, members, people] = await Promise.all([
    ctx.db.get(args.organizationId),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", user._id).eq("organizationId", args.organizationId),
      )
      .take(2),
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id),
      )
      .take(2),
  ]);
  if (!organization || organization.isDeleted || members.length !== 1 || people.length !== 1) return null;

  const member = members[0];
  const person = people[0];
  const membersForPerson = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_personId", (q) =>
      q.eq("organizationId", organization._id).eq("personId", person._id),
    )
    .take(2);
  if (
    (member.status !== "active" && member.status !== "readOnly") ||
    membersForPerson.length !== 1 ||
    membersForPerson[0]._id !== member._id ||
    member.personId !== person._id ||
    person.organizationId !== organization._id ||
    person.userId !== user._id ||
    person.status !== "active"
  ) {
    return null;
  }

  return { organization, person, member };
}

export async function requireOrganizationReadActor(
  ctx: DbCtx,
  args: {
    user: Doc<"users"> | null;
    organizationId: Id<"organizations">;
  },
): Promise<OrganizationReadActor> {
  const actor = await resolveOrganizationReadActor(ctx, args);
  if (!actor) throw new ConvexError("Not found");
  return actor;
}

export async function requireOrganizationActorForShop(
  ctx: DbCtx,
  args: {
    user: Doc<"users"> | null;
    shopId: Id<"shops">;
    allowReadOnly?: boolean;
  },
): Promise<OrganizationActor> {
  if (!args.user || args.user.isDeleted) throw new ConvexError("Not found");
  const user = args.user;

  const shop = await ctx.db.get(args.shopId);
  if (!shop) throw new ConvexError("Not found");
  const { organizationId } = shop;
  if (!organizationId || shop.isDeleted) throw new ConvexError("Not found");
  const organization = await ctx.db.get(organizationId);
  if (!organization || organization.isDeleted) throw new ConvexError("Not found");

  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id).eq("organizationId", organization._id))
    .take(2);
  if (members.length !== 1) throw new ConvexError("Not found");
  const member = members[0];
  const allowed = member.status === "active" || (args.allowReadOnly === true && member.status === "readOnly");
  if (!allowed) throw new ConvexError("Not found");

  const person = await ctx.db.get(member.personId);
  if (!person) throw new ConvexError("Not found");
  if (person.status !== "active" || person.organizationId !== organization._id || person.userId !== user._id) {
    throw new ConvexError("Not found");
  }

  return { organization, shop, person, member };
}
