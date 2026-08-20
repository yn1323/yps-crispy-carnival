import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/manage")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/manage", search, replace: true });
  },
});
