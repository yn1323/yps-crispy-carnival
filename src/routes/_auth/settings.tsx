import { createFileRoute } from "@tanstack/react-router";
import { OrganizationSettingsPage } from "@/src/pages/settings";
import { buildOrganizationSettingsPageHead } from "@/src/pages/settings/meta";

type SettingsTab = "people" | "shops" | "billing";
type SettingsSearch = { tab?: SettingsTab };

export const Route = createFileRoute("/_auth/settings")({
  head: buildOrganizationSettingsPageHead,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = isSettingsTab(search.tab) ? search.tab : undefined;
    return tab ? { tab } : {};
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useSearch();
  return <OrganizationSettingsPage defaultTab={tab} />;
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return value === "people" || value === "shops" || value === "billing";
}
