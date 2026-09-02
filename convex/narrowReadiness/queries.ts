import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { normalizeEmail } from "../_lib/validation";
import { LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT } from "../constants";

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
      archivedOperatingStatus: v.number(),
      unknownOperatingStatus: v.number(),
      missingRegularClosedDays: v.number(),
      danglingOrganizationId: v.number(),
    }),
    observations: v.object({
      operatingStatusPresent: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("shops").paginate(paginationOpts);
    let missingOrganizationId = 0;
    let archivedOperatingStatus = 0;
    let unknownOperatingStatus = 0;
    let operatingStatusPresent = 0;
    let missingRegularClosedDays = 0;
    let danglingOrganizationId = 0;
    for (const shop of result.page) {
      if (!shop.organizationId) missingOrganizationId += 1;
      else if (!(await ctx.db.get(shop.organizationId))) danglingOrganizationId += 1;
      const { operatingStatus } = shop as typeof shop & { operatingStatus?: unknown };
      if (operatingStatus !== undefined) operatingStatusPresent += 1;
      if (operatingStatus === "archived") archivedOperatingStatus += 1;
      else if (operatingStatus !== undefined && operatingStatus !== "active") unknownOperatingStatus += 1;
      if (shop.regularClosedDays === undefined) missingRegularClosedDays += 1;
    }
    return {
      ...pageMetadata(result),
      anomalies: {
        missingOrganizationId,
        archivedOperatingStatus,
        unknownOperatingStatus,
        missingRegularClosedDays,
        danglingOrganizationId,
      },
      observations: { operatingStatusPresent },
    };
  },
});

/** 店舗archive廃止前に、旧監査actionの残件をPIIやrow IDなしで数える。 */
export const verifyOrganizationAuditShopLifecycle = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      shopArchivedActions: v.number(),
      shopReactivatedActions: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationAuditEvents").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      anomalies: {
        shopArchivedActions: result.page.filter((event) => event.action === "organization.shop_archived").length,
        shopReactivatedActions: result.page.filter((event) => event.action === "organization.shop_reactivated").length,
      },
    };
  },
});

