import { createFileRoute } from "@tanstack/react-router";
import { HelpOrganizationStructurePage } from "@/src/pages/help/organizationStructure";
import { buildHelpOrganizationStructurePageHead } from "@/src/pages/help/organizationStructureMeta";

export const Route = createFileRoute("/help/basics/organization-structure")({
  head: buildHelpOrganizationStructurePageHead,
  component: HelpOrganizationStructurePage,
});
