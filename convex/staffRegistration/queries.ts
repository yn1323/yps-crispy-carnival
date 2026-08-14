import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { type QueryCtx, query } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerQuery } from "../_lib/functions";
import { isReleaseFeatureEnabled } from "../_lib/releaseFeatures";
import { normalizeEmail } from "../_lib/validation";
import { ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT, STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { staffLegalDocumentsValidator } from "../legal/validators";
import { organizationShopOperatingStatus } from "../organization/shopMembershipChange";
import { resolveStaffRegistrationCapability } from "./capability";

const registrationPageDataValidator = v.union(
  v.object({ status: v.literal("expired"), documents: staffLegalDocumentsValidator }),
  v.object({ status: v.literal("ok"), shopName: v.string(), documents: staffLegalDocumentsValidator }),
);

const registrationLinkValidator = v.object({ token: v.string(), registrationUrl: v.string() });

export const STAFF_REGISTRATION_APPROVAL_DISABLED_REASON = "この申請は現在承認できません。不要な申請は却下できます。";

type ApprovalAvailability = {
  canApprove: boolean;
  approveDisabledReason: string | null;
};

const APPROVAL_AVAILABLE: ApprovalAvailability = {
  canApprove: true,
  approveDisabledReason: null,
};

const APPROVAL_UNAVAILABLE: ApprovalAvailability = {
  canApprove: false,
  approveDisabledReason: STAFF_REGISTRATION_APPROVAL_DISABLED_REASON,
};

async function resolveApprovalAvailability(
  ctx: Pick<QueryCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    targetShopId: Id<"shops">;
    emailNormalized: string;
    allowMultiShop: boolean;
  },
): Promise<ApprovalAvailability> {
  if (await hasActiveStaffByEmail(ctx, args.targetShopId, args.emailNormalized)) return APPROVAL_UNAVAILABLE;

  const matchingPeople = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_emailNormalized", (q) =>
      q.eq("organizationId", args.organizationId).eq("emailNormalized", args.emailNormalized),
    )
    .take(2);
  if (matchingPeople.length > 1) return APPROVAL_UNAVAILABLE;

  const person = matchingPeople[0];
  if (!person) return APPROVAL_AVAILABLE;
  if (person.status !== "active") return APPROVAL_UNAVAILABLE;
  if (args.allowMultiShop) return APPROVAL_AVAILABLE;

  const staffRows = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId", (q) =>
      q.eq("organizationId", args.organizationId).eq("organizationPersonId", person._id),
    )
    .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
  if (staffRows.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) return APPROVAL_UNAVAILABLE;

  for (const staff of staffRows) {
    if (staff.isDeleted || staff.shopId === args.targetShopId) continue;
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.organizationId !== args.organizationId) return APPROVAL_UNAVAILABLE;
    if (!shop.isDeleted && organizationShopOperatingStatus(shop.operatingStatus) === "active") {
      return APPROVAL_UNAVAILABLE;
    }
  }
  return APPROVAL_AVAILABLE;
}

async function hasActiveStaffByEmail(
  ctx: Pick<QueryCtx, "db">,
  shopId: Id<"shops">,
  emailNormalized: string,
): Promise<boolean> {
  const byNormalized = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("emailNormalized", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byNormalized) return true;

  const byExactEmail = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_email_isDeleted", (q) =>
      q.eq("shopId", shopId).eq("email", emailNormalized).eq("isDeleted", false),
    )
    .first();
  if (byExactEmail) return true;

  const shopStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
  if (shopStaffs.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) return true;
  return shopStaffs.some((staff) => normalizeEmail(staff.email) === emailNormalized);
}

function buildRegistrationUrl(token: string) {
  return `${APP_URL}/staff/register?token=${token}`;
}

export const getRegistrationPageData = query({
  args: { token: v.string() },
  returns: registrationPageDataValidator,
  handler: async (ctx, { token }) => {
    const documents = getLegalDocumentsForAudience("staff");
    const shop = await resolveStaffRegistrationCapability(ctx, token);
    if (!shop) return { status: "expired" as const, documents };

    return {
      status: "ok" as const,
      shopName: shop.name,
      documents,
    };
  },
});

export const getPendingRequests = managerQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("staffRegistrationRequests"),
      name: v.string(),
      email: v.string(),
      createdAt: v.number(),
      canApprove: v.boolean(),
      approveDisabledReason: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    if (!ctx.shop) return [];
    const shop = ctx.shop;
    const requests = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", shop._id).eq("status", "pending"))
      .order("asc")
      .take(STAFF_REGISTRATION_PENDING_LIMIT);

    const approvalAvailabilityByEmail = new Map<string, ApprovalAvailability>();
    if (ctx.organization) {
      const allowMultiShop = isReleaseFeatureEnabled("shopAddition");
      for (const request of requests) {
        const cached = approvalAvailabilityByEmail.get(request.emailNormalized);
        if (cached) continue;
        approvalAvailabilityByEmail.set(
          request.emailNormalized,
          await resolveApprovalAvailability(ctx, {
            organizationId: ctx.organization._id,
            targetShopId: shop._id,
            emailNormalized: request.emailNormalized,
            allowMultiShop,
          }),
        );
      }
    }

    return requests.map((request) => {
      const approvalAvailability = approvalAvailabilityByEmail.get(request.emailNormalized) ?? APPROVAL_AVAILABLE;
      return {
        _id: request._id,
        name: request.name,
        email: request.email,
        createdAt: request.createdAt,
        ...approvalAvailability,
      };
    });
  },
});

export const getActiveRegistrationLink = managerQuery({
  args: {},
  returns: v.union(registrationLinkValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.shop) return null;
    const shop = ctx.shop;
    const links = await ctx.db
      .query("shopRegistrationLinks")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .take(10);
    const link = links.find((candidate) => !candidate.revokedAt);
    if (!link) return null;
    return {
      token: link.token,
      registrationUrl: buildRegistrationUrl(link.token),
    };
  },
});
