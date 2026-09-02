import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  LINE_FRIENDSHIP_FANOUT_RETENTION_MS,
  LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX,
  LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT,
  LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX,
  LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT,
  LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX,
} from "../constants";
import { deletedLineUserId } from "../deletionCleanup/tombstone";
import {
  type CanonicalStaff,
  hasCanonicalStaffIdentity,
  hasValidCanonicalStaffUserLifecycle,
  hasValidOrganizationPersonUserLifecycle,
} from "../staff/service";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

const LINE_LINK_ERROR = "LINE連携を完了できませんでした。";

type CanonicalStaffScope = {
  staff: CanonicalStaff;
  shop: Doc<"shops">;
  organization: Doc<"organizations">;
  person: Doc<"organizationPeople">;
};

export type OrganizationPersonLineRecipient = {
  organizationPersonLineLinkId: Id<"organizationPersonLineLinks">;
  generation: number;
  lineProviderUserId: Id<"lineProviderUsers">;
  lineUserId: string;
  following: boolean;
};

export type ResolvedOrganizationPersonLineRecipient = {
  authority: "canonical";
  organizationId: Id<"organizations">;
  organizationPersonId: Id<"organizationPeople">;
} & OrganizationPersonLineRecipient;

export type ResolvedStaffLineRecipient = {
  authority: "canonical";
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  organizationId: Id<"organizations">;
  organizationPersonId: Id<"organizationPeople">;
} & OrganizationPersonLineRecipient;

export type OrganizationPersonLineState = {
  authority: "canonical";
  status: "unlinked" | "linked_following" | "linked_unfollowed";
  organizationPersonLineLinkId: Id<"organizationPersonLineLinks"> | null;
  generation: number;
};

export async function resolveCanonicalStaffScope(
  ctx: DbCtx,
  args: { staffId: Id<"staffs">; shopId?: Id<"shops"> },
): Promise<CanonicalStaffScope | null> {
  const staff = await ctx.db.get(args.staffId);
  if (!staff || staff.isDeleted || !hasCanonicalStaffIdentity(staff) || (args.shopId && staff.shopId !== args.shopId)) {
    return null;
  }
  const shop = await ctx.db.get(staff.shopId);
  if (!shop || shop.isDeleted || !shop.organizationId || staff.organizationId !== shop.organizationId) {
    return null;
  }
  const [organization, person] = await Promise.all([
    ctx.db.get(shop.organizationId),
    ctx.db.get(staff.organizationPersonId),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !person ||
    person.status !== "active" ||
    person.organizationId !== organization._id
  ) {
    return null;
  }
  if (!(await hasValidCanonicalStaffUserLifecycle(ctx, staff, person))) return null;
  return { staff, shop, organization, person };
}

async function getUniqueActivePersonLink(ctx: DbCtx, organizationPersonId: Id<"organizationPeople">) {
  const links = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
      q.eq("organizationPersonId", organizationPersonId).eq("isDeleted", false),
    )
    .take(2);
  return links.length === 1 ? links[0] : links.length === 0 ? null : undefined;
}

async function getValidProviderForLink(ctx: DbCtx, link: Doc<"organizationPersonLineLinks">) {
  const provider = await ctx.db.get(link.lineProviderUserId);
  if (!provider || provider.isDeleted) return null;
  const activeProviders = await ctx.db
    .query("lineProviderUsers")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", provider.lineUserId).eq("isDeleted", false))
    .take(2);
  return activeProviders.length === 1 && activeProviders[0]._id === provider._id ? provider : null;
}

