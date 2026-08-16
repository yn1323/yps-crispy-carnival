import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { useAppOrganizationScope, validateAppBillingRouteSearch } from "@/src/components/features/AuthenticatedApp";
import { AppManageBillingRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/app_/manage_/billing")({
  validateSearch: validateAppBillingRouteSearch,
  head: () => buildAppManagePageHead("プランと支払い"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageBillingRoute,
});

function AppManageBillingRoute() {
  const organization = useAppOrganizationScope();
  const navigate = Route.useNavigate();
  const { stripe } = Route.useSearch();
  const handleStripeResult = useCallback(() => {
    void navigate({
      search: (previous) => ({ ...previous, stripe: undefined }),
      replace: true,
    });
  }, [navigate]);
  return (
    <AppManageBillingRoutePage
      organizationId={organization.organizationId}
      memberStatus={organization.memberStatus}
      stripeResult={stripe}
      onStripeResultHandled={handleStripeResult}
    />
  );
}
