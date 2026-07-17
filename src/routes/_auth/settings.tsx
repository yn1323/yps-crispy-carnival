import { createFileRoute } from "@tanstack/react-router";
import { updateSettingsTabSearch } from "@/src/lib/authenticatedSearch";
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
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  return (
    <OrganizationSettingsPage
      defaultTab={tab}
      onTabChange={(nextTab) =>
        void navigate({
          replace: true,
          search: (previous) => updateSettingsTabSearch(previous, nextTab),
        })
      }
    />
  );
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return value === "people" || value === "shops" || value === "billing";
}
