import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppFilteredListRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/staff")({
  validateSearch: validateAppFilteredListRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/staff", search, replace: true });
  },
});