/** UI projection向け。未連携とcanonical不整合を区別し、raw LINE IDは返さない。 */
export async function getOrganizationPersonLineState(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
): Promise<OrganizationPersonLineState | null> {
  const [organization, person] = await Promise.all([
    ctx.db.get(args.organizationId),
    ctx.db.get(args.organizationPersonId),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !person ||
    person.status !== "active" ||
    person.organizationId !== organization._id
  ) {
    return null;
  }
  if (!(await hasValidOrganizationPersonUserLifecycle(ctx, person))) return null;
  const generation = person.lineLinkGeneration ?? 0;

  const link = await getUniqueActivePersonLink(ctx, person._id);
  if (link === undefined) return null;
  if (!link) {
    return { authority: "canonical", status: "unlinked", organizationPersonLineLinkId: null, generation };
  }
  if (link.organizationId !== organization._id || link.generation !== generation) return null;
  const provider = await getValidProviderForLink(ctx, link);
  if (!provider) return null;
  return {
    authority: "canonical",
    status: provider.following ? "linked_following" : "linked_unfollowed",
    organizationPersonLineLinkId: link._id,
    generation,
  };
}

/** canonical正本から解決するbackend専用のorganization person recipient。 */
export async function resolveOrganizationPersonLineRecipient(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
): Promise<ResolvedOrganizationPersonLineRecipient | null> {
  const [organization, person] = await Promise.all([
    ctx.db.get(args.organizationId),
    ctx.db.get(args.organizationPersonId),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !person ||
    person.status !== "active" ||
    person.organizationId !== organization._id
  ) {
    return null;
  }
  const recipient = await getOrganizationPersonLineRecipient(ctx, args);
  return recipient
    ? {
        authority: "canonical",
        organizationId: organization._id,
        organizationPersonId: person._id,
        ...recipient,
      }
    : null;
}

/** staff所属追加のwrite-side継承専用。canonical正本から現在の連携先を解決する。 */
export async function resolveOrganizationPersonLineInheritanceRecipient(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
): Promise<ResolvedOrganizationPersonLineRecipient | null> {
  return await resolveOrganizationPersonLineRecipient(ctx, args);
}

/** 通知backend向け。public DTOにはこのraw recipientを含めない。 */
export async function getOrganizationPersonLineRecipient(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
): Promise<OrganizationPersonLineRecipient | null> {
  const [organization, person] = await Promise.all([
    ctx.db.get(args.organizationId),
    ctx.db.get(args.organizationPersonId),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !person ||
    person.status !== "active" ||
    person.organizationId !== organization._id
  ) {
    return null;
  }
  if (!(await hasValidOrganizationPersonUserLifecycle(ctx, person))) return null;
  const link = await getUniqueActivePersonLink(ctx, person._id);
  if (!link || link === undefined || link.organizationId !== organization._id) return null;
  const generation = person.lineLinkGeneration ?? 0;
  if (link.generation !== generation) return null;
  const provider = await getValidProviderForLink(ctx, link);
  if (!provider) return null;
  return {
    organizationPersonLineLinkId: link._id,
    generation,
    lineProviderUserId: provider._id,
    lineUserId: provider.lineUserId,
    following: provider.following,
  };
}

export async function resolveStaffLineRecipient(
  ctx: DbCtx,
  args: { staffId: Id<"staffs">; shopId?: Id<"shops"> },
): Promise<ResolvedStaffLineRecipient | null> {
  const scope = await resolveCanonicalStaffScope(ctx, args);
  if (!scope) return null;
  const recipient = await getOrganizationPersonLineRecipient(ctx, {
    organizationId: scope.organization._id,
    organizationPersonId: scope.person._id,
  });
  if (!recipient) return null;
  return {
    authority: "canonical",
    staffId: scope.staff._id,
    shopId: scope.shop._id,
    organizationId: scope.organization._id,
    organizationPersonId: scope.person._id,
    ...recipient,
  };
}

export async function listActiveStaffsForOrganizationPerson(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
) {
  const person = await ctx.db.get(args.organizationPersonId);
  if (
    !person ||
    person.organizationId !== args.organizationId ||
    person.status !== "active" ||
    !(await hasValidOrganizationPersonUserLifecycle(ctx, person))
  ) {
    throw new ConvexError(LINE_LINK_ERROR);
  }
  const candidates = await listOrganizationPersonStaffHistory(ctx, args);
  const shops = await Promise.all(candidates.map(async (staff) => await ctx.db.get(staff.shopId)));
  const active: Doc<"staffs">[] = [];
  for (const [index, staff] of candidates.entries()) {
    const shop = shops[index];
    if (!shop || shop.isDeleted || shop.organizationId !== args.organizationId) {
      continue;
    }
    if (!hasCanonicalStaffIdentity(staff) || !(await hasValidCanonicalStaffUserLifecycle(ctx, staff, person))) {
      throw new ConvexError(LINE_LINK_ERROR);
    }
    active.push(staff);
    if (active.length > LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX) throw new ConvexError(LINE_LINK_ERROR);
  }
  return active;
}

/** 削除済み店舗の所属も含むnondeleted staff履歴。旧shape capability失効にだけ使う。 */
export async function listOrganizationPersonStaffHistory(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople"> },
) {
  const candidates = await ctx.db
    .query("staffs")
    .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("organizationPersonId", args.organizationPersonId)
        .eq("isDeleted", false),
    )
    .take(LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT + 1);
  if (candidates.length > LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT) {
    throw new ConvexError(LINE_LINK_ERROR);
  }
  return candidates;
}

/** Widen前tokenも含め、同じorganization personの未期限切れ候補をboundedに集める。 */
export async function collectOrganizationPersonActiveLineTokens(
  ctx: DbCtx,
  args: { organizationId: Id<"organizations">; organizationPersonId: Id<"organizationPeople">; now: number },
) {
  const byId = new Map<Id<"lineLinkTokens">, Doc<"lineLinkTokens">>();
  const canonicalTokens = await ctx.db
    .query("lineLinkTokens")
    .withIndex("by_organizationPersonId_and_expiresAt", (q) =>
      q.eq("organizationPersonId", args.organizationPersonId).gte("expiresAt", args.now),
    )
    .take(LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT + 1);
  for (const token of canonicalTokens) byId.set(token._id, token);
  if (byId.size > LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT) throw new ConvexError(LINE_LINK_ERROR);

  const staffs = await listOrganizationPersonStaffHistory(ctx, args);
  for (const staff of staffs) {
    const remaining = LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT + 1 - byId.size;
    const staffTokens = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_staffId_and_expiresAt", (q) => q.eq("staffId", staff._id).gte("expiresAt", args.now))
      .take(remaining);
    for (const token of staffTokens) byId.set(token._id, token);
    if (byId.size > LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT) throw new ConvexError(LINE_LINK_ERROR);
  }
  return [...byId.values()];
}

type ProviderObservation = {
  lineUserId: string;
  following: boolean;
  observedAt: number;
  source: "oauth" | "webhook";
  webhookReceivedAt?: number;
  webhookEventId?: string;
  webhookEventTimestamp?: number;
};

function compareWebhookObservation(timestampA: number, eventIdA: string, timestampB: number, eventIdB: string) {
  if (timestampA !== timestampB) return timestampA - timestampB;
  return eventIdA.localeCompare(eventIdB);
}

function isNewerProviderObservation(provider: Doc<"lineProviderUsers">, observation: ProviderObservation) {
  if (observation.source === "webhook") {
    if (!observation.webhookEventId || observation.webhookEventTimestamp === undefined) return false;
    if (provider.lastWebhookEventId === observation.webhookEventId) return false;
    if (
      provider.lastWebhookEventTimestamp !== undefined &&
      provider.lastWebhookEventId !== undefined &&
      compareWebhookObservation(
        observation.webhookEventTimestamp,
        observation.webhookEventId,
        provider.lastWebhookEventTimestamp,
        provider.lastWebhookEventId,
      ) <= 0
    ) {
      return false;
    }
    if (provider.friendshipObservationSource === "oauth") {
      // OAuthはcallback受理時の現在状態。callback後に配送されたprovider eventだけを上書きに使う。
      return observation.observedAt >= provider.friendshipObservedAt;
    }
    return true;
  }
  if (observation.observedAt !== provider.friendshipObservedAt) {
    return observation.observedAt > provider.friendshipObservedAt;
  }
  // 同時刻のOAuth観測はprovider eventより弱く、既知Webhook状態を戻さない。
  return provider.friendshipObservationSource !== "webhook";
}

export async function upsertLineProviderUser(ctx: MutationCtx, observation: ProviderObservation) {
  const providers = await ctx.db
    .query("lineProviderUsers")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", observation.lineUserId).eq("isDeleted", false))
    .take(2);
  if (providers.length > 1) throw new ConvexError(LINE_LINK_ERROR);
  const existing = providers[0];
  if (!existing) {
    const providerId = await ctx.db.insert("lineProviderUsers", {
      lineUserId: observation.lineUserId,
      following: observation.following,
      stateVersion: 1,
      friendshipObservedAt: observation.observedAt,
      friendshipObservationSource: observation.source,
      ...(observation.source === "webhook"
        ? {
            lastWebhookAt: observation.webhookReceivedAt,
            lastWebhookEventId: observation.webhookEventId,
            lastWebhookEventTimestamp: observation.webhookEventTimestamp,
          }
        : {}),
      isDeleted: false,
    });
    const provider = await ctx.db.get(providerId);
    if (!provider) throw new ConvexError(LINE_LINK_ERROR);
    return { provider, accepted: true, stateChanged: true };
  }
  if (!isNewerProviderObservation(existing, observation)) {
    return { provider: existing, accepted: false, stateChanged: false };
  }
  const stateChanged = existing.following !== observation.following;
  // 新規連携時のOAuthは現在状態を観測するため、前LINE利用者のWebhook順序を引き継がない。
  const resetWebhookOrder = observation.source === "oauth";
  await ctx.db.patch(existing._id, {
    following: observation.following,
    stateVersion: existing.stateVersion + (stateChanged ? 1 : 0),
    friendshipObservedAt: observation.observedAt,
    friendshipObservationSource: observation.source,
    ...(resetWebhookOrder
      ? {
          lastWebhookAt: undefined,
          lastWebhookEventId: undefined,
          lastWebhookEventTimestamp: undefined,
        }
      : {}),
    ...(observation.source === "webhook"
      ? {
          lastWebhookAt: observation.webhookReceivedAt,
          lastWebhookEventId: observation.webhookEventId,
          lastWebhookEventTimestamp: observation.webhookEventTimestamp,
        }
      : {}),
  });
  const provider = await ctx.db.get(existing._id);
  if (!provider) throw new ConvexError(LINE_LINK_ERROR);
  return { provider, accepted: true, stateChanged };
}

export async function ensureFriendshipFanoutJob(
  ctx: MutationCtx,
  args: { provider: Doc<"lineProviderUsers">; stateChanged: boolean },
) {
  const existing = await ctx.db
    .query("lineFriendshipFanoutJobs")
    .withIndex("by_lineProviderUserId_and_stateVersion", (q) =>
      q.eq("lineProviderUserId", args.provider._id).eq("stateVersion", args.provider.stateVersion),
    )
    .take(2);
  if (existing.length > 1) throw new ConvexError(LINE_LINK_ERROR);
  if (existing[0]) {
    // OAuth取得後に同stateVersionのWebhookが先着したraceでは、そのjobへ新linkも収束させる。
    // terminal jobは既に対象集合を確定済みなので、通常の再連携side effectを直接処理する。
    return ["queued", "processing", "retrying", "actionRequired"].includes(existing[0].status) ? existing[0]._id : null;
  }
  if (!args.stateChanged) return null;
  const activeLinks = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_lineProviderUserId_and_isDeleted", (q) =>
      q.eq("lineProviderUserId", args.provider._id).eq("isDeleted", false),
    )
    .take(1);
  if (activeLinks.length === 0) return null;
  const now = Date.now();
  return await ctx.db.insert("lineFriendshipFanoutJobs", {
    lineProviderUserId: args.provider._id,
    stateVersion: args.provider.stateVersion,
    following: args.provider.following,
    status: "queued",
    version: 1,
    attemptCount: 0,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + LINE_FRIENDSHIP_FANOUT_RETENTION_MS,
  });
}

export async function upsertOrganizationPersonLineLink(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    lineProviderUserId: Id<"lineProviderUsers">;
    linkedAt: number;
  },
) {
  const person = await ctx.db.get(args.organizationPersonId);
  const [organization, provider] = await Promise.all([
    ctx.db.get(args.organizationId),
    ctx.db.get(args.lineProviderUserId),
  ]);
  if (
    !organization ||
    organization.isDeleted ||
    !provider ||
    provider.isDeleted ||
    !person ||
    person.status !== "active" ||
    person.organizationId !== args.organizationId
  ) {
    throw new ConvexError(LINE_LINK_ERROR);
  }
  const owners = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_organizationId_and_lineProviderUserId_and_isDeleted", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("lineProviderUserId", args.lineProviderUserId)
        .eq("isDeleted", false),
    )
    .take(2);
  if (owners.length > 1 || (owners[0] && owners[0].organizationPersonId !== person._id)) {
    throw new ConvexError(LINE_LINK_ERROR);
  }
  const providerLinks = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_lineProviderUserId_and_isDeleted", (q) =>
      q.eq("lineProviderUserId", args.lineProviderUserId).eq("isDeleted", false),
    )
    .take(LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX + 1);
  const current = await getUniqueActivePersonLink(ctx, person._id);
  if (
    current === undefined ||
    (current && current.organizationId !== args.organizationId) ||
    providerLinks.length > LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX
  ) {
    throw new ConvexError(LINE_LINK_ERROR);
  }
  const alreadyUsesProvider = current?.lineProviderUserId === args.lineProviderUserId;
  if (!alreadyUsesProvider && providerLinks.length >= LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX) {
    throw new ConvexError(LINE_LINK_ERROR);
  }

  const generation = (person.lineLinkGeneration ?? 0) + 1;
  let linkId: Id<"organizationPersonLineLinks">;
  let replacedProviderUserId: Id<"lineProviderUsers"> | null = null;
  if (current) {
    if (alreadyUsesProvider) {
      await ctx.db.patch(current._id, { generation });
      linkId = current._id;
    } else {
      replacedProviderUserId = current.lineProviderUserId;
      await ctx.db.patch(current._id, { isDeleted: true, unlinkedAt: args.linkedAt });
      linkId = await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: args.organizationId,
        organizationPersonId: person._id,
        lineProviderUserId: args.lineProviderUserId,
        generation,
        linkedAt: args.linkedAt,
        isDeleted: false,
      });
    }
  } else {
    linkId = await ctx.db.insert("organizationPersonLineLinks", {
      organizationId: args.organizationId,
      organizationPersonId: person._id,
      lineProviderUserId: args.lineProviderUserId,
      generation,
      linkedAt: args.linkedAt,
      isDeleted: false,
    });
  }
  await ctx.db.patch(person._id, { lineLinkGeneration: generation, updatedAt: args.linkedAt });
  return { linkId, generation, replacedProviderUserId };
}

