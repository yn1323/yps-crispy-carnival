import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/manage_/managers_/invite-new")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/manage/managers/invite-new", search, replace: true });
  },
});
