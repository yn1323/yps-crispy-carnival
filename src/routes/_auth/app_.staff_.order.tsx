import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppFilteredListRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/staff_/order")({
  validateSearch: validateAppFilteredListRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/staff/order", search, replace: true });
  },
});
