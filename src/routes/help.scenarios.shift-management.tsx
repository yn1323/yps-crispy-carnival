import { createFileRoute } from "@tanstack/react-router";
import { HelpShiftManagementScenarioPage } from "@/src/pages/help/scenario";
import { buildHelpShiftManagementScenarioPageHead } from "@/src/pages/help/scenarioMeta";

export const Route = createFileRoute("/help/scenarios/shift-management")({
  head: buildHelpShiftManagementScenarioPageHead,
  component: HelpShiftManagementScenarioPage,
});