export async function revokeOrganizationPersonLineTokens(
  ctx: MutationCtx,
  args: {
    organizationPersonId: Id<"organizationPeople">;
    occurredAt: number;
    exceptTokenId?: Id<"lineLinkTokens">;
  },
) {
  const person = await ctx.db.get(args.organizationPersonId);
  if (!person) throw new ConvexError(LINE_LINK_ERROR);
  const candidates = await collectOrganizationPersonActiveLineTokens(ctx, {
    organizationId: person.organizationId,
    organizationPersonId: person._id,
    now: args.occurredAt,
  });
  for (const token of candidates) {
    if (token._id !== args.exceptTokenId && !token.revokedAt && !token.usedAt) {
      await ctx.db.patch(token._id, { revokedAt: args.occurredAt });
    }
  }
}

export async function tombstoneLineProviderUserIfUnreferenced(
  ctx: MutationCtx,
  lineProviderUserId: Id<"lineProviderUsers">,
) {
  const provider = await ctx.db.get(lineProviderUserId);
  if (!provider || provider.isDeleted) return false;
  const links = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_lineProviderUserId_and_isDeleted", (q) =>
      q.eq("lineProviderUserId", lineProviderUserId).eq("isDeleted", false),
    )
    .take(1);
  if (links.length > 0) return false;
  await ctx.db.patch(provider._id, {
    lineUserId: deletedLineUserId(provider._id),
    following: false,
    stateVersion: provider.stateVersion + 1,
    isDeleted: true,
  });
  return true;
}

