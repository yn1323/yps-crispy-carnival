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
