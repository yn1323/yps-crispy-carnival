import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import { sha256Hex } from "../_lib/sha256";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/planLimits";
import { organizationShopOperatingStatus } from "./shopMembershipChange";

export const ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT = ORGANIZATION_PLAN_LIMITS.business.maxPeople;
export const ORGANIZATION_STAFF_ORDER_ACTIVE_SHOP_LIMIT = 5;
const BOUNDED_PEOPLE_READ = ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT + 1;
const BOUNDED_SHOP_CANDIDATE_READ = ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT + 1;
const BOUNDED_STATE_READ = 3;

type ReadCtx = { db: DatabaseReader };
type WriteCtx = { db: DatabaseWriter };

type ActiveShopStaff = {
  staff: Doc<"staffs">;
  organizationPersonId: Id<"organizationPeople">;
};

export type OrganizationStaffOrderSourceSnapshot = {
  people: Doc<"organizationPeople">[];
  activeShops: Array<{
    shop: Doc<"shops">;
    staffs: ActiveShopStaff[];
  }>;
};

export type OrganizationStaffOrderAvailability =
  | "ready"
  | "tooManyPeople"
  | "tooManyActiveShops"
  | "legacyDataIncomplete";

type SourceSnapshotResult =
  | { availability: "ready"; snapshot: OrganizationStaffOrderSourceSnapshot }
  | { availability: Exclude<OrganizationStaffOrderAvailability, "ready">; people: Doc<"organizationPeople">[] };

type OrganizationOrderState = Doc<"organizationStaffOrderStates">;

type OrganizationOrderResolution = {
  state: OrganizationOrderState | null;
  stateRows: OrganizationOrderState[];
  organizationEntries: Doc<"organizationStaffOrderEntries">[];
  shopEntries: Map<Id<"shops">, Doc<"shopStaffOrderEntries">[]>;
  orderedPersonIds: Id<"organizationPeople">[];
  isOrdered: boolean;
  repairable: boolean;
};

export type OrganizationStaffOrderScope = { mode: "legacy" } | { mode: "ordered"; revision: number };

export type OrganizationStaffOrderEditorSnapshot = {
  availability: OrganizationStaffOrderAvailability;
  source: OrganizationStaffOrderSourceSnapshot | null;
  orderedPersonIds: Id<"organizationPeople">[];
  orderFingerprint: string;
  resolution: OrganizationOrderResolution | null;
};

export const STALE_ORGANIZATION_STAFF_ORDER_ERROR =
  "スタッフ情報が変更されています。\n最新の内容を確認して、もう一度お試しください。";

function comparePersonFallback(left: Doc<"organizationPeople">, right: Doc<"organizationPeople">) {
  return (
    left.createdAt - right.createdAt || left._creationTime - right._creationTime || left._id.localeCompare(right._id)
  );
}

function isValidRevision(value: number) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isValidDisplayOrder(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function idsMatch(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function hasUniqueValues(values: readonly string[]) {
  return new Set(values).size === values.length;
}

async function listActiveShops(ctx: ReadCtx, organizationId: Id<"organizations">) {
  // operatingStatus欠損は既存の移行互換規約どおりactiveとして扱う。
  // isDeletedはindexに含まれないため、statusごとのcandidate自体を固定上限で読む。
  // 全candidateを読めない場合は、稼働中の一部shopだけをsourceにせずfail closedする。
  const [activeCandidates, legacyActiveCandidates] = await Promise.all([
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", "active"),
      )
      .take(BOUNDED_SHOP_CANDIDATE_READ),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", organizationId).eq("operatingStatus", undefined),
      )
      .take(BOUNDED_SHOP_CANDIDATE_READ),
  ]);
  if (
    activeCandidates.length >= BOUNDED_SHOP_CANDIDATE_READ ||
    legacyActiveCandidates.length >= BOUNDED_SHOP_CANDIDATE_READ
  ) {
    return null;
  }
  return [...activeCandidates, ...legacyActiveCandidates]
    .filter((shop) => !shop.isDeleted && organizationShopOperatingStatus(shop.operatingStatus) === "active")
    .sort((left, right) => left._id.localeCompare(right._id));
}

