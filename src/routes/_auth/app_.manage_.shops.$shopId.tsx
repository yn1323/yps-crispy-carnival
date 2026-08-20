import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/manage_/shops/$shopId")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/manage/shops/$shopId",
      params: { shopId: params.shopId },
      search,
      replace: true,
    });
  },
});