/** 店舗archive廃止前に、旧analytics payloadの残件をPIIやrow IDなしで数える。 */
export const verifyAnalyticsShopLifecycle = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    anomalies: v.object({
      shopArchivedChanges: v.number(),
      shopReactivatedChanges: v.number(),
      shopStatusDeltas: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("analyticsSourceEvents").paginate(paginationOpts);
    let shopArchivedChanges = 0;
    let shopReactivatedChanges = 0;
    let shopStatusDeltas = 0;
    for (const event of result.page) {
      const payload = event.payload as unknown;
      if (!payload || typeof payload !== "object") continue;
      const legacyPayload = payload as { kind?: unknown; change?: unknown; statusDeltas?: unknown };
      if (legacyPayload.kind === "shop" && legacyPayload.change === "archived") shopArchivedChanges += 1;
      if (legacyPayload.kind === "shop" && legacyPayload.change === "reactivated") shopReactivatedChanges += 1;
      if (legacyPayload.kind !== "plan" || !Array.isArray(legacyPayload.statusDeltas)) continue;
      shopStatusDeltas += legacyPayload.statusDeltas.filter((delta) => {
        if (!delta || typeof delta !== "object") return false;
        return (delta as { kind?: unknown }).kind === "shop";
      }).length;
    }
    return {
      ...pageMetadata(result),
      anomalies: { shopArchivedChanges, shopReactivatedChanges, shopStatusDeltas },
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
      danglingPersonUser: v.number(),
      deletedLinkedUser: v.number(),
      deletionRequestedLinkedUser: v.number(),
      missingPersonUserForLinkedStaff: v.number(),
      personUserMismatch: v.number(),
      activeStaffLinkedRemovedPerson: v.number(),
      missingExcludedFromShift: v.number(),
      missingEmailNormalized: v.number(),
      invalidEmailNormalization: v.number(),
      activeStaffPersonEmailMismatch: v.number(),
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
      danglingPersonUser: 0,
      deletedLinkedUser: 0,
      deletionRequestedLinkedUser: 0,
      missingPersonUserForLinkedStaff: 0,
      personUserMismatch: 0,
      activeStaffLinkedRemovedPerson: 0,
      missingExcludedFromShift: 0,
      missingEmailNormalized: 0,
      invalidEmailNormalization: 0,
      activeStaffPersonEmailMismatch: 0,
    };
    for (const staff of result.page) {
      if (!staff.organizationId) anomalies.missingOrganizationId += 1;
      if (!staff.organizationPersonId) anomalies.missingOrganizationPersonId += 1;
      if (staff.excludedFromShift === undefined) anomalies.missingExcludedFromShift += 1;
      if (staff.emailNormalized === undefined) anomalies.missingEmailNormalized += 1;
      else if (staff.emailNormalized !== normalizeEmail(staff.email)) anomalies.invalidEmailNormalization += 1;
      if (Boolean(staff.organizationId) !== Boolean(staff.organizationPersonId)) anomalies.partialOrganizationLink += 1;
      const staffUser = staff.userId === undefined ? null : await ctx.db.get(staff.userId);
      if (staff.userId !== undefined && !staffUser) anomalies.danglingStaffUser += 1;
      let hasDeletedLinkedUser = staffUser?.isDeleted === true;
      let hasDeletionRequestedLinkedUser = staffUser?.accountDeletionRequestedAt !== undefined;

      const shop = await ctx.db.get(staff.shopId);
      if (!shop) anomalies.danglingShop += 1;
      else if (staff.organizationId && shop.organizationId !== staff.organizationId) {
        anomalies.shopOrganizationMismatch += 1;
      }

      if (staff.organizationPersonId) {
        const person = await ctx.db.get(staff.organizationPersonId);
        if (!person) anomalies.danglingOrganizationPerson += 1;
        else {
          const personUser = person.userId === undefined ? null : await ctx.db.get(person.userId);
          if (person.userId !== undefined && !personUser) anomalies.danglingPersonUser += 1;
          hasDeletedLinkedUser ||= personUser?.isDeleted === true;
          hasDeletionRequestedLinkedUser ||= personUser?.accountDeletionRequestedAt !== undefined;
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
          if (
            !staff.isDeleted &&
            person.status === "active" &&
            (normalizeEmail(staff.email) !== normalizeEmail(person.email) ||
              staff.emailNormalized !== person.emailNormalized)
          ) {
            anomalies.activeStaffPersonEmailMismatch += 1;
          }
        }
      }
      if (hasDeletedLinkedUser) anomalies.deletedLinkedUser += 1;
      if (hasDeletionRequestedLinkedUser) anomalies.deletionRequestedLinkedUser += 1;
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
      legacyShopInactiveCancelReason: v.number(),
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
      legacyShopInactiveCancelReason: 0,
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
      if (outbox.cancelReason === "shop_inactive") anomalies.legacyShopInactiveCancelReason += 1;
    }
    return { ...pageMetadata(result), anomalies };
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

/** 未解消conflictはcodeやsource IDを公開せず、Narrow gateに必要な集計件数だけを返す。 */
export const verifyOrganizationMigrationConflicts = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    unresolvedRows: v.number(),
    unresolvedStaffRows: v.number(),
    unresolvedNotificationOutboxScopeRows: v.number(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationMigrationConflicts").paginate(paginationOpts);
    return {
      ...pageMetadata(result),
      unresolvedRows: result.page.filter((conflict) => conflict.resolvedAt === undefined).length,
      unresolvedStaffRows: result.page.filter(
        (conflict) => conflict.resolvedAt === undefined && conflict.sourceType === "staff",
      ).length,
      unresolvedNotificationOutboxScopeRows: result.page.filter(
        (conflict) =>
          conflict.resolvedAt === undefined &&
          conflict.sourceType === "notificationOutbox" &&
          conflict.code.startsWith("notification_outbox_"),
      ).length,
    };
  },
});

const lineCommonLinkPageValidator = v.object({
  ...pageMetadataValidator,
  anomalies: v.record(v.string(), v.number()),
  observations: v.record(v.string(), v.number()),
});

/** LINE共通化の公開前に、複数店舗化されていないことをorganization起点で数える。 */
export const verifyLineCommonOrganizations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizations").paginate(paginationOpts);
    let activeOrganizationsWithMultipleShops = 0;
    for (const organization of result.page) {
      if (organization.isDeleted) continue;
      const shops = await ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", organization._id).eq("isDeleted", false),
        )
        .take(2);
      if (shops.length > 1) {
        activeOrganizationsWithMultipleShops += 1;
      }
    }
    return {
      ...pageMetadata(result),
      anomalies: { activeOrganizationsWithMultipleShops },
      observations: { activeOrganizations: result.page.filter((organization) => !organization.isDeleted).length },
    };
  },
});

