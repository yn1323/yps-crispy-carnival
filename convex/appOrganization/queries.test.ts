import type { FunctionReturnType, PaginationOptions, PaginationResult } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedLegacyManagerShop, seedLegacyShopMembership, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

type OrganizationContext = FunctionReturnType<
  typeof api.appOrganization.queries.listMyOrganizationContexts
>["page"][number];
type ActiveShopContext = FunctionReturnType<
  typeof api.appOrganization.queries.listOrganizationActiveShops
>["page"][number];

const NOW = Date.parse("2026-08-14T00:00:00Z");

async function seedOrganizationForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    name: string;
    memberStatus?: "active" | "readOnly" | "removed";
    personStatus?: "active" | "removed";
    organizationDeleted?: boolean;
    withMembership?: boolean;
    withActiveShop?: boolean;
  },
) {
  const user = await ctx.db.get(args.userId);
  if (!user) throw new Error("test user not found");

  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: args.userId,
    name: args.name,
    billingEmail: user.email,
    billingEmailNormalized: user.emailNormalized ?? user.email.trim().toLowerCase(),
    isDeleted: args.organizationDeleted ?? false,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId: args.userId,
    name: user.name,
    email: user.email,
    emailNormalized: user.emailNormalized ?? user.email.trim().toLowerCase(),
    status: args.personStatus ?? "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const memberId =
    args.withMembership === false
      ? null
      : await ctx.db.insert("organizationMembers", {
          organizationId,
          personId,
          userId: args.userId,
          status: args.memberStatus ?? "active",
          createdAt: NOW,
          updatedAt: NOW,
        });
  const shopId = args.withActiveShop
    ? await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: `${args.name}店舗`,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      })
    : null;
  return { organizationId, personId, memberId, shopId };
}

function firstPage(numItems = 20): PaginationOptions {
  return { numItems, cursor: null };
}

