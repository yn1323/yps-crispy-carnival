import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("appOrganization/detailQueries.getUserDetail", () => {
  it("URL組織のcanonical所属と同じ組織の人物だけを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "app_detail_actor",
        shopName: "対象店舗",
        plan: "standard",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "app_detail_other",
        shopName: "別組織店舗",
        plan: "standard",
      });
      return { actor, other };
    });
    const actor = t.withIdentity({ subject: "app_detail_actor" });
    const now = Date.now();

    await expect(
      actor.query(api.appOrganization.detailQueries.getUserDetail, {
        organizationId: ids.actor.organizationId,
        personId: ids.actor.personId,
        now,
      }),
    ).resolves.toMatchObject({
      person: { id: ids.actor.personId },
      line: { actionShopId: ids.actor.shopId },
    });
    await expect(
      actor.query(api.appOrganization.detailQueries.getUserDetail, {
        organizationId: ids.actor.organizationId,
        personId: ids.other.personId,
        now,
      }),
    ).resolves.toBeNull();
  });

  it("別組織をexpected organizationに指定したreadを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "app_detail_scope_actor", plan: "standard" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "app_detail_scope_other", plan: "standard" });
      return { actor, other };
    });

    await expect(
      t.withIdentity({ subject: "app_detail_scope_actor" }).query(api.appOrganization.detailQueries.getUserDetail, {
        organizationId: ids.other.organizationId,
        personId: ids.other.personId,
        now: Date.now(),
      }),
    ).rejects.toThrow("Not found");
  });
});