/** 並び順を有効化できるcanonical sourceを、契約上限+1件で検査する。 */
export async function getOrganizationStaffOrderSourceSnapshot(
  ctx: ReadCtx,
  organizationId: Id<"organizations">,
): Promise<SourceSnapshotResult> {
  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
    .take(BOUNDED_PEOPLE_READ);
  const sortedPeople = people.sort(comparePersonFallback);
  if (people.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT) {
    return { availability: "tooManyPeople", people: sortedPeople };
  }

  const activeShops = await listActiveShops(ctx, organizationId);
  if (!activeShops) {
    return { availability: "legacyDataIncomplete", people: sortedPeople };
  }
  if (activeShops.length > ORGANIZATION_STAFF_ORDER_ACTIVE_SHOP_LIMIT) {
    return { availability: "tooManyActiveShops", people: sortedPeople };
  }

  const peopleById = new Map(people.map((person) => [person._id, person]));
  const shopsWithStaffs: OrganizationStaffOrderSourceSnapshot["activeShops"] = [];
  for (const shop of activeShops) {
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .take(BOUNDED_PEOPLE_READ);
    if (staffs.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT) {
      return { availability: "legacyDataIncomplete", people: sortedPeople };
    }
    const canonicalStaffs: ActiveShopStaff[] = [];
    const seenPersonIds = new Set<Id<"organizationPeople">>();
    for (const staff of staffs) {
      const personId = staff.organizationPersonId;
      if (
        staff.organizationId !== organizationId ||
        !personId ||
        !peopleById.has(personId) ||
        seenPersonIds.has(personId)
      ) {
        return { availability: "legacyDataIncomplete", people: sortedPeople };
      }
      seenPersonIds.add(personId);
      canonicalStaffs.push({ staff, organizationPersonId: personId });
    }
    shopsWithStaffs.push({ shop, staffs: canonicalStaffs });
  }

  return {
    availability: "ready",
    snapshot: { people: sortedPeople, activeShops: shopsWithStaffs },
  };
}

