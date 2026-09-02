import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/staff_/$personId_/shops/$shopId")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/staff/$personId/shops/$shopId",
      params: { personId: params.personId, shopId: params.shopId },
      search,
      replace: true,
    });
  },
});
