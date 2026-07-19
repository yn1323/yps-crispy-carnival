import { createFileRoute } from "@tanstack/react-router";
import { updateSettingsTabSearch } from "@/src/lib/authenticatedSearch";
import { parseUserListSearch, updateUserListSearch } from "@/src/lib/userListSearch";
import { OrganizationSettingsPage } from "@/src/pages/settings";
import { buildOrganizationSettingsPageHead } from "@/src/pages/settings/meta";

type SettingsTab = "people" | "shops" | "billing" | "settings";
type SettingsSearch = { tab?: SettingsTab; users?: number; focus?: string };

export const Route = createFileRoute("/_auth/settings")({
  head: buildOrganizationSettingsPageHead,
  validateSearch: validateSettingsSearch,
  component: SettingsRoute,
});

export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  const tab = isSettingsTab(search.tab) ? search.tab : undefined;
  return { ...(tab ? { tab } : {}), ...parseUserListSearch(search) };
}

function SettingsRoute() {
  const navigate = Route.useNavigate();
  const { tab, users, focus } = Route.useSearch();
  return (
    <OrganizationSettingsPage
      defaultTab={tab}
      visibleUserCount={users}
      focusedPersonId={focus}
      onTabChange={(nextTab) =>
        void navigate({
          replace: true,
          search: (previous) => updateSettingsTabSearch(previous, nextTab),
        })
      }
      onVisibleUserCountChange={(count) =>
        void navigate({
          replace: true,
          search: (previous) => updateUserListSearch(previous, { count, focus: undefined }),
        })
      }
    />
  );
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return value === "people" || value === "shops" || value === "billing" || value === "settings";
}
