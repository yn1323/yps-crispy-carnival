import { resetCurrentManagerScenarioData, seedManagerScenario } from "./scenarioSeeds";

export type ManagerSettingsScenarioSeed = {
  shopId: string;
  organizationName: string;
  currentManagerName: string;
  candidateName: string;
  candidateEmail: string;
};

export function seedManagerSettingsScenario(): ManagerSettingsScenarioSeed {
  return seedManagerScenario<ManagerSettingsScenarioSeed>("testing:seedManagerSettingsScenario");
}

export async function resetManagerSettingsScenario() {
  return await resetCurrentManagerScenarioData();
}