async function readOrganizationOrderResolution(
  ctx: ReadCtx,
  organizationId: Id<"organizations">,
  source: OrganizationStaffOrderSourceSnapshot,
): Promise<OrganizationOrderResolution> {
  const [stateRows, organizationEntries] = await Promise.all([
    ctx.db
      .query("organizationStaffOrderStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(BOUNDED_STATE_READ),
    ctx.db
      .query("organizationStaffOrderEntries")
      .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organizationId))
      .take(BOUNDED_PEOPLE_READ),
  ]);
  const state = stateRows.length === 1 && isValidRevision(stateRows[0].revision) ? stateRows[0] : null;
  const fallbackPersonIds = source.people.map((person) => person._id);
  let repairable =
    stateRows.length < BOUNDED_STATE_READ && organizationEntries.length <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT;

  const organizationEntryPersonIds = organizationEntries.map((entry) => entry.organizationPersonId);
  const organizationDisplayOrders = organizationEntries.map((entry) => entry.displayOrder);
  const organizationEntriesValid =
    organizationEntries.length <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT &&
    organizationEntries.every(
      (entry) => entry.organizationId === organizationId && isValidDisplayOrder(entry.displayOrder),
    ) &&
    hasUniqueValues(organizationEntryPersonIds) &&
    hasUniqueValues(organizationDisplayOrders.map(String)) &&
    idsMatch(organizationEntryPersonIds, fallbackPersonIds);

  const personRank = new Map(
    organizationEntries.map((entry) => [entry.organizationPersonId, entry.displayOrder] as const),
  );
  const shopEntries = new Map<Id<"shops">, Doc<"shopStaffOrderEntries">[]>();
  let allShopEntriesValid = true;
  for (const { shop, staffs } of source.activeShops) {
    const entries = await ctx.db
      .query("shopStaffOrderEntries")
      .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shop._id))
      .take(BOUNDED_PEOPLE_READ);
    shopEntries.set(shop._id, entries);
    if (entries.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT) repairable = false;
    const expectedStaffIds = staffs.map(({ staff }) => staff._id);
    const entryStaffIds = entries.map((entry) => entry.staffId);
    const entryPersonIds = entries.map((entry) => entry.organizationPersonId);
    const displayOrders = entries.map((entry) => entry.displayOrder);
    const staffById = new Map(staffs.map((entry) => [entry.staff._id, entry]));
    const valid =
      entries.length <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT &&
      idsMatch(entryStaffIds, expectedStaffIds) &&
      hasUniqueValues(entryStaffIds) &&
      hasUniqueValues(entryPersonIds) &&
      hasUniqueValues(displayOrders.map(String)) &&
      entries.every((entry) => {
        const sourceStaff = staffById.get(entry.staffId);
        return (
          entry.organizationId === organizationId &&
          entry.shopId === shop._id &&
          isValidDisplayOrder(entry.displayOrder) &&
          sourceStaff?.organizationPersonId === entry.organizationPersonId &&
          personRank.get(entry.organizationPersonId) === entry.displayOrder
        );
      });
    if (!valid) allShopEntriesValid = false;
  }

  const isOrdered = Boolean(state && organizationEntriesValid && allShopEntriesValid);
  return {
    state,
    stateRows,
    organizationEntries,
    shopEntries,
    orderedPersonIds: isOrdered ? organizationEntryPersonIds : fallbackPersonIds,
    isOrdered,
    repairable,
  };
}

async function createOrderFingerprint(args: {
  organizationId: Id<"organizations">;
  stateRevision: number;
  orderedPersonIds: readonly Id<"organizationPeople">[];
  source: OrganizationStaffOrderSourceSnapshot;
}) {
  return await sha256Hex(
    JSON.stringify({
      version: 1,
      organizationId: args.organizationId,
      stateRevision: args.stateRevision,
      orderedPersonIds: args.orderedPersonIds,
      activePeople: args.source.people.map((person) => person._id).sort(),
      activeShops: args.source.activeShops
        .map(({ shop, staffs }) => ({
          shopId: shop._id,
          staffs: staffs
            .map(({ staff, organizationPersonId }) => ({ staffId: staff._id, organizationPersonId }))
            .sort((left, right) => left.staffId.localeCompare(right.staffId)),
        }))
        .sort((left, right) => left.shopId.localeCompare(right.shopId)),
    }),
  );
}

export async function getOrganizationStaffOrderEditorSnapshot(
  ctx: ReadCtx,
  organizationId: Id<"organizations">,
): Promise<OrganizationStaffOrderEditorSnapshot> {
  const sourceResult = await getOrganizationStaffOrderSourceSnapshot(ctx, organizationId);
  if (sourceResult.availability !== "ready") {
    const orderedPersonIds = sourceResult.people
      .slice(0, ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT)
      .map((person) => person._id);
    return {
      availability: sourceResult.availability,
      source: null,
      orderedPersonIds,
      orderFingerprint: await sha256Hex(
        JSON.stringify({ version: 1, organizationId, availability: sourceResult.availability, orderedPersonIds }),
      ),
      resolution: null,
    };
  }
  const resolution = await readOrganizationOrderResolution(ctx, organizationId, sourceResult.snapshot);
  const availability = resolution.repairable ? "ready" : "legacyDataIncomplete";
  return {
    availability,
    source: sourceResult.snapshot,
    orderedPersonIds: resolution.orderedPersonIds,
    orderFingerprint: await createOrderFingerprint({
      organizationId,
      stateRevision: resolution.state?.revision ?? 0,
      orderedPersonIds: resolution.orderedPersonIds,
      source: sourceResult.snapshot,
    }),
    resolution,
  };
}

