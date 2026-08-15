import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app")({
  validateSearch: validateAppOrganizationRouteSearch,
  staticData: { appShell: { mode: "navigation", activeKey: "home" } },
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard", search, replace: true });
  },
});
