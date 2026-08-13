import {
  resetCurrentManagerScenarioData,
  seedManagerScenario,
  seedSingleActorMultiOrganizationScenario,
} from "./scenarioSeeds";

export type OrganizationCreationScenarioSeed = {
  organizationId: string;
  shopId: string;
  shopName: string;
  organizationName: string;
};

export function seedOrganizationCreationScenario(): OrganizationCreationScenarioSeed {
  const organizationName = "E2E 組織作成元グループ";
  const result = seedManagerScenario<Omit<OrganizationCreationScenarioSeed, "organizationName">>(
    "testing:seedShopLifecycleScenario",
    {
      organizationName,
      shopName: "E2E 組織作成元店舗",
    },
  );
  return { ...result, organizationName };
}

export function seedOrganizationDeletionScenario() {
  return seedSingleActorMultiOrganizationScenario({
    targetOrganizationName: "E2E 削除対象グループ",
    targetShopName: "E2E 削除対象店舗",
    actorBName: "E2E 削除対象スタッフ",
    alternateOrganizationName: "E2E 継続利用グループ",
    alternateShopName: "E2E 継続利用店舗",
  });
}

export async function resetOrganizationLifecycleScenario() {
  return await resetCurrentManagerScenarioData();
}
