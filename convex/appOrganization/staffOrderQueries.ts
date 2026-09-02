import { v } from "convex/values";
import { organizationQuery } from "../_lib/functions";
import {
  getOrganizationStaffOrderEditorSnapshot,
  ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT,
  type OrganizationStaffOrderAvailability,
  getOrganizationStaffOrderScope as resolveOrganizationStaffOrderScope,
} from "../organization/staffOrder";
import { getOrganizationBillingPolicy } from "../organizationBilling/service";

const shopFilterValidator = v.union(v.literal("all"), v.id("shops"));

const availabilityValidator = v.union(
  v.literal("ready"),
  v.literal("tooManyPeople"),
  v.literal("tooManyActiveShops"),
  v.literal("legacyDataIncomplete"),
);

const organizationStaffOrderScopeValidator = v.union(
  v.object({ mode: v.literal("legacy") }),
  v.object({ mode: v.literal("ordered"), revision: v.number() }),
);

const organizationStaffOrderEditorValidator = v.object({
  people: v.array(
    v.object({
      personId: v.id("organizationPeople"),
      name: v.string(),
      email: v.string(),
      shopNames: v.array(v.string()),
    }),
  ),
  orderFingerprint: v.string(),
  canWrite: v.boolean(),
  writeDisabledReason: v.optional(v.string()),
  availability: availabilityValidator,
});

function projectAvailability(availability: OrganizationStaffOrderAvailability): typeof availabilityValidator.type {
  switch (availability) {
    case "tooManyShops":
      return "tooManyActiveShops";
    case "ready":
    case "tooManyPeople":
    case "legacyDataIncomplete":
      return availability;
  }
}

function availabilityDisabledReason(availability: typeof availabilityValidator.type) {
  switch (availability) {
    case "tooManyPeople":
      return `利用人数が${ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT}名を超えているため、並び順を変更できません。`;
    case "tooManyActiveShops":
      return "店舗が5店舗を超えているため、並び順を変更できません。";
    case "legacyDataIncomplete":
      return "スタッフ情報を確認できないため、並び順を変更できません。";
    case "ready":
      return undefined;
  }
}

export const getOrganizationStaffOrderEditor = organizationQuery({
  args: {},
  returns: organizationStaffOrderEditorValidator,
  handler: async (ctx) => {
    const snapshot = await getOrganizationStaffOrderEditorSnapshot(ctx, ctx.organization._id);
    const policy = await getOrganizationBillingPolicy(ctx, ctx.organization._id);
    const availability = projectAvailability(snapshot.availability);
    const availabilityReason = availabilityDisabledReason(availability);
    const memberCanWrite = ctx.organizationMember.status === "active";
    const billingCanWrite = policy?.canWriteBusinessData ?? true;
    const canWrite = memberCanWrite && billingCanWrite && snapshot.availability === "ready";
    const peopleById = new Map((snapshot.source?.people ?? []).map((person) => [person._id, person] as const));
    const shopNamesByPersonId = new Map<string, string[]>();
    for (const { shop, staffs } of snapshot.source?.shops ?? []) {
      for (const { organizationPersonId } of staffs) {
        const names = shopNamesByPersonId.get(organizationPersonId) ?? [];
        names.push(shop.name);
        shopNamesByPersonId.set(organizationPersonId, names);
      }
    }
    const people = (snapshot.availability === "ready" ? snapshot.orderedPersonIds : []).flatMap((personId) => {
      const person = peopleById.get(personId);
      if (!person || person.organizationId !== ctx.organization._id || person.status !== "active") return [];
      return [
        {
          personId: person._id,
          name: person.name,
          email: person.email,
          shopNames: [...(shopNamesByPersonId.get(person._id) ?? [])].sort((left, right) =>
            left.localeCompare(right, "ja"),
          ),
        },
      ];
    });
    const writeDisabledReason = !memberCanWrite
      ? "現在のアカウント状態では、スタッフの並び順を変更できません。"
      : !billingCanWrite
        ? policy?.businessWriteBlockReason === "paymentResultPending"
          ? "支払い結果を確認中のため、スタッフの並び順を変更できません。"
          : "契約状態を復旧してからスタッフの並び順を変更できます。"
        : availabilityReason;

    return {
      people,
      orderFingerprint: snapshot.orderFingerprint,
      canWrite,
      ...(writeDisabledReason ? { writeDisabledReason } : {}),
      availability,
    };
  },
});

export const getOrganizationStaffOrderScope = organizationQuery({
  args: { shopFilter: shopFilterValidator },
  returns: organizationStaffOrderScopeValidator,
  handler: async (ctx, { shopFilter }) => {
    if (shopFilter === "all") {
      return await resolveOrganizationStaffOrderScope(ctx, { organizationId: ctx.organization._id });
    }
    const shop = await ctx.db.get(shopFilter);
    if (!shop || shop.isDeleted || shop.organizationId !== ctx.organization._id) {
      return { mode: "legacy" as const };
    }
    return await resolveOrganizationStaffOrderScope(ctx, {
      organizationId: ctx.organization._id,
      shopId: shop._id,
    });
  },
});