export async function disconnectOrganizationPersonLine(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    occurredAt: number;
  },
) {
  const person = await ctx.db.get(args.organizationPersonId);
  if (person?.status !== "active" || person.organizationId !== args.organizationId) {
    throw new ConvexError("Not found");
  }
  const link = await getUniqueActivePersonLink(ctx, person._id);
  if (link === undefined || (link && link.organizationId !== args.organizationId)) {
    throw new ConvexError("Not found");
  }
  const generation = (person.lineLinkGeneration ?? 0) + (link ? 1 : 0);
  if (!link) return { changed: false, generation };
  await ctx.db.patch(link._id, { isDeleted: true, unlinkedAt: args.occurredAt });
  await ctx.db.patch(person._id, { lineLinkGeneration: generation, updatedAt: args.occurredAt });
  await revokeOrganizationPersonLineTokens(ctx, {
    organizationPersonId: person._id,
    occurredAt: args.occurredAt,
  });
  await tombstoneLineProviderUserIfUnreferenced(ctx, link.lineProviderUserId);
  return { changed: true, generation, lineProviderUserId: link.lineProviderUserId };
}

export async function getStaffLineAccount(ctx: DbCtx, staffId: Id<"staffs">) {
  const accounts = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId_and_isDeleted", (q) => q.eq("staffId", staffId).eq("isDeleted", false))
    .take(2);
  if (accounts.length > 1) throw new ConvexError(LINE_LINK_ERROR);
  return accounts[0] ?? null;
}