/** scope queryだけがordered cursor familyを選ぶ。完全性が崩れた場合はlegacyへ戻す。 */
export async function getOrganizationStaffOrderScope(
  ctx: ReadCtx,
  args: { organizationId: Id<"organizations">; shopId?: Id<"shops"> },
): Promise<OrganizationStaffOrderScope> {
  const [stateRows, people, organizationEntries] = await Promise.all([
    ctx.db
      .query("organizationStaffOrderStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(2),
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .take(BOUNDED_PEOPLE_READ),
    ctx.db
      .query("organizationStaffOrderEntries")
      .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", args.organizationId))
      .take(BOUNDED_PEOPLE_READ),
  ]);
  const state = stateRows.length === 1 && isValidRevision(stateRows[0].revision) ? stateRows[0] : null;
  if (!state || people.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT) return { mode: "legacy" };
  const personIds = people.map((person) => person._id);
  const entryPersonIds = organizationEntries.map((entry) => entry.organizationPersonId);
  const displayOrders = organizationEntries.map((entry) => entry.displayOrder);
  if (
    organizationEntries.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT ||
    !idsMatch(personIds, entryPersonIds) ||
    !hasUniqueValues(entryPersonIds) ||
    !hasUniqueValues(displayOrders.map(String)) ||
    organizationEntries.some(
      (entry) => entry.organizationId !== args.organizationId || !isValidDisplayOrder(entry.displayOrder),
    )
  ) {
    return { mode: "legacy" };
  }
  if (!args.shopId) return { mode: "ordered", revision: state.revision };

  const shop = await ctx.db.get(args.shopId);
  if (
    !shop ||
    shop.isDeleted ||
    shop.organizationId !== args.organizationId ||
    organizationShopOperatingStatus(shop.operatingStatus) !== "active"
  ) {
    return { mode: "legacy" };
  }
  const [staffs, shopEntries] = await Promise.all([
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .take(BOUNDED_PEOPLE_READ),
    ctx.db
      .query("shopStaffOrderEntries")
      .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shop._id))
      .take(BOUNDED_PEOPLE_READ),
  ]);
  if (
    staffs.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT ||
    shopEntries.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT
  ) {
    return { mode: "legacy" };
  }
  const activePersonIds = new Set(personIds);
  const canonicalStaffs = staffs.every(
    (staff) =>
      staff.organizationId === args.organizationId &&
      staff.organizationPersonId !== undefined &&
      activePersonIds.has(staff.organizationPersonId),
  );
  const staffIds = staffs.map((staff) => staff._id);
  const entryStaffIds = shopEntries.map((entry) => entry.staffId);
  const staffById = new Map(staffs.map((staff) => [staff._id, staff]));
  const rankByPersonId = new Map(
    organizationEntries.map((entry) => [entry.organizationPersonId, entry.displayOrder] as const),
  );
  const shopEntriesValid =
    idsMatch(staffIds, entryStaffIds) &&
    hasUniqueValues(entryStaffIds) &&
    hasUniqueValues(shopEntries.map((entry) => entry.organizationPersonId)) &&
    hasUniqueValues(shopEntries.map((entry) => String(entry.displayOrder))) &&
    shopEntries.every((entry) => {
      const staff = staffById.get(entry.staffId);
      return (
        entry.organizationId === args.organizationId &&
        entry.shopId === shop._id &&
        isValidDisplayOrder(entry.displayOrder) &&
        staff?.organizationPersonId === entry.organizationPersonId &&
        rankByPersonId.get(entry.organizationPersonId) === entry.displayOrder
      );
    });
  return canonicalStaffs && shopEntriesValid ? { mode: "ordered", revision: state.revision } : { mode: "legacy" };
}

async function deleteExistingOrderRows(ctx: WriteCtx, resolution: OrganizationOrderResolution) {
  for (const entry of resolution.organizationEntries) await ctx.db.delete(entry._id);
  for (const entries of resolution.shopEntries.values()) {
    for (const entry of entries) await ctx.db.delete(entry._id);
  }
}

