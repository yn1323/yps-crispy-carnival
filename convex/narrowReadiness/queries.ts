import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { normalizeEmail } from "../_lib/validation";

const MAX_PAGE_SIZE = 100;
const pageMetadataValidator = {
  scannedCount: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
};

function requireBoundedPagination(paginationOpts: PaginationOptions) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError(`numItems must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

function pageMetadata(page: { page: unknown[]; isDone: boolean; continueCursor: string }) {
  return {
    scannedCount: page.page.length,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
}

/** 店舗shapeを全page走査し、PIIやrow IDを返さずNarrow阻害件数だけを返す。 */
export const verifyShops = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingOrganizationId: v.number(),
      missingOperatingStatus: v.number(),
      missingRegularClosedDays: v.number(),
      danglingOrganizationId: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shops").paginate(paginationOpts);
    let missingOrganizationId = 0;
    let missingOperatingStatus = 0;
    let missingRegularClosedDays = 0;
    let danglingOrganizationId = 0;
    for (const shop of result.page) {
      if (!shop.organizationId) missingOrganizationId += 1;
      else if (!(await ctx.db.get(shop.organizationId))) danglingOrganizationId += 1;
      if (!shop.operatingStatus) missingOperatingStatus += 1;
      if (shop.regularClosedDays === undefined) missingRegularClosedDays += 1;
    }
    return {
      ...pageMetadata(result),
      anomalies: { missingOrganizationId, missingOperatingStatus, missingRegularClosedDays, danglingOrganizationId },
    };
  },
});

/** usersの派生メールと、廃止候補roleをPIIなしの件数だけで確認する。 */
export const verifyUsers = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingEmailNormalized: v.number(),
      invalidEmailNormalization: v.number(),
      legacyAdminRole: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("users").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: {
        missingEmailNormalized: result.page.filter((user) => user.emailNormalized === undefined).length,
        invalidEmailNormalization: result.page.filter(
          (user) => user.emailNormalized !== undefined && user.emailNormalized !== normalizeEmail(user.email),
        ).length,
        // adminは現行writer・権限判定で使っていないが、自動manager化はせず運用判断を要求する。
        legacyAdminRole: result.page.filter((user) => user.role === "admin").length,
      },
    };
  },
});

/** staffとshop/personのcanonical linkを全page走査する。 */
export const verifyStaffs = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingOrganizationId: v.number(),
      missingOrganizationPersonId: v.number(),
      partialOrganizationLink: v.number(),
      danglingShop: v.number(),
      shopOrganizationMismatch: v.number(),
      danglingOrganizationPerson: v.number(),
      personOrganizationMismatch: v.number(),
      danglingStaffUser: v.number(),
      missingPersonUserForLinkedStaff: v.number(),
      personUserMismatch: v.number(),
      activeStaffLinkedRemovedPerson: v.number(),
      missingExcludedFromShift: v.number(),
      missingEmailNormalized: v.number(),
      invalidEmailNormalization: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("staffs").paginate(paginationOpts);
    const anomalies = {
      missingOrganizationId: 0,
      missingOrganizationPersonId: 0,
      partialOrganizationLink: 0,
      danglingShop: 0,
      shopOrganizationMismatch: 0,
      danglingOrganizationPerson: 0,
      personOrganizationMismatch: 0,
      danglingStaffUser: 0,
      missingPersonUserForLinkedStaff: 0,
      personUserMismatch: 0,
      activeStaffLinkedRemovedPerson: 0,
      missingExcludedFromShift: 0,
      missingEmailNormalized: 0,
      invalidEmailNormalization: 0,
    };
    for (const staff of result.page) {
      if (!staff.organizationId) anomalies.missingOrganizationId += 1;
      if (!staff.organizationPersonId) anomalies.missingOrganizationPersonId += 1;
      if (staff.excludedFromShift === undefined) anomalies.missingExcludedFromShift += 1;
      if (staff.emailNormalized === undefined) anomalies.missingEmailNormalized += 1;
      else if (staff.emailNormalized !== normalizeEmail(staff.email)) anomalies.invalidEmailNormalization += 1;
      if (Boolean(staff.organizationId) !== Boolean(staff.organizationPersonId)) anomalies.partialOrganizationLink += 1;
      if (staff.userId !== undefined && !(await ctx.db.get(staff.userId))) anomalies.danglingStaffUser += 1;

      const shop = await ctx.db.get(staff.shopId);
      if (!shop) anomalies.danglingShop += 1;
      else if (staff.organizationId && shop.organizationId !== staff.organizationId) {
        anomalies.shopOrganizationMismatch += 1;
      }

      if (staff.organizationPersonId) {
        const person = await ctx.db.get(staff.organizationPersonId);
        if (!person) anomalies.danglingOrganizationPerson += 1;
        else {
          if (!staff.organizationId || person.organizationId !== staff.organizationId) {
            anomalies.personOrganizationMismatch += 1;
          }
          if (staff.userId !== undefined) {
            if (person.userId === undefined) anomalies.missingPersonUserForLinkedStaff += 1;
            else if (person.userId !== staff.userId) anomalies.personUserMismatch += 1;
          }
          if (!staff.isDeleted && person.status === "removed") {
            anomalies.activeStaffLinkedRemovedPerson += 1;
          }
        }
      }
    }
    return { ...pageMetadata(result), anomalies };
  },
});

/** 請求先メールは推測補完せず、人の運用判断が必要な残件だけを数える。 */
export const verifyOrganizations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingBillingEmail: v.number(),
      missingBillingEmailNormalized: v.number(),
      invalidBillingEmailNormalization: v.number(),
      missingBillingState: v.number(),
      ambiguousBillingStates: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizations").paginate(paginationOpts);
    const anomalies = {
      missingBillingEmail: 0,
      missingBillingEmailNormalized: 0,
      invalidBillingEmailNormalization: 0,
      missingBillingState: 0,
      ambiguousBillingStates: 0,
    };
    for (const organization of result.page) {
      if (!organization.billingEmail) anomalies.missingBillingEmail += 1;
      if (!organization.billingEmailNormalized) anomalies.missingBillingEmailNormalized += 1;
      if (
        organization.billingEmail &&
        organization.billingEmailNormalized &&
        normalizeEmail(organization.billingEmail) !== organization.billingEmailNormalized
      ) {
        anomalies.invalidBillingEmailNormalization += 1;
      }
      const billingStates = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .take(2);
      if (billingStates.length === 0) anomalies.missingBillingState += 1;
      if (billingStates.length > 1) anomalies.ambiguousBillingStates += 1;
    }
    return { ...pageMetadata(result), anomalies };
  },
});

/** 招待lifecycleの旧literal・旧field・未補完fieldを数える。 */
export const verifyOrganizationInvitations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      legacyStatus: v.number(),
      missingInvitedName: v.number(),
      missingPurpose: v.number(),
      legacyAcceptedFields: v.number(),
      linkedMissingLinkedAt: v.number(),
      linkedMissingLinkedByPersonId: v.number(),
      nonLinkedLinkEvidence: v.number(),
      danglingTargetPerson: v.number(),
      targetPersonOrganizationMismatch: v.number(),
      danglingLinkedByPerson: v.number(),
      linkedByPersonOrganizationMismatch: v.number(),
      danglingAcceptedByPerson: v.number(),
      acceptedByPersonOrganizationMismatch: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationInvitations").paginate(paginationOpts);
    const anomalies = {
      legacyStatus: 0,
      missingInvitedName: 0,
      missingPurpose: 0,
      legacyAcceptedFields: 0,
      linkedMissingLinkedAt: 0,
      linkedMissingLinkedByPersonId: 0,
      nonLinkedLinkEvidence: 0,
      danglingTargetPerson: 0,
      targetPersonOrganizationMismatch: 0,
      danglingLinkedByPerson: 0,
      linkedByPersonOrganizationMismatch: 0,
      danglingAcceptedByPerson: 0,
      acceptedByPersonOrganizationMismatch: 0,
    };
    for (const invitation of result.page) {
      if (invitation.status === "pending" || invitation.status === "accepted") anomalies.legacyStatus += 1;
      if (!invitation.invitedName) anomalies.missingInvitedName += 1;
      if (!invitation.purpose) anomalies.missingPurpose += 1;
      if (invitation.acceptedAt !== undefined || invitation.acceptedByPersonId !== undefined) {
        anomalies.legacyAcceptedFields += 1;
      }
      if (invitation.status === "linked") {
        if (invitation.linkedAt === undefined) anomalies.linkedMissingLinkedAt += 1;
        if (invitation.linkedByPersonId === undefined) anomalies.linkedMissingLinkedByPersonId += 1;
      } else if (invitation.linkedAt !== undefined || invitation.linkedByPersonId !== undefined) {
        anomalies.nonLinkedLinkEvidence += 1;
      }

      if (invitation.targetPersonId) {
        const targetPerson = await ctx.db.get(invitation.targetPersonId);
        if (!targetPerson) anomalies.danglingTargetPerson += 1;
        else if (targetPerson.organizationId !== invitation.organizationId) {
          anomalies.targetPersonOrganizationMismatch += 1;
        }
      }
      if (invitation.linkedByPersonId) {
        const linkedByPerson = await ctx.db.get(invitation.linkedByPersonId);
        if (!linkedByPerson) anomalies.danglingLinkedByPerson += 1;
        else if (linkedByPerson.organizationId !== invitation.organizationId) {
          anomalies.linkedByPersonOrganizationMismatch += 1;
        }
      }
      if (invitation.acceptedByPersonId) {
        const acceptedByPerson = await ctx.db.get(invitation.acceptedByPersonId);
        if (!acceptedByPerson) anomalies.danglingAcceptedByPerson += 1;
        else if (acceptedByPerson.organizationId !== invitation.organizationId) {
          anomalies.acceptedByPersonOrganizationMismatch += 1;
        }
      }
    }
    return { ...pageMetadata(result), anomalies };
  },
});

/** Outboxの全row共通metadataとtenant scopeを検証する。 */
export const verifyNotificationOutbox = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingNotificationContext: v.number(),
      missingDeliverySuppressed: v.number(),
      missingPurpose: v.number(),
      missingOrganizationId: v.number(),
      missingScope: v.number(),
      danglingOrganizationId: v.number(),
      danglingShopId: v.number(),
      shopMissingOrganizationId: v.number(),
      shopDanglingOrganizationId: v.number(),
      shopOrganizationMismatch: v.number(),
      incompleteFanoutLink: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("notificationOutbox").paginate(paginationOpts);
    const anomalies = {
      missingNotificationContext: 0,
      missingDeliverySuppressed: 0,
      missingPurpose: 0,
      missingOrganizationId: 0,
      missingScope: 0,
      danglingOrganizationId: 0,
      danglingShopId: 0,
      shopMissingOrganizationId: 0,
      shopDanglingOrganizationId: 0,
      shopOrganizationMismatch: 0,
      incompleteFanoutLink: 0,
    };
    for (const outbox of result.page) {
      if (!outbox.notificationContext) anomalies.missingNotificationContext += 1;
      if (outbox.deliverySuppressed === undefined) anomalies.missingDeliverySuppressed += 1;
      if (!outbox.purpose) anomalies.missingPurpose += 1;
      if (!outbox.organizationId) anomalies.missingOrganizationId += 1;
      if (!outbox.organizationId && !outbox.shopId) anomalies.missingScope += 1;

      if (outbox.organizationId && !(await ctx.db.get(outbox.organizationId))) {
        anomalies.danglingOrganizationId += 1;
      }
      const shop = outbox.shopId ? await ctx.db.get(outbox.shopId) : null;
      if (outbox.shopId && !shop) anomalies.danglingShopId += 1;
      if (shop && !shop.organizationId) anomalies.shopMissingOrganizationId += 1;
      if (shop?.organizationId && !(await ctx.db.get(shop.organizationId))) {
        anomalies.shopDanglingOrganizationId += 1;
      }
      if (outbox.organizationId && shop?.organizationId && outbox.organizationId !== shop.organizationId) {
        anomalies.shopOrganizationMismatch += 1;
      }
      if ((outbox.fanoutTargetKey === undefined) !== (outbox.fanoutOperationId === undefined)) {
        anomalies.incompleteFanoutLink += 1;
      }
    }
    return { ...pageMetadata(result), anomalies };
  },
});

/** Subscription planとrestricted discriminatorの未補完件数を別々に集計する。 */
export const verifyStripeSubscriptions = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({ missingPlan: v.number() }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationStripeSubscriptions").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: { missingPlan: result.page.filter((subscription) => !subscription.plan).length },
    };
  },
});

/** 旧Stripe operation literalと、Business導入前trial operationのplan欠損を数える。 */
export const verifyStripeOperations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      legacyImmediateProCheckout: v.number(),
      trialSetupCheckoutMissingTargetPlan: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationStripeOperations").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: {
        legacyImmediateProCheckout: result.page.filter((operation) => operation.kind === "immediateProCheckout").length,
        trialSetupCheckoutMissingTargetPlan: result.page.filter(
          (operation) => operation.kind === "trialSetupCheckout" && operation.targetPlan === undefined,
        ).length,
      },
    };
  },
});

export const verifyOrganizationBillingStates = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      restrictedPlanLimitMissing: v.number(),
      nestedRestrictedPlanLimitMissing: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationBillingStates").paginate(paginationOpts);
    const topLevelRestrictedPlanLimitMissing = result.page.filter(
      (billing) =>
        billing.state.kind === "restricted" &&
        billing.state.reason === "planLimitExceeded" &&
        billing.state.limitPlan === undefined,
    ).length;
    const nestedRestrictedPlanLimitMissing = result.page.filter(
      (billing) =>
        billing.state.kind === "pendingActivation" &&
        billing.state.restrictedFallbackState?.reason === "planLimitExceeded" &&
        billing.state.restrictedFallbackState.limitPlan === undefined,
    ).length;
    return {
      ...pageMetadata(result),
      anomalies: {
        restrictedPlanLimitMissing: topLevelRestrictedPlanLimitMissing + nestedRestrictedPlanLimitMissing,
        nestedRestrictedPlanLimitMissing,
      },
    };
  },
});

/** 7月30日の個別再送Widenで追加したdiscriminatorと条件付きbaselineを検証する。 */
export const verifyNotificationFanoutOperations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingSupersedesActiveOperations: v.number(),
      incompleteSupplementalBaseline: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("notificationFanoutOperations").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: {
        missingSupersedesActiveOperations: result.page.filter(
          (operation) => operation.supersedesActiveOperations === undefined,
        ).length,
        incompleteSupplementalBaseline: result.page.filter(
          (operation) =>
            operation.supersedesActiveOperations === false &&
            (operation.confirmationOperationKeyAtOrigin === undefined ||
              operation.recruitmentDraftSavedAtAtOrigin === undefined),
        ).length,
      },
    };
  },
});

/** 募集の休業日snapshotと、旧下書き保存時刻fallbackへ到達するrowを数える。 */
export const verifyRecruitments = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingShopClosedDates: v.number(),
      assignmentsWithoutDraftSavedAt: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("recruitments").paginate(paginationOpts);
    let assignmentsWithoutDraftSavedAt = 0;
    for (const recruitment of result.page) {
      if (recruitment.draftSavedAt !== undefined) continue;
      const assignment = await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .first();
      if (assignment) assignmentsWithoutDraftSavedAt += 1;
    }
    return {
      ...pageMetadata(result),
      anomalies: {
        missingShopClosedDates: result.page.filter((recruitment) => recruitment.shopClosedDates === undefined).length,
        assignmentsWithoutDraftSavedAt,
      },
    };
  },
});

/** 初回提出時刻の欠損と、初回が最終提出より後になる矛盾を検出する。 */
export const verifyShiftSubmissions = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingFirstSubmittedAt: v.number(),
      firstSubmittedAfterSubmittedAt: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shiftSubmissions").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: {
        missingFirstSubmittedAt: result.page.filter((submission) => submission.firstSubmittedAt === undefined).length,
        firstSubmittedAfterSubmittedAt: result.page.filter(
          (submission) =>
            submission.firstSubmittedAt !== undefined && submission.firstSubmittedAt > submission.submittedAt,
        ).length,
      },
    };
  },
});

/** 現行readerの選択結果と各positionの明示flagが一致するかを全row確認する。 */
export const verifyPositions = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingIsDefault: v.number(),
      defaultSelectionMismatch: v.number(),
      deletedDefaultTrue: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("positions").paginate(paginationOpts);
    const anomalies = { missingIsDefault: 0, defaultSelectionMismatch: 0, deletedDefaultTrue: 0 };
    for (const position of result.page) {
      if (position.isDefault === undefined) anomalies.missingIsDefault += 1;
      if (position.isDeleted) {
        if (position.isDefault === true) anomalies.deletedDefaultTrue += 1;
        continue;
      }

      const activePositions = await ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", position.shopId).eq("isDeleted", false))
        .take(50);
      const selected = activePositions.find((candidate) => candidate.isDefault === true) ?? activePositions[0];
      const expectedDefault = selected?._id === position._id;
      if (position.isDefault !== undefined && position.isDefault !== expectedDefault) {
        anomalies.defaultSelectionMismatch += 1;
      }
    }
    return { ...pageMetadata(result), anomalies };
  },
});

/** position readerの上限超過をfail closedにし、active positionなしは非阻害の観測値として分ける。 */
export const verifyPositionShops = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      readerWindowOverflow: v.number(),
      multipleDefaultShops: v.number(),
    }),
    observations: v.object({ shopsWithoutActivePositions: v.number() }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shops").paginate(paginationOpts);
    let readerWindowOverflow = 0;
    let multipleDefaultShops = 0;
    let shopsWithoutActivePositions = 0;
    for (const shop of result.page) {
      const activePositions = await ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(51);
      if (activePositions.length === 0) shopsWithoutActivePositions += 1;
      if (activePositions.length > 50) readerWindowOverflow += 1;
      if (activePositions.filter((position) => position.isDefault === true).length > 1) {
        multipleDefaultShops += 1;
      }
    }
    return {
      ...pageMetadata(result),
      anomalies: { readerWindowOverflow, multipleDefaultShops },
      observations: { shopsWithoutActivePositions },
    };
  },
});

/** accessKind導入前のlinkを、tokenや対象IDを返さず件数だけ確認する。 */
export const verifyMagicLinks = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      missingAccessKind: v.number(),
      activeViewMissingNotificationOperationKey: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("magicLinks").paginate(paginationOpts);
    const now = Date.now();
    return {
      ...pageMetadata(result),
      anomalies: {
        missingAccessKind: result.page.filter((link) => link.accessKind === undefined).length,
        activeViewMissingNotificationOperationKey: result.page.filter(
          (link) =>
            link.accessKind === "view" &&
            link.notificationOperationKey === undefined &&
            link.revokedAt === undefined &&
            link.expiresAt > now,
        ).length,
      },
    };
  },
});

/** accessKind導入前のsessionを、credentialや対象IDを返さず件数だけ確認する。 */
export const verifySessions = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({ missingAccessKind: v.number() }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("sessions").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: { missingAccessKind: result.page.filter((session) => session.accessKind === undefined).length },
    };
  },
});

const legacyRowsResultValidator = v.object({
  ...pageMetadataValidator,
  activeRows: v.number(),
  totalRows: v.number(),
});

/** canonical authorityへ切り替える前に旧shopMembersのactive残件を全page確認する。 */
export const verifyLegacyShopMembers = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: legacyRowsResultValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shopMembers").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      activeRows: result.page.filter((membership) => !membership.isDeleted).length,
      totalRows: result.page.length,
    };
  },
});

/** legacy課金rowのうち、canonical課金状態がなく実際にfallbackへ到達する残件だけをactiveとして数える。 */
export const verifyLegacyShopBillingStates = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: legacyRowsResultValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shopBillingStates").paginate(paginationOpts);
    let activeRows = 0;
    for (const legacyBilling of result.page) {
      const shop = await ctx.db.get(legacyBilling.shopId);
      if (!shop) continue;
      const organizationId = shop.organizationId;
      const canonicalStates = organizationId
        ? await ctx.db
            .query("organizationBillingStates")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .take(2)
        : [];
      if (canonicalStates.length === 0) activeRows += 1;
    }
    return { ...pageMetadata(result), activeRows, totalRows: result.page.length };
  },
});

/** 未解消conflictは種類やsource IDを公開せず、総数とOutbox scope分の件数だけを返す。 */
export const verifyOrganizationMigrationConflicts = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    unresolvedRows: v.number(),
    unresolvedNotificationOutboxScopeRows: v.number(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationMigrationConflicts").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      unresolvedRows: result.page.filter((conflict) => conflict.resolvedAt === undefined).length,
      unresolvedNotificationOutboxScopeRows: result.page.filter(
        (conflict) =>
          conflict.resolvedAt === undefined &&
          conflict.sourceType === "notificationOutbox" &&
          conflict.code.startsWith("notification_outbox_"),
      ).length,
    };
  },
});
