import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/shifts_/$recruitmentId_/board")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/shifts/$recruitmentId/board",
      params: { recruitmentId: params.recruitmentId },
      search,
      replace: true,
    });
  },
});