describe("appOrganization organization context queries", () => {
  it("未認証・未登録・削除済みuserには所属組織を返さない", async () => {
    const t = convexTest(schema, modules);
    const organizationId = await t.run(async (ctx) => {
      const other = await seedOrganizationManagerShop(ctx, { subject: "organization_context_other" });
      const deletedUserId = await seedUser(ctx, "organization_context_deleted_user");
      await ctx.db.patch(deletedUserId, { isDeleted: true });
      return other.organizationId;
    });

    await expect(
      t.query(api.appOrganization.queries.listMyOrganizationContexts, { paginationOpts: firstPage() }),
    ).resolves.toEqual({
      page: [],
      isDone: true,
      continueCursor: "",
    });
    await expect(
      t
        .withIdentity({ subject: "organization_context_unregistered" })
        .query(api.appOrganization.queries.listMyOrganizationContexts, {
          paginationOpts: firstPage(),
        }),
    ).resolves.toMatchObject({ page: [], isDone: true });
    await expect(
      t
        .withIdentity({ subject: "organization_context_deleted_user" })
        .query(api.appOrganization.queries.listMyOrganizationContexts, {
          paginationOpts: firstPage(),
        }),
    ).resolves.toEqual({ page: [], isDone: true, continueCursor: "" });
    await expect(t.query(api.appOrganization.queries.getOrganizationContext, { organizationId })).resolves.toBeNull();
  });

  it("activeとreadOnlyのcanonical所属を最小DTOで返し、一覧の未取得pageにある組織も直接開ける", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_context_multi";
    const ids = await t.run(async (ctx) => {
      const active = await seedOrganizationManagerShop(ctx, { subject, shopName: "Active" });
      await ctx.db.patch(active.organizationId, { name: "Active組織" });
      const readOnly = await seedOrganizationForUser(ctx, {
        userId: active.userId,
        name: "ReadOnly組織",
        memberStatus: "readOnly",
      });
      return { active, readOnly };
    });
    const actor = t.withIdentity({ subject });

    const first = await actor.query(api.appOrganization.queries.listMyOrganizationContexts, {
      paginationOpts: firstPage(1),
    });
    expect(first.page).toHaveLength(1);
    expect(first.isDone).toBe(false);
    expect(Object.keys(first.page[0] ?? {}).sort()).toEqual(["memberStatus", "organizationId", "organizationName"]);

    const notFetchedOrganizationId =
      first.page[0]?.organizationId === ids.active.organizationId
        ? ids.readOnly.organizationId
        : ids.active.organizationId;
    await expect(
      actor.query(api.appOrganization.queries.getOrganizationContext, {
        organizationId: notFetchedOrganizationId,
      }),
    ).resolves.toEqual(
      notFetchedOrganizationId === ids.active.organizationId
        ? {
            organizationId: ids.active.organizationId,
            organizationName: "Active組織",
            memberStatus: "active",
          }
        : {
            organizationId: ids.readOnly.organizationId,
            organizationName: "ReadOnly組織",
            memberStatus: "readOnly",
          },
    );

    const second = await actor.query(api.appOrganization.queries.listMyOrganizationContexts, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(
      [...first.page, ...second.page].sort((a, b) => a.organizationName.localeCompare(b.organizationName)),
    ).toEqual([
      {
        organizationId: ids.active.organizationId,
        organizationName: "Active組織",
        memberStatus: "active",
      },
      {
        organizationId: ids.readOnly.organizationId,
        organizationName: "ReadOnly組織",
        memberStatus: "readOnly",
      },
    ]);
  });

  it("removed所属やlegacy shopMembersだけでは組織authorityを得られない", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_context_removed";
    const removed = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, membershipDeleted: true });
      await seedLegacyShopMembership(ctx, { userId: base.userId, shopId: base.shopId });
      return base;
    });
    const removedActor = t.withIdentity({ subject });

    await expect(
      removedActor.query(api.appOrganization.queries.listMyOrganizationContexts, { paginationOpts: firstPage() }),
    ).resolves.toMatchObject({ page: [], isDone: true });
    await expect(
      removedActor.query(api.appOrganization.queries.getOrganizationContext, {
        organizationId: removed.organizationId,
      }),
    ).resolves.toBeNull();

    await expect(
      removedActor.query(api.appOrganization.queries.getOrganizationContext, {
        organizationId: "not-an-organization-id" as Id<"organizations">,
      }),
    ).rejects.toThrow();

    const legacy = convexTest(schema, modules);
    await legacy.run(async (ctx) => {
      await seedLegacyManagerShop(ctx, { subject: "organization_context_legacy_only" });
    });
    await expect(
      legacy
        .withIdentity({ subject: "organization_context_legacy_only" })
        .query(api.appOrganization.queries.listMyOrganizationContexts, {
          paginationOpts: firstPage(),
        }),
    ).resolves.toMatchObject({ page: [], isDone: true });
  });

  it("canonical不整合で空の中間pageになってもcursorから後続組織へ到達できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_context_invalid_intermediate_page";
    const ids = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, subject);
      const first = await seedOrganizationForUser(ctx, { userId, name: "候補A" });
      const second = await seedOrganizationForUser(ctx, { userId, name: "候補B" });
      return { first, second };
    });
    const actor = t.withIdentity({ subject });
    const before = await actor.query(api.appOrganization.queries.listMyOrganizationContexts, {
      paginationOpts: firstPage(1),
    });
    const firstOrganizationId = before.page[0]?.organizationId;
    if (!firstOrganizationId) throw new Error("first organization not found");

    await t.run(async (ctx) => {
      const firstPersonId = firstOrganizationId === ids.first.organizationId ? ids.first.personId : ids.second.personId;
      await ctx.db.patch(firstPersonId, { status: "removed" });
    });

    const emptyIntermediate = await actor.query(api.appOrganization.queries.listMyOrganizationContexts, {
      paginationOpts: firstPage(1),
    });
    expect(emptyIntermediate).toMatchObject({ page: [], isDone: false });

    const next = await actor.query(api.appOrganization.queries.listMyOrganizationContexts, {
      paginationOpts: { numItems: 1, cursor: emptyIntermediate.continueCursor },
    });
    expect(next.page).toHaveLength(1);
    expect(next.page[0]?.organizationId).not.toBe(firstOrganizationId);
    expect(next.isDone).toBe(true);
  });

  it("別組織・削除済み組織・人物と所属の不整合をfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "organization_context_actor" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "organization_context_other_actor" });
      const deleted = await seedOrganizationForUser(ctx, {
        userId: actor.userId,
        name: "削除済み組織",
        organizationDeleted: true,
      });
      const removedPerson = await seedOrganizationForUser(ctx, {
        userId: actor.userId,
        name: "removed人物組織",
        personStatus: "removed",
      });
      const duplicatePerson = await seedOrganizationForUser(ctx, {
        userId: actor.userId,
        name: "重複人物組織",
      });
      const duplicateMember = await seedOrganizationForUser(ctx, {
        userId: actor.userId,
        name: "重複所属組織",
      });
      if (!duplicateMember.memberId) throw new Error("test member not found");
      await ctx.db.insert("organizationMembers", {
        organizationId: duplicateMember.organizationId,
        personId: duplicateMember.personId,
        userId: actor.userId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const sharedPerson = await seedOrganizationForUser(ctx, {
        userId: actor.userId,
        name: "人物所属衝突組織",
      });
      const collisionUserId = await seedUser(ctx, "organization_context_person_member_collision");
      await ctx.db.insert("organizationMembers", {
        organizationId: sharedPerson.organizationId,
        personId: sharedPerson.personId,
        userId: collisionUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const user = await ctx.db.get(actor.userId);
      if (!user) throw new Error("test user not found");
      await ctx.db.insert("organizationPeople", {
        organizationId: duplicatePerson.organizationId,
        userId: actor.userId,
        name: user.name,
        email: user.email,
        emailNormalized: user.emailNormalized ?? user.email.trim().toLowerCase(),
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { actor, other, deleted, removedPerson, duplicatePerson, duplicateMember, sharedPerson };
    });
    const actor = t.withIdentity({ subject: "organization_context_actor" });

    for (const organizationId of [
      ids.other.organizationId,
      ids.deleted.organizationId,
      ids.removedPerson.organizationId,
      ids.duplicatePerson.organizationId,
      ids.duplicateMember.organizationId,
      ids.sharedPerson.organizationId,
    ]) {
      await expect(
        actor.query(api.appOrganization.queries.getOrganizationContext, { organizationId }),
      ).resolves.toBeNull();
    }

    const contexts: OrganizationContext[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const page: PaginationResult<OrganizationContext> = await actor.query(
        api.appOrganization.queries.listMyOrganizationContexts,
        { paginationOpts: { numItems: 1, cursor } },
      );
      contexts.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(contexts).toEqual([
      {
        organizationId: ids.actor.organizationId,
        organizationName: "テスト店舗事業者",
        memberStatus: "active",
      },
    ]);
  });

  it("activeかつ非削除の同一組織店舗だけをcursor paginationで最後まで返す", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_context_shops";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, shopName: "店舗A" });
      const insertShop = async (
        name: string,
        operatingStatus: "active" | "archived" | "planSuspended",
        isDeleted = false,
      ) =>
        await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus,
          name,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted,
        });
      const activeB = await insertShop("店舗B", "active");
      const activeC = await insertShop("店舗C", "active");
      const activeD = await insertShop("店舗D", "active");
      const activeE = await insertShop("店舗E", "active");
      const activeF = await insertShop("店舗F", "active");
      const activeG = await insertShop("店舗G", "active");
      const archived = await insertShop("アーカイブ店舗", "archived");
      const suspended = await insertShop("停止店舗", "planSuspended");
      const deleted = await insertShop("削除済み店舗", "active", true);
      const missingOperatingStatus = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        name: "状態未移行店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "organization_context_shops_other",
        shopName: "別組織店舗",
      });
      return {
        base,
        activeB,
        activeC,
        activeD,
        activeE,
        activeF,
        activeG,
        archived,
        suspended,
        deleted,
        missingOperatingStatus,
        other,
      };
    });
    const actor = t.withIdentity({ subject });
    const found: ActiveShopContext[] = [];
    let cursor: string | null = null;
    let firstIsDone = true;

    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const result: PaginationResult<ActiveShopContext> = await actor.query(
        api.appOrganization.queries.listOrganizationActiveShops,
        {
          organizationId: ids.base.organizationId,
          paginationOpts: { numItems: 1, cursor },
        },
      );
      if (pageNumber === 0) firstIsDone = result.isDone;
      found.push(...result.page);
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    expect(firstIsDone).toBe(false);
    expect(found).toEqual([
      { shopId: ids.base.shopId, shopName: "店舗A" },
      { shopId: ids.activeB, shopName: "店舗B" },
      { shopId: ids.activeC, shopName: "店舗C" },
      { shopId: ids.activeD, shopName: "店舗D" },
      { shopId: ids.activeE, shopName: "店舗E" },
      { shopId: ids.activeF, shopName: "店舗F" },
      { shopId: ids.activeG, shopName: "店舗G" },
    ]);
    expect(
      found.some((shop) =>
        [ids.archived, ids.suspended, ids.deleted, ids.missingOperatingStatus, ids.other.shopId].includes(shop.shopId),
      ),
    ).toBe(false);
    expect(Object.keys(found[0] ?? {}).sort()).toEqual(["shopId", "shopName"]);
    await expect(
      t
        .withIdentity({ subject: "organization_context_shops_other" })
        .query(api.appOrganization.queries.listOrganizationActiveShops, {
          organizationId: ids.base.organizationId,
          paginationOpts: firstPage(),
        }),
    ).rejects.toThrow("Not found");
  });

  it("readOnly所属もactive店舗を参照でき、危険なpage sizeは拒否する", async () => {
    const t = convexTest(schema, modules);
    const subject = "organization_context_read_only_shops";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject });
      await ctx.db.patch(base.memberId, { status: "readOnly" });
      return base;
    });
    const actor = t.withIdentity({ subject });

    await expect(
      actor.query(api.appOrganization.queries.listOrganizationActiveShops, {
        organizationId: ids.organizationId,
        paginationOpts: firstPage(),
      }),
    ).resolves.toMatchObject({ page: [{ shopId: ids.shopId, shopName: "テスト店舗" }], isDone: true });
    await expect(
      actor.query(api.appOrganization.queries.listMyOrganizationContexts, { paginationOpts: firstPage(51) }),
    ).rejects.toThrow("numItems must be between 1 and 50");
    await expect(
      actor.query(api.appOrganization.queries.listOrganizationActiveShops, {
        organizationId: ids.organizationId,
        paginationOpts: { ...firstPage(), maximumRowsRead: 0 },
      }),
    ).rejects.toThrow("maximumRowsRead must be a positive integer");
  });

  it("active店舗ごとの募集を一つのcursor familyで返し、契約上限を超えた店舗にも到達できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "app_organization_recruitment_sections";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, shopName: "店舗A", complimentary: true });
      const activeShopIds = [base.shopId];
      for (const name of ["店舗B", "店舗C", "店舗D", "店舗E", "店舗F", "店舗G"]) {
        activeShopIds.push(
          await ctx.db.insert("shops", {
            organizationId: base.organizationId,
            operatingStatus: "active",
            name,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            regularClosedDays: [],
            isDeleted: false,
          }),
        );
      }
      const archivedShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "archived",
        name: "休止店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      for (const [index, shopId] of activeShopIds.entries()) {
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: `2026-08-${20 + index}`,
          periodEnd: `2026-08-${21 + index}`,
          deadline: "2026-08-18",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        // recruitmentStatsがないrolling期間でも、各店舗pageのlegacy fallback workは固定上限で止まる。
        for (let staffIndex = 0; staffIndex < 3; staffIndex += 1) {
          const email = `section-${index}-${staffIndex}@example.com`;
          const staffId = await ctx.db.insert("staffs", {
            organizationId: base.organizationId,
            shopId,
            name: `スタッフ${index}-${staffIndex}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
          await ctx.db.insert("shiftSubmissions", {
            recruitmentId,
            staffId,
            firstSubmittedAt: NOW + staffIndex,
            submittedAt: NOW + staffIndex,
          });
        }
      }
      return { ...base, activeShopIds, archivedShopId };
    });
    const actor = t.withIdentity({ subject });
    const sections: FunctionReturnType<typeof api.appOrganization.queries.listOrganizationRecruitments>["page"] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;

    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page: PaginationResult<(typeof sections)[number]> = await actor.query(
        api.appOrganization.queries.listOrganizationRecruitments,
        {
          organizationId: ids.organizationId,
          paginationOpts: { numItems: 1, cursor },
        },
      );
      pageSizes.push(page.page.length);
      sections.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(sections.map((section) => section.shop.shopId)).toEqual(ids.activeShopIds);
    expect(sections.some((section) => section.shop.shopId === ids.archivedShopId)).toBe(false);
    expect(sections).toHaveLength(7);
    expect(pageSizes.every((size) => size <= 1)).toBe(true);
    expect(sections[0]).toMatchObject({
      shop: { shopName: "店舗A", operatingStatus: "active", regularClosedDays: [] },
      actions: { canCreate: true },
      hasPastRecruitments: false,
    });
    const recruitments = sections.flatMap((section) => section.currentGroups.flatMap((group) => group.recruitments));
    expect(recruitments).toHaveLength(7);
    for (const recruitment of recruitments) {
      expect(recruitment).toMatchObject({
        responseCount: 1,
        responseCountHasOverflow: true,
        totalStaffCount: 3,
      });
    }

    await expect(
      actor.query(api.appOrganization.queries.listOrganizationRecruitments, {
        organizationId: ids.organizationId,
        paginationOpts: firstPage(2),
      }),
    ).rejects.toThrow("numItems must be between 1 and 1");

    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly" }));
    const readOnly = await actor.query(api.appOrganization.queries.listOrganizationRecruitments, {
      organizationId: ids.organizationId,
      paginationOpts: firstPage(1),
    });
    expect(readOnly.page[0]?.actions).toEqual({
      canCreate: false,
      createDisabledReason: "閲覧のみの管理者は、募集を作成できません。",
    });
  });

  it("募集一覧endpointは未認証・他組織・removed所属・削除済み組織を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "app_organization_recruitment_boundary",
        complimentary: true,
      });
      await seedOrganizationManagerShop(ctx, {
        subject: "app_organization_recruitment_boundary_other",
        complimentary: true,
      });
      return base;
    });
    const args = {
      organizationId: ids.organizationId,
      paginationOpts: firstPage(1),
    };

    await expect(t.query(api.appOrganization.queries.listOrganizationRecruitments, args)).rejects.toThrow("Not found");
    await expect(
      t
        .withIdentity({ subject: "app_organization_recruitment_boundary_other" })
        .query(api.appOrganization.queries.listOrganizationRecruitments, args),
    ).rejects.toThrow("Not found");

    const actor = t.withIdentity({ subject: "app_organization_recruitment_boundary" });
    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "removed" }));
    await expect(actor.query(api.appOrganization.queries.listOrganizationRecruitments, args)).rejects.toThrow(
      "Not found",
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.memberId, { status: "active" });
      await ctx.db.patch(ids.organizationId, { isDeleted: true });
    });
    await expect(actor.query(api.appOrganization.queries.listOrganizationRecruitments, args)).rejects.toThrow(
      "Not found",
    );
  });

  it("提出率のスタッフscan上限到達を正確な分母として黙って切り捨てない", async () => {
    const t = convexTest(schema, modules);
    const subject = "app_organization_recruitment_staff_overflow";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject });
      for (let index = 0; index <= 1000; index += 1) {
        const email = `overflow-${index}@example.com`;
        await ctx.db.insert("staffs", {
          organizationId: base.organizationId,
          shopId: base.shopId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2026-08-20",
        periodEnd: "2026-08-21",
        deadline: "2026-08-18",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return base;
    });

    const result = await t.withIdentity({ subject }).query(api.appOrganization.queries.listOrganizationRecruitments, {
      organizationId: ids.organizationId,
      paginationOpts: firstPage(1),
    });
    const recruitment = result.page[0]?.currentGroups[0]?.recruitments[0];

    expect(recruitment).toMatchObject({
      totalStaffCount: 1000,
      totalStaffCountHasOverflow: true,
    });
  });

  it("人物一覧はfilterをpagination前に適用し、entitlement超過人物にも追加pageから到達できる", async () => {
    const t = convexTest(schema, modules);
    const subject = "app_organization_people_pages";
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject, shopName: "店舗A", plan: "free" });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "店舗B",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personIds: Id<"organizationPeople">[] = [];
      for (let index = 0; index < 12; index += 1) {
        const email = `person-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: NOW + index,
          updatedAt: NOW + index,
        });
        personIds.push(personId);
        await ctx.db.insert("staffs", {
          organizationId: base.organizationId,
          organizationPersonId: personId,
          shopId: base.shopId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
        if (index < 2) {
          await ctx.db.insert("staffs", {
            organizationId: base.organizationId,
            organizationPersonId: personId,
            shopId: secondShopId,
            name: `スタッフ${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
          if (index === 0) {
            await ctx.db.insert("staffs", {
              organizationId: base.organizationId,
              organizationPersonId: personId,
              shopId: secondShopId,
              name: `スタッフ${index} duplicate`,
              email,
              emailNormalized: email,
              isDeleted: false,
            });
          }
        }
      }
      const other = await seedOrganizationManagerShop(ctx, { subject: `${subject}_other` });
      return { ...base, secondShopId, personIds, other };
    });
    const actor = t.withIdentity({ subject });
    const people: FunctionReturnType<typeof api.appOrganization.queries.listOrganizationPeople>["page"] = [];
    let cursor: string | null = null;

    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page: PaginationResult<(typeof people)[number]> = await actor.query(
        api.appOrganization.queries.listOrganizationPeople,
        {
          organizationId: ids.organizationId,
          shopFilter: "all" as const,
          paginationOpts: { numItems: 4, cursor },
        },
      );
      people.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(people).toHaveLength(13);
    expect(new Set(people.map((person) => person.id)).size).toBe(13);
    expect(people.filter((person) => ids.personIds.includes(person.id))).toHaveLength(12);
    const filtered = await actor.query(api.appOrganization.queries.listOrganizationPeople, {
      organizationId: ids.organizationId,
      shopFilter: ids.secondShopId,
      paginationOpts: firstPage(),
    });
    expect(filtered.page.map((person) => person.id)).toEqual(ids.personIds.slice(0, 2));
    expect(filtered.page.every((person) => person.shopIds.includes(ids.secondShopId))).toBe(true);
    const oneAtATime: typeof filtered.page = [];
    let filteredCursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page: PaginationResult<(typeof oneAtATime)[number]> = await actor.query(
        api.appOrganization.queries.listOrganizationPeople,
        {
          organizationId: ids.organizationId,
          shopFilter: ids.secondShopId,
          paginationOpts: { numItems: 1, cursor: filteredCursor },
        },
      );
      oneAtATime.push(...page.page);
      if (page.isDone) break;
      filteredCursor = page.continueCursor;
    }
    expect(oneAtATime.map((person) => person.id)).toEqual(ids.personIds.slice(0, 2));

    await expect(
      actor.query(api.appOrganization.queries.listOrganizationPeople, {
        organizationId: ids.organizationId,
        shopFilter: ids.other.shopId,
        paginationOpts: firstPage(),
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.query(api.appOrganization.queries.getOrganizationPeopleSummary, {
        organizationId: ids.organizationId,
        shopFilter: ids.secondShopId,
      }),
    ).resolves.toEqual({
      totalCount: 13,
      totalCountHasOverflow: false,
      visibleCount: 2,
      visibleCountHasOverflow: false,
      maxPeople: 5,
      canAddStaff: true,
      canChangeStaffOrder: true,
      features: { managerInvitation: false },
    });

    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly" }));
    await expect(
      actor.query(api.appOrganization.queries.getOrganizationPeopleSummary, {
        organizationId: ids.organizationId,
        shopFilter: "all",
      }),
    ).resolves.toMatchObject({
      canAddStaff: false,
      addStaffDisabledReason: "閲覧のみの管理者は、スタッフを追加できません。",
      canChangeStaffOrder: false,
      changeStaffOrderDisabledReason: "閲覧のみの管理者は、スタッフの並び順を変更できません。",
    });
  });
});
