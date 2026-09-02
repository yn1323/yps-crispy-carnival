import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppFilteredListRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/actions")({
  validateSearch: validateAppFilteredListRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/actions", search, replace: true });
  },
});
