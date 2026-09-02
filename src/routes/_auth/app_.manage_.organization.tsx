import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/manage_/organization")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/manage/organization", search, replace: true });
  },
});
