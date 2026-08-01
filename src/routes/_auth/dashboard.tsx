import { createFileRoute } from "@tanstack/react-router";
import { parseUserListSearch, updateUserListSearch } from "@/src/lib/userListSearch";
import { DashboardPage } from "@/src/pages/dashboard";
import { buildDashboardPageHead } from "@/src/pages/dashboard/meta";

type DashboardSearch = { users?: number; focus?: string };

export const Route = createFileRoute("/_auth/dashboard")({
  head: buildDashboardPageHead,
  validateSearch: validateDashboardSearch,
  component: DashboardRoute,
});

export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return parseUserListSearch(search);
}

function DashboardRoute() {
  const navigate = Route.useNavigate();
  const { users, focus } = Route.useSearch();

  return (
    <DashboardPage
      visibleUserCount={users}
      focusedPersonId={focus}
      onVisibleUserCountChange={(count) =>
        void navigate({
          replace: true,
          search: (previous) => updateUserListSearch(previous, { count, focus: undefined }),
        })
      }
    />
  );
}
