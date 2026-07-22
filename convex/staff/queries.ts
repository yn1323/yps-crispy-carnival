import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { managerQuery } from "../_lib/functions";
import { normalizeEmail } from "../_lib/validation";

const ORGANIZATION_PERSON_LIST_LIMIT = 100;

const availableOrganizationPersonValidator = v.object({
  personId: v.id("organizationPeople"),
  name: v.string(),
  email: v.string(),
  shopNames: v.array(v.string()),
  isManager: v.boolean(),
});

function boundedList<T>(items: T[]): T[] | null {
  return items.length <= ORGANIZATION_PERSON_LIST_LIMIT ? items : null;
}

export const listOrganizationPeopleAvailableForShop = managerQuery({
  args: {},
  returns: v.union(v.null(), v.array(availableOrganizationPersonValidator)),
  handler: async (ctx) => {
    if (!ctx.user || !ctx.shop || !ctx.organization) return [];
    if (ctx.organizationMember?.status === "readOnly") return [];

    const organizationId = ctx.organization._id;
    const shopId = ctx.shop._id;
    const [peopleResult, activeMembersResult, readOnlyMembersResult, shopsResult, pendingRequestsResult] =
      await Promise.all([
        ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_status", (q) =>
            q.eq("organizationId", organizationId).eq("status", "active"),
          )
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_status", (q) =>
            q.eq("organizationId", organizationId).eq("status", "active"),
          )
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
        ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_status", (q) =>
            q.eq("organizationId", organizationId).eq("status", "readOnly"),
          )
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
        ctx.db
          .query("shops")
          .withIndex("by_organizationId_and_isDeleted", (q) =>
            q.eq("organizationId", organizationId).eq("isDeleted", false),
          )
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
        ctx.db
          .query("staffRegistrationRequests")
          .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      ]);
    const people = boundedList(peopleResult);
    const activeMembers = boundedList(activeMembersResult);
    const readOnlyMembers = boundedList(readOnlyMembersResult);
    const allNonDeletedShops = boundedList(shopsResult);
    const pendingRequests = boundedList(pendingRequestsResult);
    if (!people || !activeMembers || !readOnlyMembers || !allNonDeletedShops || !pendingRequests) return null;
    if (people.some((person) => normalizeEmail(person.email) !== person.emailNormalized)) return null;
    const members = [...activeMembers, ...readOnlyMembers];
    const shops = allNonDeletedShops.filter((shop) => shop.operatingStatus === "active");
    const pendingEmails = new Set(pendingRequests.map((request) => request.emailNormalized));

    const staffRowsByShop = await Promise.all(
      shops.map(async (shop) => ({
        shop,
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
          .take(ORGANIZATION_PERSON_LIST_LIMIT + 1),
      })),
    );
    if (staffRowsByShop.some(({ staffs }) => staffs.length > ORGANIZATION_PERSON_LIST_LIMIT)) return null;

    const currentShopStaffs = staffRowsByShop.find(({ shop }) => shop._id === shopId)?.staffs ?? [];
    const currentPersonIds = new Set(
      currentShopStaffs.flatMap((staff) => (staff.organizationPersonId ? [staff.organizationPersonId] : [])),
    );
    const currentEmails = new Set(currentShopStaffs.map((staff) => normalizeEmail(staff.email)));

    const membershipsByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
    for (const member of members) {
      const current = membershipsByPersonId.get(member.personId) ?? [];
      current.push(member);
      membershipsByPersonId.set(member.personId, current);
    }

    const shopNamesByPersonId = new Map<Id<"organizationPeople">, Set<string>>();
    for (const { shop, staffs } of staffRowsByShop) {
      for (const staff of staffs) {
        if (!staff.organizationPersonId) continue;
        const current = shopNamesByPersonId.get(staff.organizationPersonId) ?? new Set<string>();
        current.add(shop.name);
        shopNamesByPersonId.set(staff.organizationPersonId, current);
      }
    }

    return people
      .filter(
        (person) =>
          !currentPersonIds.has(person._id) &&
          !currentEmails.has(person.emailNormalized) &&
          !pendingEmails.has(person.emailNormalized),
      )
      .map((person) => {
        const membersForPerson = membershipsByPersonId.get(person._id) ?? [];
        const isManager =
          person.userId !== undefined && membersForPerson.some((member) => member.userId === person.userId);
        return {
          personId: person._id,
          name: person.name,
          email: person.email,
          shopNames: [...(shopNamesByPersonId.get(person._id) ?? [])].sort((a, b) => a.localeCompare(b, "ja")),
          isManager,
        };
      })
      .sort(
        (left, right) =>
          Number(right.isManager) - Number(left.isManager) ||
          left.name.localeCompare(right.name, "ja") ||
          left.email.localeCompare(right.email),
      );
  },
});