/** personごとのactive staff上限とcanonical linkの整合性をIDやPIIなしで数える。 */
export const verifyLineCommonPeople = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationPeople").paginate(paginationOpts);
    const anomalies = {
      activePeopleWithMultipleStaffs: 0,
      personStaffHistoryOverLimit: 0,
      activeLinkDuplicates: 0,
      activeLinkForRemovedPerson: 0,
      activeLinkTenantMismatch: 0,
      activeLinkGenerationMismatch: 0,
      activeLinkDanglingProvider: 0,
      activeCanonicalLinkWithoutExactLegacyProjection: 0,
    };
    let activePeople = 0;
    for (const person of result.page) {
      const [staffHistory, links] = await Promise.all([
        ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationId", person.organizationId).eq("organizationPersonId", person._id).eq("isDeleted", false),
          )
          .take(LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT + 1),
        ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", person._id).eq("isDeleted", false),
          )
          .take(2),
      ]);
      const activeStaffs = [];
      for (const staff of staffHistory) {
        const shop = await ctx.db.get(staff.shopId);
        if (shop && !shop.isDeleted && shop.organizationId === person.organizationId) {
          activeStaffs.push(staff);
        }
      }
      if (person.status === "active") {
        activePeople += 1;
        if (staffHistory.length > LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT) {
          anomalies.personStaffHistoryOverLimit += 1;
        }
        if (activeStaffs.length > 1) anomalies.activePeopleWithMultipleStaffs += 1;
      }
      if (links.length > 1) anomalies.activeLinkDuplicates += 1;
      const link = links[0];
      if (!link) continue;
      if (person.status !== "active") anomalies.activeLinkForRemovedPerson += 1;
      if (link.organizationId !== person.organizationId) anomalies.activeLinkTenantMismatch += 1;
      if (link.generation !== (person.lineLinkGeneration ?? 0)) anomalies.activeLinkGenerationMismatch += 1;
      const provider = await ctx.db.get(link.lineProviderUserId);
      if (!provider || provider.isDeleted) {
        anomalies.activeLinkDanglingProvider += 1;
        continue;
      }
      const canonicalLinkIsValid =
        person.status === "active" &&
        links.length === 1 &&
        link.organizationId === person.organizationId &&
        link.generation === (person.lineLinkGeneration ?? 0);
      if (!canonicalLinkIsValid || activeStaffs.length === 0) continue;

      let hasExactProjectionForEveryActiveStaff = true;
      for (const staff of activeStaffs) {
        const accounts = await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId_and_isDeleted", (q) => q.eq("staffId", staff._id).eq("isDeleted", false))
          .take(2);
        if (
          accounts.length !== 1 ||
          accounts[0]?.shopId !== staff.shopId ||
          accounts[0]?.lineUserId !== provider.lineUserId ||
          accounts[0]?.following !== provider.following
        ) {
          hasExactProjectionForEveryActiveStaff = false;
          break;
        }
      }
      if (!hasExactProjectionForEveryActiveStaff) {
        anomalies.activeCanonicalLinkWithoutExactLegacyProjection += 1;
      }
    }
    return { ...pageMetadata(result), anomalies, observations: { activePeople } };
  },
});

/** provider userのraw ID重複を、ID自体を返さずgroup単位で数える。 */
export const verifyLineCommonProviders = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("lineProviderUsers").paginate(paginationOpts);
    let activeProviderUsers = 0;
    let duplicateActiveProviderUserGroups = 0;
    for (const provider of result.page) {
      if (provider.isDeleted) continue;
      activeProviderUsers += 1;
      const candidates = await ctx.db
        .query("lineProviderUsers")
        .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", provider.lineUserId).eq("isDeleted", false))
        .take(2);
      if (candidates.length > 1 && candidates[0]?._id === provider._id) {
        duplicateActiveProviderUserGroups += 1;
      }
    }
    return {
      ...pageMetadata(result),
      anomalies: { duplicateActiveProviderUserGroups },
      observations: { activeProviderUsers },
    };
  },
});

/** legacy行とcanonical counterpartを一行ずつ検証し、変換必要数だけを返す。 */
export const verifyLineCommonLegacyAccounts = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("staffLineAccounts").paginate(paginationOpts);
    const anomalies = { danglingActiveLegacyAccount: 0, tenantMismatch: 0 };
    let activeLegacyAccounts = 0;
    let activeLegacyWithoutCanonicalCounterpart = 0;
    for (const account of result.page) {
      if (account.isDeleted) continue;
      activeLegacyAccounts += 1;
      const staff = await ctx.db.get(account.staffId);
      if (
        !staff ||
        staff.isDeleted ||
        staff.shopId !== account.shopId ||
        !staff.organizationId ||
        !staff.organizationPersonId
      ) {
        anomalies.danglingActiveLegacyAccount += 1;
        activeLegacyWithoutCanonicalCounterpart += 1;
        continue;
      }
      const organizationPersonId = staff.organizationPersonId;
      const [shop, person, links] = await Promise.all([
        ctx.db.get(staff.shopId),
        ctx.db.get(organizationPersonId),
        ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", organizationPersonId).eq("isDeleted", false),
          )
          .take(2),
      ]);
      if (
        !shop ||
        shop.organizationId !== staff.organizationId ||
        !person ||
        person.organizationId !== staff.organizationId
      ) {
        anomalies.tenantMismatch += 1;
        activeLegacyWithoutCanonicalCounterpart += 1;
        continue;
      }
      const link = links.length === 1 ? links[0] : undefined;
      const provider = link ? await ctx.db.get(link.lineProviderUserId) : null;
      if (
        !link ||
        link.organizationId !== staff.organizationId ||
        !provider ||
        provider.isDeleted ||
        provider.lineUserId !== account.lineUserId ||
        provider.following !== account.following
      ) {
        activeLegacyWithoutCanonicalCounterpart += 1;
      }
    }
    return {
      ...pageMetadata(result),
      anomalies,
      observations: { activeLegacyAccounts, activeLegacyWithoutCanonicalCounterpart },
    };
  },
});

