import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppOrganizationRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/staff_/order")({
  validateSearch: validateAppOrganizationRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/staff", search, replace: true });
  },
});
