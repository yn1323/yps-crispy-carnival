import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateAppBillingRouteSearch } from "@/src/components/features/AuthenticatedApp";

export const Route = createFileRoute("/_auth/app_/manage_/billing")({
  validateSearch: validateAppBillingRouteSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/manage/billing", search, replace: true });
  },
});