/** 旧tokenと世代snapshotのないactive LINE Outboxを、credentialなしの件数で返す。 */
export const verifyLineCommonAsyncCompatibility = internalQuery({
  args: { paginationOpts: paginationOptsValidator, table: v.union(v.literal("tokens"), v.literal("outbox")) },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts, table }) => {
    requireBoundedPagination(paginationOpts);
    const now = Date.now();
    if (table === "tokens") {
      const result = await ctx.db.query("lineLinkTokens").paginate(paginationOpts);
      let oldUnusedTokens = 0;
      let incompleteUnusedTokenSnapshots = 0;
      for (const token of result.page) {
        if (token.expiresAt <= now || token.usedAt !== undefined || token.revokedAt !== undefined) continue;
        const snapshotCount = [
          token.organizationId,
          token.organizationPersonId,
          token.lineLinkGenerationAtIssue,
        ].filter((value) => value !== undefined).length;
        if (snapshotCount < 3) oldUnusedTokens += 1;
        if (snapshotCount > 0 && snapshotCount < 3) incompleteUnusedTokenSnapshots += 1;
      }
      return {
        ...pageMetadata(result),
        anomalies: { incompleteUnusedTokenSnapshots, incompleteActiveLineOutboxSnapshots: 0 },
        observations: { oldUnusedTokens, activeLineOutboxWithoutGeneration: 0 },
      };
    }
    const result = await ctx.db.query("notificationOutbox").paginate(paginationOpts);
    let activeLineOutboxWithoutGeneration = 0;
    let incompleteActiveLineOutboxSnapshots = 0;
    for (const job of result.page) {
      if (job.channel !== "line" || (job.status !== "pending" && job.status !== "processing")) continue;
      const missingLink = job.organizationPersonLineLinkId === undefined;
      const missingGeneration = job.organizationPersonLineGenerationAtEnqueue === undefined;
      if (missingLink || missingGeneration) activeLineOutboxWithoutGeneration += 1;
      if (missingLink !== missingGeneration) incompleteActiveLineOutboxSnapshots += 1;
    }
    return {
      ...pageMetadata(result),
      anomalies: { incompleteUnusedTokenSnapshots: 0, incompleteActiveLineOutboxSnapshots },
      observations: { oldUnusedTokens: 0, activeLineOutboxWithoutGeneration },
    };
  },
});

type ScheduledLineInviteCaller = {
  name: string;
  state: { kind: string };
  args: readonly unknown[];
};

export function inspectLiveLineInviteCaller(job: ScheduledLineInviteCaller) {
  if (
    job.name !== "line/actions:sendInviteEmail" ||
    (job.state.kind !== "pending" && job.state.kind !== "inProgress")
  ) {
    return null;
  }
  const firstArg = job.args[0];
  const args = typeof firstArg === "object" && firstArg !== null && !Array.isArray(firstArg) ? firstArg : {};
  const hasPerson = "organizationPersonId" in args;
  const hasGeneration = "lineLinkGenerationAtSchedule" in args;
  return {
    oldShape: !hasPerson && !hasGeneration,
    incompleteSnapshot: hasPerson !== hasGeneration,
  };
}

/** system tableの待機中・実行中LINE招待callerを実deployment上で数える。 */
export const verifyLineCommonScheduledCallers = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: lineCommonLinkPageValidator,
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.system.query("_scheduled_functions").paginate(paginationOpts);
    let liveLineInviteCallers = 0;
    let oldLiveLineInviteCallers = 0;
    let incompleteLiveLineInviteSnapshots = 0;
    for (const job of result.page) {
      const inspection = inspectLiveLineInviteCaller(job);
      if (!inspection) continue;
      liveLineInviteCallers += 1;
      if (inspection.oldShape) oldLiveLineInviteCallers += 1;
      if (inspection.incompleteSnapshot) incompleteLiveLineInviteSnapshots += 1;
    }
    return {
      ...pageMetadata(result),
      anomalies: { incompleteLiveLineInviteSnapshots },
      observations: { liveLineInviteCallers, oldLiveLineInviteCallers },
    };
  },
});
