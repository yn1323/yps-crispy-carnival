import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/staff_/$personId")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/staff/$personId",
      params: { personId: params.personId },
      search,
      replace: true,
    });
  },
});