async function writeOrderRows(
  ctx: WriteCtx,
  args: {
    organizationId: Id<"organizations">;
    source: OrganizationStaffOrderSourceSnapshot;
    orderedPersonIds: readonly Id<"organizationPeople">[];
    resolution: OrganizationOrderResolution;
    now: number;
  },
) {
  await deleteExistingOrderRows(ctx, args.resolution);
  const displayOrderByPersonId = new Map(args.orderedPersonIds.map((personId, index) => [personId, index] as const));
  for (const [displayOrder, organizationPersonId] of args.orderedPersonIds.entries()) {
    await ctx.db.insert("organizationStaffOrderEntries", {
      organizationId: args.organizationId,
      organizationPersonId,
      displayOrder,
    });
  }
  for (const { shop, staffs } of args.source.activeShops) {
    const orderedStaffs = [...staffs].sort(
      (left, right) =>
        (displayOrderByPersonId.get(left.organizationPersonId) ?? Number.MAX_SAFE_INTEGER) -
        (displayOrderByPersonId.get(right.organizationPersonId) ?? Number.MAX_SAFE_INTEGER),
    );
    for (const { staff, organizationPersonId } of orderedStaffs) {
      const displayOrder = displayOrderByPersonId.get(organizationPersonId);
      if (displayOrder === undefined) throw new Error("organization staff order source mismatch");
      await ctx.db.insert("shopStaffOrderEntries", {
        organizationId: args.organizationId,
        shopId: shop._id,
        staffId: staff._id,
        organizationPersonId,
        displayOrder,
      });
    }
  }

  const existingRevisions = args.resolution.stateRows
    .map((state) => state.revision)
    .filter((revision) => isValidRevision(revision));
  const previousRevision = existingRevisions.length > 0 ? Math.max(...existingRevisions) : 0;
  if (previousRevision >= Number.MAX_SAFE_INTEGER) throw new Error("organization staff order revision overflow");
  const revision = previousRevision + 1;
  const activatedAt = args.resolution.stateRows[0]?.activatedAt ?? args.now;
  for (const state of args.resolution.stateRows) await ctx.db.delete(state._id);
  await ctx.db.insert("organizationStaffOrderStates", {
    organizationId: args.organizationId,
    revision,
    activatedAt,
    updatedAt: args.now,
  });
  return revision;
}

export async function saveOrganizationStaffOrderSnapshot(
  ctx: WriteCtx,
  args: {
    organizationId: Id<"organizations">;
    orderedPersonIds: readonly Id<"organizationPeople">[];
    expectedOrderFingerprint: string;
  },
) {
  if (!/^[0-9a-f]{64}$/.test(args.expectedOrderFingerprint)) {
    throw new ConvexError("並び順の確認情報が不正です");
  }
  const current = await getOrganizationStaffOrderEditorSnapshot(ctx, args.organizationId);
  if (current.availability !== "ready" || !current.source || !current.resolution) {
    throw new ConvexError("スタッフの並び順を保存できる状態ではありません");
  }
  if (current.orderFingerprint !== args.expectedOrderFingerprint) {
    throw new ConvexError(STALE_ORGANIZATION_STAFF_ORDER_ERROR);
  }
  const currentPersonIds = current.source.people.map((person) => person._id);
  if (
    args.orderedPersonIds.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT ||
    !hasUniqueValues(args.orderedPersonIds) ||
    !idsMatch(args.orderedPersonIds, currentPersonIds)
  ) {
    throw new ConvexError("並び順のスタッフが現在の組織人物と一致しません");
  }
  const changed =
    !current.resolution.isOrdered ||
    current.orderedPersonIds.some((personId, index) => personId !== args.orderedPersonIds[index]);
  if (!changed && current.resolution.state) {
    return {
      changed: false,
      revision: current.resolution.state.revision,
      orderFingerprint: current.orderFingerprint,
    };
  }
  const revision = await writeOrderRows(ctx, {
    organizationId: args.organizationId,
    source: current.source,
    orderedPersonIds: args.orderedPersonIds,
    resolution: current.resolution,
    now: Date.now(),
  });
  return {
    changed: true,
    revision,
    orderFingerprint: await createOrderFingerprint({
      organizationId: args.organizationId,
      stateRevision: revision,
      orderedPersonIds: args.orderedPersonIds,
      source: current.source,
    }),
  };
}

