import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppFilteredListRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/shifts")({
  validateSearch: validateAppFilteredListRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/shifts", search, replace: true });
  },
});
