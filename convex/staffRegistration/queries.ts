import { v } from "convex/values";
import { APP_URL } from "../_lib/config";
import { observedQuery as query } from "../_lib/errorObservability";
import { managerQuery } from "../_lib/functions";
import { STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";
import { getLegalDocumentsForAudience } from "../legal/documents";
import { staffLegalDocumentsValidator } from "../legal/validators";
import { resolveStaffRegistrationCapability } from "./capability";
import { resolveStaffRegistrationApprovalAvailability } from "./service";

const registrationPageDataValidator = v.union(
  v.object({ status: v.literal("expired"), documents: staffLegalDocumentsValidator }),
  v.object({ status: v.literal("ok"), shopName: v.string(), documents: staffLegalDocumentsValidator }),
);

const registrationLinkValidator = v.object({ token: v.string(), registrationUrl: v.string() });

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

    const approvalAvailabilityByEmail = new Map<
      string,
      Awaited<ReturnType<typeof resolveStaffRegistrationApprovalAvailability>>
    >();
    if (ctx.organization) {
      for (const request of requests) {
        const cached = approvalAvailabilityByEmail.get(request.emailNormalized);
        if (cached) continue;
        approvalAvailabilityByEmail.set(
          request.emailNormalized,
          await resolveStaffRegistrationApprovalAvailability(ctx, {
            organizationId: ctx.organization._id,
            targetShopId: shop._id,
            emailNormalized: request.emailNormalized,
          }),
        );
      }
    }

    return requests.map((request) => {
      const approvalAvailability = approvalAvailabilityByEmail.get(request.emailNormalized) ?? {
        canApprove: true,
        approveDisabledReason: null,
      };
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