export async function safelyDeactivateOrganizationStaffOrder(
  ctx: WriteCtx,
  args: { organizationId: Id<"organizations"> },
) {
  const states = await ctx.db
    .query("organizationStaffOrderStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .take(BOUNDED_STATE_READ);
  for (const state of states) await ctx.db.delete(state._id);
  // 想定外にstateが上限まで重複している場合はinvalid tombstoneを残し、
  // 未削除rowが1件だけになってもorderedへ戻らないようfail closedにする。
  if (states.length === BOUNDED_STATE_READ) {
    const now = Date.now();
    await ctx.db.insert("organizationStaffOrderStates", {
      organizationId: args.organizationId,
      revision: 0,
      activatedAt: now,
      updatedAt: now,
    });
  }
}

export type StaffOrderSyncResult = "inactive" | "synced" | "deactivated";

/** source write後に呼び、既存順位を保ったまま新規・再有効人物を末尾へ追加する。 */
export async function syncActivatedOrganizationStaffOrder(
  ctx: WriteCtx,
  args: { organizationId: Id<"organizations"> },
): Promise<StaffOrderSyncResult> {
  const stateRows = await ctx.db
    .query("organizationStaffOrderStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .take(2);
  if (stateRows.length === 0) return "inactive";
  if (stateRows.length !== 1 || !isValidRevision(stateRows[0].revision)) {
    await safelyDeactivateOrganizationStaffOrder(ctx, args);
    return "deactivated";
  }
  if (stateRows[0].revision >= Number.MAX_SAFE_INTEGER) {
    await safelyDeactivateOrganizationStaffOrder(ctx, args);
    return "deactivated";
  }
  const sourceResult = await getOrganizationStaffOrderSourceSnapshot(ctx, args.organizationId);
  if (sourceResult.availability !== "ready") {
    await safelyDeactivateOrganizationStaffOrder(ctx, args);
    return "deactivated";
  }
  const resolution = await readOrganizationOrderResolution(ctx, args.organizationId, sourceResult.snapshot);
  if (!resolution.repairable) {
    await safelyDeactivateOrganizationStaffOrder(ctx, args);
    return "deactivated";
  }

  const activePersonIds = new Set(sourceResult.snapshot.people.map((person) => person._id));
  const preserved: Id<"organizationPeople">[] = [];
  const seen = new Set<Id<"organizationPeople">>();
  for (const entry of resolution.organizationEntries) {
    if (!isValidDisplayOrder(entry.displayOrder) || seen.has(entry.organizationPersonId)) {
      await safelyDeactivateOrganizationStaffOrder(ctx, args);
      return "deactivated";
    }
    const person = await ctx.db.get(entry.organizationPersonId);
    if (!person || person.organizationId !== args.organizationId) {
      await safelyDeactivateOrganizationStaffOrder(ctx, args);
      return "deactivated";
    }
    seen.add(entry.organizationPersonId);
    if (activePersonIds.has(entry.organizationPersonId)) preserved.push(entry.organizationPersonId);
  }
  for (const person of sourceResult.snapshot.people) {
    if (!seen.has(person._id)) preserved.push(person._id);
  }
  await writeOrderRows(ctx, {
    organizationId: args.organizationId,
    source: sourceResult.snapshot,
    orderedPersonIds: preserved,
    resolution,
    now: Date.now(),
  });
  return "synced";
}