export async function findStaffLineAccountByLineUserId(ctx: DbCtx, lineUserId: string) {
  const account = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .first();
  return account ?? null;
}

/**
 * 同じ lineUserId に紐づくアクティブなアカウントを、上限超過を判定できる1件分まで取得する。
 * 呼び出し側は上限超過時に更新前に停止し、部分反映してはならない。
 */
export async function findStaffLineAccountsByLineUserId(ctx: DbCtx, lineUserId: string) {
  return await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .take(LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX + 1);
}

export async function upsertStaffLineAccount(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    lineUserId: string;
    following: boolean;
  },
) {
  const candidates = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
    .take(2);
  if (candidates.length > 1) throw new ConvexError(LINE_LINK_ERROR);
  const existing = candidates[0];
  const now = Date.now();
  if (existing) {
    const lineUserChanged = existing.lineUserId !== args.lineUserId;
    await ctx.db.patch(existing._id, {
      shopId: args.shopId,
      lineUserId: args.lineUserId,
      linkedAt: existing.linkedAt,
      following: args.following,
      // 別LINE userへ付け替えた場合、旧userのWebhook順序を新userへ持ち越さない。
      ...(lineUserChanged
        ? {
            lastWebhookAt: undefined,
            lastWebhookEventId: undefined,
            lastWebhookEventTimestamp: undefined,
          }
        : {}),
      isDeleted: false,
    });
    return existing._id;
  }

  return await ctx.db.insert("staffLineAccounts", {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: args.lineUserId,
    linkedAt: now,
    following: args.following,
    isDeleted: false,
  });
}
